import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getDefaultPermissionsForTenantRole,
  TENANT_ROLES,
} from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const tenantMode = this.config.get<string>('TENANT_MODE', 'multi');
    let tenantId = request.headers['x-tenant-id'] as string | undefined;

    if (tenantMode === 'single') {
      const defaultSlug = this.config.get<string>('DEFAULT_TENANT_SLUG', 'default');
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: defaultSlug } });
      if (!tenant) throw new BadRequestException('سازمان پیش‌فرض یافت نشد');
      tenantId = tenant.id;
    }

    if (!tenantId) {
      throw new BadRequestException('شناسه سازمان الزامی است');
    }

    if (user.role === 'super_admin') {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { isActive: true, status: true },
      });
      if (!tenant) throw new BadRequestException('سازمان یافت نشد');
      if (!tenant.isActive || tenant.status !== 'active') {
        throw new ForbiddenException('این سازمان غیرفعال است');
      }
      request.tenant = { tenantId, memberRole: 'owner' };
      request.user.permissions = ['*'];
      return true;
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      include: { tenant: { select: { isActive: true, status: true } } },
    });

    if (!member) {
      throw new ForbiddenException('دسترسی به این سازمان مجاز نیست');
    }

    if (!member.tenant.isActive || (member.tenant.status && member.tenant.status !== 'active')) {
      throw new ForbiddenException('این سازمان غیرفعال است');
    }

    if (member.status && member.status !== 'active') {
      throw new ForbiddenException('عضویت شما در این سازمان فعال نیست');
    }

    const hasAdministrativeRole = [TENANT_ROLES.OWNER, TENANT_ROLES.ADMIN].includes(
      member.role as typeof TENANT_ROLES.OWNER,
    );
    request.user.permissions = hasAdministrativeRole
      ? ['*']
      : getDefaultPermissionsForTenantRole(member.role);

    request.tenant = { tenantId, memberRole: member.role };
    return true;
  }
}
