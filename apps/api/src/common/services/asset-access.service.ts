import { ForbiddenException, Injectable } from '@nestjs/common';
import { PLATFORM_ROLES } from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AssetAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertTenantAssetAccess(userId: string, userRole: string, tenantId: string): Promise<void> {
    if (userRole === PLATFORM_ROLES.SUPER_ADMIN || userRole === PLATFORM_ROLES.ADMIN) return;
    const membership = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { status: true, tenant: { select: { isActive: true, status: true } } },
    });
    if (
      !membership
      || membership.status !== 'active'
      || !membership.tenant.isActive
      || membership.tenant.status !== 'active'
    ) {
      throw new ForbiddenException('دسترسی به فایل این سازمان مجاز نیست');
    }
  }
}
