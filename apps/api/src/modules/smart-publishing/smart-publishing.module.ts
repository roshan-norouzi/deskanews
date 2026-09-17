import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SecretProtectionService } from './secret-protection.service';
import { PublishingFontFileController, PublishingImageFileController, SmartPublishingController, SocialPublishingMediaController } from './smart-publishing.controller';
import { SourceReaderService } from './source-reader.service';
import { SocialStudioService } from './social-studio.service';
import { WordPressClient } from './wordpress.client';
import { SocialNetworkPublisherService } from './social-network-publisher.service';
import { SocialCoverRendererService } from './social-cover-renderer.service';
import { DailyReportService } from './daily-report.service';
import { PublishingAutomationProcessor } from './publishing-automation.processor';
import { PublishingOperationsService } from './publishing-operations.service';
import { WordPressMediaService } from './wordpress-media.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SmartPublishingController, PublishingFontFileController, PublishingImageFileController, SocialPublishingMediaController],
  providers: [PublishingSettingsService, SecretProtectionService, GapGptClient, WordPressClient, WordPressMediaService, SourceReaderService, NewsroomService, SocialStudioService, SocialNetworkPublisherService, SocialCoverRendererService, DailyReportService, PublishingOperationsService, PublishingAutomationProcessor],
})
export class SmartPublishingModule {}
