import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TENANT_ROLES, NEWSROOM_ALL_SERVICES, isOrganizationAssignablePermission, normalizeDigits, normalizeNewsroomServiceIds, permissionsForPicker } from '@deska/shared';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TENANT_PUBLISHING_PORT, type TenantPublishingPort } from '../../contracts/tenant-publishing.port';
import { UsageTrackingService } from '../usage/usage-tracking.service';
import { BillingService } from '../../common/services/billing.service';
type InvitationWithTenant = Prisma.TenantInvitationGetPayload<{ include: { tenant: true } }>;

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    @Inject(TENANT_PUBLISHING_PORT) private readonly tenantPublishing: TenantPublishingPort,
    private readonly usageTracking: UsageTrackingService,
    private readonly billing: BillingService,
  ) {}

  async findAll(userId: string, isSuperAdmin: boolean) {
    if (isSuperAdmin) {
      return this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1000,
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

    const tenant = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug.toLowerCase(),
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

    await this.tenantPublishing.ensureTenantSubscriptions(tenant.id);
    return tenant;
  }

  async findOne(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { members: true } },
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
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.settings !== undefined && {
          settings: dto.settings as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async searchPlatformUsers(tenantId: string, query: string, memberRole: string) {
    this.assertOwner(memberRole);
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
      },
      orderBy: { name: 'asc' },
      take: 12,
    });

    return users.map(({ tenantMembers, ...user }) => ({
      ...user,
      membershipStatus: tenantMembers[0]?.status ?? null,
    }));
  }

  async addMember(
    tenantId: string,
    dto: AddMemberDto,
    memberRole: string,
    addedByUserId?: string,
  ) {
    this.assertOwner(memberRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    const platformUser = await this.prisma.user.findFirst({
      where: { id: dto.userId, isActive: true, status: 'active' },
      select: { id: true, email: true, name: true, phone: true },
    });
    if (!platformUser) throw new NotFoundException('کاربر فعال پلتفرم یافت نشد');

    const membership = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: platformUser.id } },
    });
    if (membership) throw new ConflictException('این کاربر قبلاً عضو سازمان است');

    const access = await this.resolveMemberAccess(tenantId, dto.permissions, dto.newsroomServiceIds);
    await this.prisma.tenantMember.create({
      data: {
        tenantId,
        userId: platformUser.id,
        role: TENANT_ROLES.MEMBER,
        permissions: access.permissions,
        newsroomServiceIds: access.newsroomServiceIds,
        status: 'active',
        jobTitle: dto.jobTitle?.trim() || null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: addedByUserId,
        action: 'organization.member_added',
        entityType: 'TenantMember',
        entityId: platformUser.id,
        changes: { permissions: access.permissions, newsroomServiceIds: access.newsroomServiceIds },
      },
    });

    return this.getMember(tenantId, platformUser.id);
  }

  async getUsage(tenantId: string) {
    return this.usageTracking.getTenantUsage(tenantId);
  }

  async getWallet(tenantId: string, memberRole: string) {
    this.assertOwner(memberRole);
    return this.billing.walletSnapshot(tenantId);
  }

  async createWalletPayment(tenantId: string, packageId: string, memberRole: string) {
    this.assertOwner(memberRole);
    const payment = await this.billing.createPaymentForPackage(tenantId, packageId);
    return {
      payment,
      message: 'درخواست پرداخت ثبت شد. پس از تأیید درگاه، توکن به کیف پول واریز می‌شود.',
    };
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
    this.assertOwner(memberRole);

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
          jobTitle: dto.jobTitle?.trim() || null,
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
            jobTitle: (invitation.metadata as { jobTitle?: string | null } | null)?.jobTitle ?? null,
          },
        });

        return {
          tenantId: invitation.tenantId,
          tenantName: invitation.tenant.name,
          role: invitation.role,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('این کاربر قبلاً عضو سازمان است');
      }
      throw error;
    }
  }

  async listMembers(tenantId: string, requesterRole: string) {
    this.assertMember(requesterRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

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

    return members.map((member) => this.serializeMember(member));
  }

  async updateMember(
    tenantId: string,
    userId: string,
    dto: UpdateMemberDto,
    requesterRole: string,
  ) {
    this.assertOwner(requesterRole);

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
      throw new NotFoundException('عضو یافت نشد');
    }

    if (member.role === TENANT_ROLES.OWNER) {
      throw new ForbiddenException('دسترسی‌های مالک سازمان قابل تغییر نیست');
    }

    const permissions = dto.permissions !== undefined ? this.normalizeAssignablePermissions([...new Set(dto.permissions)]) : member.permissions;
    const newsroomServiceIds = dto.newsroomServiceIds !== undefined || dto.permissions !== undefined
      ? await this.resolveNewsroomServiceIds(tenantId, permissions, dto.newsroomServiceIds ?? member.newsroomServiceIds)
      : member.newsroomServiceIds;

    await this.prisma.tenantMember.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: {
        ...(dto.permissions !== undefined ? { permissions } : {}),
        ...(dto.newsroomServiceIds !== undefined || dto.permissions !== undefined ? { newsroomServiceIds } : {}),
        ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle || null } : {}),
      },
    });

    return this.getMember(tenantId, userId);
  }

  async removeMember(
    tenantId: string,
    userId: string,
    requesterUserId: string,
    requesterRole: string,
  ) {
    this.assertOwner(requesterRole);

    if (userId === requesterUserId) {
      throw new BadRequestException('امکان حذف حساب خودتان وجود ندارد');
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!member) {
      throw new NotFoundException('عضو یافت نشد');
    }

    if (member.role === TENANT_ROLES.OWNER) {
      throw new ForbiddenException('امکان حذف مالک سازمان وجود ندارد');
    }

    await this.prisma.tenantMember.delete({
      where: { tenantId_userId: { tenantId, userId } },
    });

    return { success: true };
  }

  private async getMember(tenantId: string, userId: string) {
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
      throw new NotFoundException('عضو یافت نشد');
    }

    return this.serializeMember(member);
  }

  private serializeMember(member: {
    userId: string;
    role: string;
    permissions: string[];
    newsroomServiceIds: string[];
    status: string;
    jobTitle: string | null;
    joinedAt: Date;
    user: { id: string; email: string; name: string; avatarUrl: string | null; isActive: boolean };
  }) {
    return {
      userId: member.userId,
      role: member.role,
      permissions: member.permissions,
      newsroomServiceIds: member.newsroomServiceIds,
      status: member.status,
      jobTitle: member.jobTitle,
      joinedAt: member.joinedAt,
      user: member.user,
    };
  }

  private async resolveNewsroomServiceIds(
    tenantId: string,
    permissions: string[],
    requested: string[] | undefined,
  ) {
    const normalized = normalizeNewsroomServiceIds(permissions, requested);
    if (!normalized.length || normalized.includes(NEWSROOM_ALL_SERVICES)) return normalized;
    const allowed = await this.prisma.destinationCategory.findMany({
      where: { tenantId, id: { in: normalized }, status: { in: ['approved', 'pending'] } },
      select: { id: true },
    });
    const valid = new Set(allowed.map((row) => row.id));
    const next = normalized.filter((id) => valid.has(id));
    if (!next.length) throw new BadRequestException('دسترسی سرویس اتاق خبر نامعتبر است');
    return next;
  }

  private normalizeAssignablePermissions(permissions: string[]): string[] {
    const granular = permissionsForPicker(permissions);
    const explicit = permissions.filter((key) => isOrganizationAssignablePermission(key));
    const merged = [...new Set([...granular, ...explicit])];
    if (!merged.length) {
      throw new BadRequestException('حداقل یک دسترسی منوی معتبر انتخاب کنید');
    }
    return merged;
  }

  private async resolveMemberAccess(
    tenantId: string,
    permissions: string[],
    requestedServiceIds?: string[],
  ) {
    const nextPermissions = this.normalizeAssignablePermissions(permissions);
    return {
      permissions: nextPermissions,
      newsroomServiceIds: await this.resolveNewsroomServiceIds(tenantId, nextPermissions, requestedServiceIds),
    };
  }

  private assertOwner(memberRole: string) {
    if (memberRole !== TENANT_ROLES.OWNER) {
      throw new ForbiddenException('این عملیات فقط در اختیار مالک سازمان است');
    }
  }

  private assertMember(memberRole: string) {
    const allowed = Object.values(TENANT_ROLES);
    if (!allowed.includes(memberRole as typeof TENANT_ROLES.OWNER)) {
      throw new ForbiddenException('دسترسی به اعضای سازمان مجاز نیست');
    }
  }

  async listInvitations(tenantId: string, requesterRole: string) {
    this.assertOwner(requesterRole);
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
    this.assertOwner(requesterRole);
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
    this.assertOwner(requesterRole);
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
