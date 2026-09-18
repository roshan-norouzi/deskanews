import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PlatformFeedService } from './platform-feed.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SecretProtectionService } from './secret-protection.service';
import { PublishingFontFileController, PublishingImageFileController, SmartPublishingController, SocialPublishingMediaController } from './smart-publishing.controller';
import { SafeHttpClient } from './safe-http.client';
import { SourceReaderService } from './source-reader.service';
import { SocialStudioService } from './social-studio.service';
import { WordPressClient } from './wordpress.client';
import { SocialNetworkPublisherService } from './social-network-publisher.service';
import { SocialCoverRendererService } from './social-cover-renderer.service';
import { PublishingAutomationProcessor } from './publishing-automation.processor';
import { PublishingOperationsService } from './publishing-operations.service';
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SmartPublishingController, PublishingFontFileController, PublishingImageFileController, SocialPublishingMediaController],
  providers: [PublishingSettingsService, SecretProtectionService, SafeHttpClient, GapGptClient, WordPressClient, SourceReaderService, NewsroomService, PlatformFeedService, SocialStudioService, SocialNetworkPublisherService, SocialCoverRendererService, PublishingOperationsService, PublishingAutomationProcessor],
  exports: [PlatformFeedService],
})
export class SmartPublishingModule {}
