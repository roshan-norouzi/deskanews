import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ModulesModule } from './modules/modules.module';
import { TenantModule } from './tenant/tenant.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlatformAdminModule } from './admin/platform-admin.module';

@Module({
  imports: [
    AuthModule,
    TenantModule,
    ModulesModule,
    HealthModule,
    NotificationsModule,
    PlatformAdminModule,
  ],
  exports: [
    AuthModule,
    TenantModule,
    ModulesModule,
  ],
})
export class PlatformModule {}
