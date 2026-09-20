import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PlatformFeedService } from './platform-feed.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SecretProtectionService } from './secret-protection.service';
import { PublishingFontFileController, PublishingImageFileController, PublishingSourceIconController, SmartPublishingController, SocialPublishingMediaController } from './smart-publishing.controller';
import { SourceReaderService } from './source-reader.service';
import { SocialStudioService } from './social-studio.service';
import { WordPressClient } from './wordpress.client';
import { SocialNetworkPublisherService } from './social-network-publisher.service';
import { SocialCoverRendererService } from './social-cover-renderer.service';
import { PublishingAutomationProcessor } from './publishing-automation.processor';
import { PublishingOperationsService } from './publishing-operations.service';
import { FeedBulkService } from './feed-bulk.service';
import { DestinationCategoryService } from './destination-category.service';
import { SourceIconService } from './source-icon.service';
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SmartPublishingController, PublishingFontFileController, PublishingImageFileController, PublishingSourceIconController, SocialPublishingMediaController],
  providers: [PublishingSettingsService, SecretProtectionService, GapGptClient, WordPressClient, SourceReaderService, SourceIconService, DestinationCategoryService, NewsroomService, PlatformFeedService, FeedBulkService, SocialStudioService, SocialNetworkPublisherService, SocialCoverRendererService, PublishingOperationsService, PublishingAutomationProcessor],
  exports: [PlatformFeedService, FeedBulkService, PublishingSettingsService, GapGptClient, SourceReaderService, DestinationCategoryService],
})
export class SmartPublishingModule {}
