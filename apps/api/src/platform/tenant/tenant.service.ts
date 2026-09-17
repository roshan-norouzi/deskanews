import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MODULE_CATALOG, TENANT_ROLES, normalizeDigits } from '@deska/shared';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateEmployeeCodeSettingsDto } from './dto/update-employee-code-settings.dto';
import { ensureEmployeeForUser, syncTenantMemberEmployees } from './tenant-employee-sync';
import { serializeEmployeeForApi } from './employee-profile-backfill';

type InvitationWithTenant = Prisma.TenantInvitationGetPayload<{ include: { tenant: true } }>;

interface InvitationEmployeeMetadata {
  employeeCode?: string | null;
  jobTitle?: string | null;
  status?: string | null;
  hireDate?: string | null;
}

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, isSuperAdmin: boolean) {
    if (isSuperAdmin) {
      return this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          primaryOwner: { select: { id: true, name: true, email: true } },
          _count: { select: { members: true } },
        },
      });
    }

    const memberships = await this.prisma.tenantMember.findMany({
      where: { userId, status: 'active' },
      include: {
        tenant: {
          include: {
            primaryOwner: { select: { id: true, name: true, email: true } },
            _count: { select: { members: true } },
          },
        },
      },
    });

    return memberships.map((m: { tenant: Record<string, unknown>; role: string }) => ({
      ...m.tenant,
      memberRole: m.role,
      membershipStatus: (m as { status?: string }).status ?? 'active',
      joinedAt: (m as { joinedAt?: Date }).joinedAt,
    }));
  }

  async create(userId: string, dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('این شناسه URL قبلاً استفاده شده است');
    }

    const plan = dto.plan ?? 'starter';

    const tenant = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug.toLowerCase(),
          plan,
          locale: dto.locale ?? 'fa-IR',
          status: 'active',
          createdByUserId: userId,
          primaryOwnerUserId: userId,
        },
      });

      await tx.tenantMember.create({
        data: {
          tenantId: created.id,
          userId,
          role: TENANT_ROLES.OWNER,
          status: 'active',
        },
      });

      for (const mod of MODULE_CATALOG) {
        const isCore = 'isCore' in mod ? mod.isCore : false;
        await tx.moduleDefinition.upsert({
          where: { id: mod.id },
          create: {
            id: mod.id,
            name: mod.name,
            domain: mod.domain,
            version: mod.version,
            dependencies: [...mod.dependencies],
            isCore,
          },
          update: {},
        });

        await tx.tenantModule.create({
          data: {
            tenantId: created.id,
            moduleId: mod.id,
            enabled: isCore,
          },
        });
      }

      await tx.numberSequence.create({
        data: {
          tenantId: created.id,
          code: 'employee',
          prefix: 'EMP-',
          suffix: '',
          nextNumber: 1,
          padding: 4,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: created.id,
          userId,
          action: 'organization.created',
          entityType: 'Tenant',
          entityId: created.id,
          changes: { name: created.name, slug: created.slug },
        },
      });

      return created;
    });

    return tenant;
  }

  async findOne(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { members: true, modules: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    return tenant;
  }

  async getCurrent(tenantId: string) {
    return this.findOne(tenantId);
  }

  async update(tenantId: string, dto: UpdateTenantDto, memberRole: string) {
    this.assertOwner(memberRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.plan !== undefined && { plan: dto.plan }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.settings !== undefined && {
          settings: dto.settings as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async getEmployeeCodeSettings(tenantId: string, memberRole: string) {
    this.assertOwner(memberRole);
    const sequence = await this.prisma.numberSequence.upsert({
      where: { tenantId_code: { tenantId, code: 'employee' } },
      create: { tenantId, code: 'employee', prefix: 'EMP-', suffix: '', nextNumber: 1, padding: 4 },
      update: {},
      select: { prefix: true, suffix: true, padding: true },
    });
    return sequence;
  }

  async updateEmployeeCodeSettings(
    tenantId: string,
    dto: UpdateEmployeeCodeSettingsDto,
    memberRole: string,
  ) {
    this.assertOwner(memberRole);
    const current = await this.getEmployeeCodeSettings(tenantId, memberRole);
    return this.prisma.numberSequence.update({
      where: { tenantId_code: { tenantId, code: 'employee' } },
      data: {
        prefix: dto.prefix ?? current.prefix,
        suffix: dto.suffix ?? current.suffix,
      },
      select: { prefix: true, suffix: true, padding: true },
    });
  }

  async searchPlatformUsers(tenantId: string, query: string, memberRole: string) {
    this.assertAdmin(memberRole);
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedPhone = normalizeDigits(query).replace(/[^0-9+]/g, '');
    const rawPhone = query.trim().replace(/[\s()-]/g, '');
    if (normalizedQuery.length < 5 && normalizedPhone.length < 5) {
      throw new BadRequestException('برای جستجو حداقل ۵ کاراکتر وارد کنید');
    }
    const searchConditions: Prisma.UserWhereInput[] = [
      { email: { contains: normalizedQuery, mode: 'insensitive' } },
      ...(normalizedPhone.length >= 5 ? [{ phone: { contains: normalizedPhone } }] : []),
      ...(normalizedPhone.startsWith('09')
        ? [{ phone: { contains: `+98${normalizedPhone.slice(1)}` } }]
        : []),
      ...(normalizedPhone.startsWith('+98')
        ? [{ phone: { contains: `0${normalizedPhone.slice(3)}` } }]
        : []),
      ...(rawPhone.length >= 5 && rawPhone !== normalizedPhone ? [{ phone: { contains: rawPhone } }] : []),
    ];

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        status: 'active',
        OR: searchConditions,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        tenantMembers: { where: { tenantId }, select: { status: true } },
        receivedInvitations: {
          where: { tenantId, status: 'pending', expiresAt: { gt: new Date() } },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
      take: 12,
    });

    return users.map(({ tenantMembers, receivedInvitations, ...user }) => ({
      ...user,
      membershipStatus: tenantMembers[0]?.status ?? null,
      pendingInvitationId: receivedInvitations[0]?.id ?? null,
    }));
  }

  async listMyInvitations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    await this.prisma.tenantInvitation.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lt: new Date() },
        OR: [{ invitedUserId: userId }, { email: user.email.toLowerCase() }],
      },
      data: { status: 'expired' },
    });

    return this.prisma.tenantInvitation.findMany({
      where: {
        status: 'pending',
        expiresAt: { gt: new Date() },
        tenant: { status: 'active', isActive: true },
        OR: [{ invitedUserId: userId }, { email: user.email.toLowerCase() }],
      },
      select: {
        id: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        tenant: { select: { id: true, name: true, slug: true, plan: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async inviteMember(
    tenantId: string,
    dto: InviteMemberDto,
    memberRole: string,
    invitedByUserId?: string,
  ) {
    this.assertAdmin(memberRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    if (dto.role === TENANT_ROLES.OWNER) {
      throw new ForbiddenException('امکان تعیین نقش مالک از این مسیر وجود ندارد');
    }

    const invitedUser = await this.prisma.user.findFirst({
      where: { id: dto.userId, isActive: true, status: 'active' },
      select: { id: true, email: true, name: true, phone: true },
    });
    if (!invitedUser) throw new NotFoundException('کاربر فعال پلتفرم یافت نشد');

    const membership = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: invitedUser.id } },
    });
    if (membership) throw new ConflictException('این کاربر قبلاً عضو سازمان است');

    if (dto.employeeCode?.trim()) {
      const duplicateCode = await this.prisma.employee.findFirst({
        where: { tenantId, employeeCode: dto.employeeCode.trim() },
        select: { id: true },
      });
      if (duplicateCode) throw new ConflictException('این کد پرسنلی قبلاً استفاده شده است');
    }

    const pendingInvite = await this.prisma.tenantInvitation.findFirst({
      where: {
        tenantId,
        status: 'pending',
        expiresAt: { gt: new Date() },
        OR: [{ invitedUserId: invitedUser.id }, { email: invitedUser.email.toLowerCase() }],
      },
    });

    if (pendingInvite) {
      throw new ConflictException('دعوت‌نامه فعالی برای این ایمیل وجود دارد');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.tenantInvitation.create({
      data: {
        tenantId,
        email: invitedUser.email.toLowerCase(),
        invitedUserId: invitedUser.id,
        role: dto.role,
        token: tokenHash,
        tokenHash,
        status: 'pending',
        invitedByUserId,
        expiresAt,
        metadata: {
          employeeCode: dto.employeeCode?.trim() || null,
          jobTitle: dto.jobTitle?.trim() || null,
          status: dto.status || 'active',
          hireDate: dto.hireDate || null,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      user: invitedUser,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvite(userId: string, dto: AcceptInviteDto) {
    const tokenHash = this.hashInvitationToken(dto.token);
    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: {
        OR: [{ tokenHash }, { token: tokenHash }, { token: dto.token }],
      },
      include: { tenant: true },
    });

    if (!invitation) throw new NotFoundException('دعوت‌نامه یافت نشد');
    return this.acceptResolvedInvitation(userId, invitation);
  }

  async acceptMyInvitation(userId: string, invitationId: string) {
    const invitation = await this.prisma.tenantInvitation.findUnique({
      where: { id: invitationId },
      include: { tenant: true },
    });
    if (!invitation) throw new NotFoundException('دعوت‌نامه یافت نشد');
    return this.acceptResolvedInvitation(userId, invitation);
  }

  async rejectMyInvitation(userId: string, invitationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const invitation = await this.prisma.tenantInvitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        email: true,
        invitedUserId: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!invitation) throw new NotFoundException('دعوت‌نامه یافت نشد');
    if (
      (invitation.invitedUserId && invitation.invitedUserId !== userId)
      || (!invitation.invitedUserId && invitation.email.toLowerCase() !== user.email.toLowerCase())
    ) {
      throw new ForbiddenException('این دعوت‌نامه برای حساب کاربری شما صادر نشده است');
    }
    if (invitation.status !== 'pending') {
      throw new BadRequestException('فقط دعوت‌نامه در انتظار قابل رد کردن است');
    }

    const rejected = await this.prisma.tenantInvitation.updateMany({
      where: {
        id: invitation.id,
        status: 'pending',
        accepted: false,
        expiresAt: { gt: new Date() },
      },
      data: { status: 'rejected' },
    });
    if (rejected.count !== 1) {
      throw new BadRequestException('این دعوت‌نامه دیگر قابل رد کردن نیست');
    }
    return { success: true, invitationId: invitation.id, status: 'rejected' };
  }

  private async acceptResolvedInvitation(userId: string, invitation: InvitationWithTenant) {
    if (invitation.accepted || invitation.status === 'accepted') {
      throw new BadRequestException('این دعوت‌نامه قبلاً پذیرفته شده است');
    }

    if (invitation.status === 'revoked' || invitation.revokedAt) {
      throw new BadRequestException('این دعوت‌نامه لغو شده است');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('دعوت‌نامه منقضی شده است');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    if (invitation.invitedUserId && invitation.invitedUserId !== userId) {
      throw new ForbiddenException('این دعوت‌نامه برای حساب کاربری شما صادر نشده است');
    }
    if (!invitation.invitedUserId && user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException('این دعوت‌نامه برای ایمیل شما صادر نشده است');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.tenantMember.findUnique({
          where: { tenantId_userId: { tenantId: invitation.tenantId, userId } },
        });
        if (existing) throw new ConflictException('شما قبلاً عضو این سازمان هستید');

        const acceptedAt = new Date();
        const claimed = await tx.tenantInvitation.updateMany({
          where: {
            id: invitation.id,
            status: 'pending',
            accepted: false,
            revokedAt: null,
            expiresAt: { gt: acceptedAt },
            ...(invitation.invitedUserId
              ? { invitedUserId: userId }
              : { invitedUserId: null, email: user.email.toLowerCase() }),
          },
          data: { accepted: true, status: 'accepted', acceptedAt },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException('این دعوت‌نامه دیگر قابل پذیرش نیست');
        }

        await tx.tenantMember.create({
          data: {
            tenantId: invitation.tenantId,
            userId,
            role: invitation.role,
            status: 'active',
            jobTitle: (invitation.metadata as unknown as InvitationEmployeeMetadata | null)?.jobTitle ?? null,
          },
        });

        const employee = await ensureEmployeeForUser(
          tx as unknown as PrismaService,
          invitation.tenantId,
          userId,
          acceptedAt,
        );
        await this.applyInvitationEmployeeMetadata(
          tx as unknown as PrismaService,
          invitation,
          employee.id,
        );

        return {
          tenantId: invitation.tenantId,
          tenantName: invitation.tenant.name,
          role: invitation.role,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('اطلاعات پرسنلی با یکی از کارمندان موجود تداخل دارد');
      }
      throw error;
    }
  }

  private async applyInvitationEmployeeMetadata(
    prisma: PrismaService,
    invitation: InvitationWithTenant,
    employeeId: string,
  ) {
    const metadata = (invitation.metadata ?? {}) as unknown as InvitationEmployeeMetadata;
    const update: Prisma.EmployeeUpdateInput = {};

    if (metadata.employeeCode) update.employeeCode = metadata.employeeCode;
    if (metadata.jobTitle) update.jobTitle = metadata.jobTitle;
    if (metadata.status) update.status = metadata.status;
    if (metadata.hireDate) update.hireDate = new Date(metadata.hireDate);

    if (Object.keys(update).length > 0) {
      await prisma.employee.update({ where: { id: employeeId }, data: update });
    }
  }

  async listMembers(tenantId: string, requesterRole: string) {
    this.assertMember(requesterRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    // Legacy releases could contain memberships without a matching employee.
    // Avoid the former N+1 write pass on every GET; run reconciliation only
    // when a concrete missing relation is detected.
    const missingEmployee = await this.prisma.tenantMember.findFirst({
      where: {
        tenantId,
        user: { employees: { none: { tenantId } } },
      },
      select: { userId: true },
    });
    if (missingEmployee) await syncTenantMemberEmployees(this.prisma, tenantId);

    const members = await this.prisma.tenantMember.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        userId: { in: members.map((member) => member.userId) },
      },
      include: { department: true },
    });

    const employeeByUserId = new Map(
      employees
        .filter((employee) => employee.userId)
        .map((employee) => [employee.userId as string, employee]),
    );

    return members.map((member) => ({
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      user: member.user,
      employee: (() => {
        const emp = employeeByUserId.get(member.userId);
        return emp ? serializeEmployeeForApi(emp) : null;
      })(),
    }));
  }

  async listDepartments(tenantId: string, requesterRole: string) {
    this.assertAdmin(requesterRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    return this.prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async updateMember(
    tenantId: string,
    userId: string,
    dto: UpdateMemberDto,
    requesterRole: string,
  ) {
    this.assertAdmin(requesterRole);

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    if (member.role === TENANT_ROLES.OWNER && dto.role && dto.role !== TENANT_ROLES.OWNER) {
      throw new ForbiddenException('نقش مالک سازمان قابل تغییر نیست');
    }

    if (dto.role === TENANT_ROLES.OWNER) {
      throw new ForbiddenException('امکان تعیین نقش مالک از این مسیر وجود ندارد');
    }

    if (dto.employeeCode) {
      const duplicateCode = await this.prisma.employee.findFirst({
        where: {
          tenantId,
          employeeCode: dto.employeeCode,
          NOT: { userId },
        },
      });
      if (duplicateCode) {
        throw new ConflictException('این کد پرسنلی قبلاً استفاده شده است');
      }
    }

    if (dto.role && member.role !== TENANT_ROLES.OWNER) {
      await this.prisma.tenantMember.update({
        where: { tenantId_userId: { tenantId, userId } },
        data: { role: dto.role, roleChangedAt: new Date() },
      });
    }

    const employee = await ensureEmployeeForUser(
      this.prisma,
      tenantId,
      userId,
      member.joinedAt,
    );

    const employeeUpdate: Prisma.EmployeeUpdateInput = {};

    if (dto.employeeCode !== undefined) {
      employeeUpdate.employeeCode = dto.employeeCode;
    }
    if (dto.jobTitle !== undefined) {
      employeeUpdate.jobTitle = dto.jobTitle || null;
    }
    if (dto.status !== undefined) {
      employeeUpdate.status = dto.status;
    }
    if (dto.hireDate !== undefined) {
      employeeUpdate.hireDate = dto.hireDate ? new Date(dto.hireDate) : null;
    }
    if (Object.keys(employeeUpdate).length > 0) {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: employeeUpdate,
      });
    }

    return this.getMemberWithEmployee(tenantId, userId);
  }

  async removeMember(
    tenantId: string,
    userId: string,
    requesterUserId: string,
    requesterRole: string,
  ) {
    this.assertAdmin(requesterRole);

    if (userId === requesterUserId) {
      throw new BadRequestException('امکان حذف حساب خودتان وجود ندارد');
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!member) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    if (member.role === TENANT_ROLES.OWNER) {
      throw new ForbiddenException('امکان حذف مالک سازمان وجود ندارد');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, userId },
    });

    await this.prisma.$transaction(async (tx) => {
      if (employee) {
        await tx.employee.update({ where: { id: employee.id }, data: { status: 'inactive' } });
      }
      await tx.tenantMember.delete({
        where: { tenantId_userId: { tenantId, userId } },
      });
    });

    return { success: true };
  }

  private async getMemberWithEmployee(tenantId: string, userId: string) {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, userId },
      include: { department: true },
    });

    return {
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      user: member.user,
      employee: employee ? serializeEmployeeForApi(employee) : null,
    };
  }

  private assertAdmin(memberRole: string) {
    const allowed = [TENANT_ROLES.OWNER, TENANT_ROLES.ADMIN];
    if (!allowed.includes(memberRole as typeof TENANT_ROLES.OWNER)) {
      throw new ForbiddenException('فقط مالک یا مدیر ارشد می‌تواند این عملیات را انجام دهد');
    }
  }

  private assertOwner(memberRole: string) {
    if (memberRole !== TENANT_ROLES.OWNER) {
      throw new ForbiddenException('تنظیمات سازمان فقط در اختیار مالک سازمان است');
    }
  }

  private assertMember(memberRole: string) {
    const allowed = Object.values(TENANT_ROLES);
    if (!allowed.includes(memberRole as typeof TENANT_ROLES.OWNER)) {
      throw new ForbiddenException('دسترسی به اعضای سازمان مجاز نیست');
    }
  }

  async listInvitations(tenantId: string, requesterRole: string) {
    this.assertAdmin(requesterRole);
    await this.prisma.tenantInvitation.updateMany({
      where: { tenantId, status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
    return this.prisma.tenantInvitation.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        invitedUser: { select: { id: true, name: true, email: true, phone: true } },
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(tenantId: string, invitationId: string, requesterRole: string) {
    this.assertAdmin(requesterRole);
    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: { id: invitationId, tenantId },
    });
    if (!invitation) throw new NotFoundException('دعوت‌نامه یافت نشد');
    if (invitation.status !== 'pending') {
      throw new BadRequestException('فقط دعوت‌نامه در انتظار قابل لغو است');
    }
    return this.prisma.tenantInvitation.update({
      where: { id: invitationId },
      data: { status: 'revoked', revokedAt: new Date() },
      select: { id: true, status: true, revokedAt: true },
    });
  }

  async resendInvitation(
    tenantId: string,
    invitationId: string,
    requesterRole: string,
    invitedByUserId?: string,
  ) {
    this.assertAdmin(requesterRole);
    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: { id: invitationId, tenantId },
    });
    if (!invitation) throw new NotFoundException('دعوت‌نامه یافت نشد');
    if (invitation.status === 'accepted') {
      throw new BadRequestException('دعوت‌نامه پذیرفته‌شده قابل ارسال مجدد نیست');
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashInvitationToken(token);
    const updated = await this.prisma.tenantInvitation.update({
      where: { id: invitationId },
      data: {
        token: tokenHash,
        tokenHash,
        status: 'pending',
        accepted: false,
        revokedAt: null,
        acceptedAt: null,
        invitedByUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { id: updated.id, email: updated.email, role: updated.role, expiresAt: updated.expiresAt };
  }

  private hashInvitationToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
