import { Module } from '@nestjs/common';
import { DashboardModule } from './dashboard/dashboard.module';
import { SmartPublishingModule } from './smart-publishing/smart-publishing.module';

@Module({
  imports: [
    DashboardModule,
    SmartPublishingModule,
  ],
  exports: [
    DashboardModule,
    SmartPublishingModule,
  ],
})
export class BusinessModulesModule {}
