import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PLATFORM_ROLES, TENANT_ROLES } from '@deska/shared';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { AuthUser } from '../../common/decorators/params.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeletePlatformEntityDto } from './dto/delete-platform-entity.dto';
import type { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { AuthService } from '../auth/auth.service';

type ListQuery = { q?: string; status?: string; role?: string; page?: string; limit?: string };

@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async overview(actor: AuthUser) {
    this.assertAdmin(actor);
    const [users, activeUsers, organizations, activeOrganizations, memberships] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'active', isActive: true } }),
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'active', isActive: true } }),
      this.prisma.tenantMember.count({ where: { status: 'active' } }),
    ]);
    return { users, activeUsers, organizations, activeOrganizations, memberships };
  }

  async listUsers(actor: AuthUser, query: ListQuery) {
    this.assertAdmin(actor);
    const { skip, take, page } = this.pagination(query);
    const where: Prisma.UserWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.role && { role: query.role }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, phone: true, name: true, role: true, status: true,
          isActive: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true,
          tenantMembers: {
            select: {
              role: true, status: true, joinedAt: true,
              tenant: { select: { id: true, name: true, slug: true, status: true, primaryOwnerUserId: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }

  async createUser(actor: AuthUser, dto: CreatePlatformUserDto) {
    this.assertSuperAdmin(actor);
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('رمز عبور و تکرار آن یکسان نیست');
    }

    const user = await this.authService.registerUser({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: null,
        userId: actor.id,
        action: 'platform.user_created',
        entityType: 'User',
        entityId: user.id,
        changes: { createdRole: user.role },
      },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
    };
  }

  async getUser(actor: AuthUser, id: string) {
    this.assertAdmin(actor);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, phone: true, name: true, role: true, status: true,
        isActive: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true,
        tenantMembers: {
          select: {
            role: true, status: true, jobTitle: true, joinedAt: true, leftAt: true,
            tenant: { select: { id: true, name: true, slug: true, status: true, primaryOwnerUserId: true } },
          },
        },
        employees: { select: { id: true, tenantId: true, employeeCode: true, jobTitle: true, status: true } },
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    return user;
  }

  async updateUserStatus(actor: AuthUser, id: string, status: string) {
    this.assertAdmin(actor);
    if (id === actor.id && status !== 'active') {
      throw new BadRequestException('نمی‌توانید حساب فعال خودتان را مسدود یا غیرفعال کنید');
    }
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('کاربر یافت نشد');
    this.assertCanManageTarget(actor, target.role);
    const isActive = status === 'active';
    if (!isActive) {
      const ownedOrganizations = await this.prisma.tenant.count({
        where: { primaryOwnerUserId: id, status: 'active', isActive: true },
      });
      if (ownedOrganizations > 0) {
        throw new BadRequestException('پیش از غیرفعال‌کردن کاربر، مالکیت سازمان‌های فعال او را منتقل کنید');
      }
    }
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          status,
          isActive,
          ...(!isActive ? { sessionsInvalidatedAt: new Date() } : {}),
        },
      }),
      ...(!isActive ? [this.prisma.refreshToken.deleteMany({ where: { userId: id } })] : []),
      this.prisma.auditLog.create({
        data: { tenantId: null, userId: actor.id, action: 'platform.user_status_changed', entityType: 'User', entityId: id, changes: { status } },
      }),
    ]);
    return { id: user.id, status: user.status, isActive: user.isActive };
  }

  async updateUserRole(actor: AuthUser, id: string, role: string) {
    this.assertAdmin(actor);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('کاربر یافت نشد');
    this.assertCanManageTarget(actor, target.role);
    if (role === PLATFORM_ROLES.SUPER_ADMIN && actor.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('فقط مدیر کل می‌تواند مدیر کل دیگری تعیین کند');
    }
    if (id === actor.id && role !== actor.role) {
      throw new BadRequestException('نقش حساب خودتان را از این مسیر تغییر ندهید');
    }
    const user = await this.prisma.user.update({ where: { id }, data: { role } });
    await this.prisma.auditLog.create({
      data: { tenantId: null, userId: actor.id, action: 'platform.user_role_changed', entityType: 'User', entityId: id, changes: { from: target.role, to: role } },
    });
    return { id: user.id, role: user.role };
  }

  async deleteUser(actor: AuthUser, id: string, confirmation: DeletePlatformEntityDto) {
    this.assertAdmin(actor);
    if (id === actor.id) throw new BadRequestException('حذف حساب کاربری فعال خودتان مجاز نیست');

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        primaryOwnedTenants: { select: { id: true, name: true } },
      },
    });
    if (!target) throw new NotFoundException('کاربر یافت نشد');
    this.assertCanManageTarget(actor, target.role);
    this.assertDeleteConfirmation(confirmation, target.email);

    if (target.primaryOwnedTenants.length > 0) {
      throw new BadRequestException('پیش از حذف کاربر، مالکیت همه سازمان‌های او را منتقل کنید');
    }
    if (target.role === PLATFORM_ROLES.SUPER_ADMIN) {
      const superAdminCount = await this.prisma.user.count({
        where: { role: PLATFORM_ROLES.SUPER_ADMIN, isActive: true, status: 'active' },
      });
      if (superAdminCount <= 1) throw new BadRequestException('آخرین مدیر کل فعال قابل حذف نیست');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { userId: id } });
      await tx.project.updateMany({ where: { managerId: id }, data: { managerId: null } });
      await tx.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.approvalStep.deleteMany({ where: { approverId: id } });
      await tx.publishArticle.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.tenantInvitation.updateMany({ where: { invitedByUserId: id }, data: { invitedByUserId: null } });
      await tx.tenantInvitation.deleteMany({
        where: {
          OR: [
            { invitedUserId: id },
            { email: { equals: target.email, mode: 'insensitive' } },
          ],
        },
      });
      await tx.documentFile.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } });
      await tx.calendarEvent.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.calendarEventAttendee.deleteMany({ where: { userId: id } });
      await tx.department.updateMany({ where: { managerId: id }, data: { managerId: null } });
      await tx.auditLog.deleteMany({
        where: { entityType: 'User', entityId: id },
      });
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId: null,
          userId: actor.id,
          action: 'platform.user_deleted',
          entityType: 'User',
          entityId: id,
          changes: { permanentlyDeleted: true },
        },
      });
    });

    return { success: true, deletedUserId: id };
  }

  async listOrganizations(actor: AuthUser, query: ListQuery) {
    this.assertAdmin(actor);
    const { skip, take, page } = this.pagination(query);
    const where: Prisma.TenantWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.q && { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { slug: { contains: query.q, mode: 'insensitive' } }] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          primaryOwner: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { members: true, modules: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }

  async getOrganization(actor: AuthUser, id: string) {
    this.assertAdmin(actor);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        primaryOwner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, status: true, role: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        invitations: { select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true } },
        _count: { select: { modules: true } },
      },
    });
    if (!tenant) throw new NotFoundException('سازمان یافت نشد');
    return tenant;
  }

  async updateOrganizationStatus(actor: AuthUser, id: string, status: string) {
    this.assertAdmin(actor);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('سازمان یافت نشد');
    const updated = await this.prisma.tenant.update({
      where: { id }, data: { status, isActive: status === 'active' },
    });
    await this.prisma.auditLog.create({
      data: { tenantId: id, userId: actor.id, action: 'platform.organization_status_changed', entityType: 'Tenant', entityId: id, changes: { from: tenant.status, to: status } },
    });
    return { id: updated.id, status: updated.status, isActive: updated.isActive };
  }

  async deleteOrganization(actor: AuthUser, id: string, confirmation: DeletePlatformEntityDto) {
    this.assertAdmin(actor);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryOwner: { select: { role: true } },
      },
    });
    if (!tenant) throw new NotFoundException('سازمان یافت نشد');
    if (tenant.primaryOwner?.role === PLATFORM_ROLES.SUPER_ADMIN && actor.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('حذف سازمان متعلق به مدیر کل فقط توسط مدیر کل مجاز است');
    }
    this.assertDeleteConfirmation(confirmation, tenant.slug);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId: null,
          userId: actor.id,
          action: 'platform.organization_deleted',
          entityType: 'Tenant',
          entityId: id,
          changes: { deletedName: tenant.name, deletedSlug: tenant.slug },
        },
      });
    });

    const storageCleanupComplete = await this.cleanupOrganizationStorage(id);

    return { success: true, deletedOrganizationId: id, storageCleanupComplete };
  }

  async transferOwnership(actor: AuthUser, tenantId: string, targetUserId: string) {
    this.assertSuperAdmin(actor);
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException('سازمان یافت نشد');

      const target = await tx.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        include: { user: { select: { isActive: true, status: true } } },
      });
      if (!target || target.status !== 'active' || !target.user.isActive || target.user.status !== 'active') {
        throw new NotFoundException('عضو فعال مقصد یافت نشد');
      }
      if (tenant.primaryOwnerUserId === targetUserId) {
        throw new BadRequestException('این کاربر هم‌اکنون مالک اصلی است');
      }

      const changedAt = new Date();
      await tx.tenantMember.updateMany({
        where: { tenantId, role: TENANT_ROLES.OWNER, userId: { not: targetUserId } },
        data: { role: TENANT_ROLES.ADMIN, roleChangedAt: changedAt },
      });
      await tx.tenantMember.update({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        data: { role: TENANT_ROLES.OWNER, roleChangedAt: changedAt },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { primaryOwnerUserId: targetUserId },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.id,
          action: 'platform.organization_ownership_transferred',
          entityType: 'Tenant',
          entityId: tenantId,
          changes: { fromUserId: tenant.primaryOwnerUserId, toUserId: targetUserId },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { success: true, primaryOwnerUserId: targetUserId };
  }

  private assertAdmin(actor: AuthUser) {
    if (![PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.ADMIN].includes(actor.role as 'super_admin')) {
      throw new ForbiddenException('دسترسی مدیریت پلتفرم مجاز نیست');
    }
  }

  private assertCanManageTarget(actor: AuthUser, targetRole: string) {
    if (targetRole === PLATFORM_ROLES.SUPER_ADMIN && actor.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('مدیریت حساب مدیر کل مجاز نیست');
    }
  }

  private assertSuperAdmin(actor: AuthUser) {
    if (actor.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('فقط مدیر کل سیستم می‌تواند مالکیت سازمان را منتقل کند');
    }
  }

  private assertDeleteConfirmation(confirmation: DeletePlatformEntityDto, expectedText: string) {
    if (!confirmation.confirmIrreversible || !confirmation.confirmCascade) {
      throw new BadRequestException('هر سه مرحله تأیید حذف باید تکمیل شوند');
    }
    if (confirmation.confirmationText.trim() !== expectedText) {
      throw new BadRequestException('متن تأیید حذف صحیح نیست');
    }
  }

  private async cleanupOrganizationStorage(tenantId: string): Promise<boolean> {
    const configuredRoot = process.env.STORAGE_PATH?.trim();
    const roots = configuredRoot
      ? [path.resolve(configuredRoot)]
      : [path.resolve(process.cwd(), 'storage'), path.resolve(process.cwd(), 'uploads')];

    try {
      for (const root of roots) {
        await fs.rm(this.safeChildPath(root, tenantId), { recursive: true, force: true });
        await fs.rm(this.safeChildPath(root, path.join('fonts', tenantId)), { recursive: true, force: true });
        await fs.rm(this.safeChildPath(root, path.join('cover-images', tenantId)), { recursive: true, force: true });
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Organization ${tenantId} was deleted, but storage cleanup needs attention: ${message}`);
      return false;
    }
  }

  private safeChildPath(root: string, child: string): string {
    const resolvedRoot = path.resolve(root);
    const resolvedChild = path.resolve(resolvedRoot, child);
    const relative = path.relative(resolvedRoot, resolvedChild);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('مسیر پاک‌سازی فضای ذخیره‌سازی معتبر نیست');
    }
    return resolvedChild;
  }

  private pagination(query: ListQuery) {
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const take = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '25', 10) || 25));
    return { page, take, skip: (page - 1) * take };
  }
}
