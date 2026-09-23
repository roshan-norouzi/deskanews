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
import { TENANT_PUBLISHING_PORT } from '../../contracts/tenant-publishing.port';
import { TenantPublishingFacade } from './tenant-publishing.facade';
import { PlatformPublishingFacade } from './platform-publishing.facade';
import { PLATFORM_PUBLISHING_PORT } from '../../contracts/platform-publishing.port';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramOAuthController } from './instagram-oauth.controller';
import { FastLaneQueue } from './fast-lane.queue';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SmartPublishingController, InstagramOAuthController, PublishingFontFileController, PublishingImageFileController, PublishingSourceIconController, SocialPublishingMediaController],
  providers: [
    PublishingSettingsService,
    SecretProtectionService,
    GapGptClient,
    WordPressClient,
    SourceReaderService,
    SourceIconService,
    DestinationCategoryService,
    NewsroomService,
    PlatformFeedService,
    FeedBulkService,
    SocialStudioService,
    SocialNetworkPublisherService,
    SocialCoverRendererService,
    PublishingOperationsService,
    PublishingAutomationProcessor,
    InstagramOAuthService,
    FastLaneQueue,
    TenantPublishingFacade,
    PlatformPublishingFacade,
    { provide: TENANT_PUBLISHING_PORT, useExisting: TenantPublishingFacade },
    { provide: PLATFORM_PUBLISHING_PORT, useExisting: PlatformPublishingFacade },
  ],
  exports: [
    PlatformFeedService,
    FeedBulkService,
    PublishingSettingsService,
    GapGptClient,
    SourceReaderService,
    DestinationCategoryService,
    TENANT_PUBLISHING_PORT,
    PLATFORM_PUBLISHING_PORT,
  ],
})
export class SmartPublishingModule {}
