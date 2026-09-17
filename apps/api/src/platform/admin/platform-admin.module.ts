import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SmartPublishingModule } from '../../modules/smart-publishing/smart-publishing.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [AuthModule, SmartPublishingModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
