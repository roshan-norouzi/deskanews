import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { NotificationService } from '../../common/services/audit.service';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ApiDeskaAuth } from '../../common/decorators/swagger.decorator';

@ApiDeskaAuth('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard)
export class NotificationsController {
  constructor(private notifications: NotificationService) {}

  @Get()
  list(@TenantCtx() tenant: TenantContext, @User() user: AuthUser) {
    return this.notifications.list(tenant.tenantId, user.id);
  }

  @Get('unread')
  unread(@TenantCtx() tenant: TenantContext, @User() user: AuthUser) {
    return this.notifications.list(tenant.tenantId, user.id, true);
  }

  @Get('summary')
  summary(@TenantCtx() tenant: TenantContext, @User() user: AuthUser) {
    return this.notifications.summary(tenant.tenantId, user.id);
  }

  @Patch('read-all')
  markAllRead(@TenantCtx() tenant: TenantContext, @User() user: AuthUser) {
    return this.notifications.markAllRead(tenant.tenantId, user.id);
  }

  @Patch(':id/read')
  markRead(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @User() user: AuthUser) {
    return this.notifications.markRead(tenant.tenantId, id, user.id);
  }
}
