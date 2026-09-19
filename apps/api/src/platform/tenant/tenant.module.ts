import { Module } from '@nestjs/common';
import { SmartPublishingModule } from '../../modules/smart-publishing/smart-publishing.module';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [SmartPublishingModule],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
