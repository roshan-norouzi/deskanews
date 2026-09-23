import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { TenantModule } from './tenant/tenant.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlatformAdminModule } from './admin/platform-admin.module';
import { PaymentsModule } from './payments/payments.module';
import { UsageTrackingModule } from './usage/usage-tracking.module';

@Module({
  imports: [
    UsageTrackingModule,
    AuthModule,
    TenantModule,
    HealthModule,
    NotificationsModule,
    PlatformAdminModule,
    PaymentsModule,
  ],
  exports: [
    AuthModule,
    TenantModule,
  ],
})
export class PlatformModule {}
