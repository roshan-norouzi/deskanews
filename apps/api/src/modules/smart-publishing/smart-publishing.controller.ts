import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Public, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CreateFeedDto, UpdateFeedDto, TogglePlatformFeedDto, ProbeFeedDto, UpdateTenantPlatformFeedDto } from './dto/feed.dto';
import { UpdateNewsArticleDto, PublishNewsArticleDto } from './dto/news-article.dto';
import { TestWordPressConnectionDto, UpdatePublishingSettingsDto } from './dto/publishing-settings.dto';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { WordPressClient } from './wordpress.client';
import { SocialStudioService } from './social-studio.service';
import { PublishSocialArticleDto, UpdateSocialCaptionDto, UpdateSocialLeadDto, UpdateSocialTitleDto } from './dto/social-article.dto';
import { SourceReaderService } from './source-reader.service';
import { SocialNetworkPublisherService } from './social-network-publisher.service';
import { PublishingOperationsService } from './publishing-operations.service';
import { FeedBulkService } from './feed-bulk.service';
import { IntegrationHealthService } from '../../common/services/integration-health.service';
import { DestinationCategoryService } from './destination-category.service';
import { BulkApproveDestinationCategoriesDto, CreateDestinationCategoryDto, SyncDestinationCategoriesDto, UpdateDestinationCategoryDto, UpdateDestinationCategoryStatusDto } from './dto/destination-category.dto';
@Controller('publishing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@RequirePermission('publishing.view')
export class SmartPublishingController {
  constructor(
    private readonly newsroom: NewsroomService,
    private readonly settingsService: PublishingSettingsService,
    private readonly wordpress: WordPressClient,
    private readonly socialStudio: SocialStudioService,
    private readonly sourceReader: SourceReaderService,
    private readonly socialPublisher: SocialNetworkPublisherService,
    private readonly operations: PublishingOperationsService,
    private readonly feedBulk: FeedBulkService,
    private readonly integrationHealth: IntegrationHealthService,
    private readonly destinationCategoryService: DestinationCategoryService,
  ) {}

  @Get('operations') operationsOverview(@TenantCtx() tenant: TenantContext) { return this.operations.overview(tenant.tenantId); }
  @Get('operations/jobs') operationsJobs(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.operations.listJobs(tenant.tenantId, status); }
  @Get('operations/workflow') operationsWorkflow(@TenantCtx() tenant: TenantContext) { return this.operations.workflowHistory(tenant.tenantId); }
  @Post('operations/jobs/retry-all') @RequirePermission('publishing.manage') retryAllOperations(@TenantCtx() tenant: TenantContext) { return this.operations.retryAllFailedJobs(tenant.tenantId); }
  @Post('operations/jobs/:id/retry') @RequirePermission('publishing.manage') retryOperation(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.operations.retryJob(tenant.tenantId, id); }
  @Post('operations/jobs/:id/cancel') @RequirePermission('publishing.manage') cancelOperation(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.operations.cancelJob(tenant.tenantId, id); }

  @Get('settings') @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate') @Header('Pragma', 'no-cache') settings(@TenantCtx() tenant: TenantContext) { return this.settingsService.getPublic(tenant.tenantId); }
  @Put('settings') @RequirePermission('publishing.settings') saveSettings(@TenantCtx() tenant: TenantContext, @Body() body: UpdatePublishingSettingsDto) { return this.settingsService.save(tenant.tenantId, body); }
  @Post('settings/test-wordpress') @RequirePermission('publishing.settings') async testWordPress(@TenantCtx() tenant: TenantContext, @Body() body: TestWordPressConnectionDto) {
    const started = Date.now();
    const merged = this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body);
    const platform = merged.destination_platform || body.destination_platform || 'wordpress';
    if (platform !== 'wordpress') {
      try {
        const result = await this.settingsService.testDestinationSite(merged);
        await this.integrationHealth.success({ tenantId: tenant.tenantId, key: `destination:${platform}`, type: 'publishing', name: platform === 'iransamaneh' ? 'ایران‌سامانه' : 'نستوه', latencyMs: Date.now() - started }).catch(() => undefined);
        return result;
      } catch (error) {
        await this.integrationHealth.failure({ tenantId: tenant.tenantId, key: `destination:${platform}`, type: 'publishing', name: platform === 'iransamaneh' ? 'ایران‌سامانه' : 'نستوه', latencyMs: Date.now() - started, error }).catch(() => undefined);
        throw error;
      }
    }
    try {
      const result = await this.wordpress.test(merged);
      await this.integrationHealth.success({ tenantId: tenant.tenantId, key: 'wordpress', type: 'publishing', name: 'WordPress', latencyMs: Date.now() - started, metadata: { categories: result.categories.length } }).catch(() => undefined);
      return result;
    } catch (error) {
      await this.integrationHealth.failure({ tenantId: tenant.tenantId, key: 'wordpress', type: 'publishing', name: 'WordPress', latencyMs: Date.now() - started, error }).catch(() => undefined);
      throw error;
    }
  }
  @Post('settings/test-social/:network') @RequirePermission('publishing.settings') async testSocial(@TenantCtx() tenant: TenantContext, @Param('network') network: string, @Body() body: UpdatePublishingSettingsDto) {
    const started = Date.now();
    const name = ({ telegram: 'تلگرام', instagram: 'اینستاگرام', linkedin: 'لینکدین', facebook: 'فیسبوک' } as Record<string, string>)[network] || network;
    try {
      const result = await this.socialPublisher.testConnection(tenant.tenantId, network, this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body));
      await this.integrationHealth.success({ tenantId: tenant.tenantId, key: `social:${network}`, type: 'social', name, latencyMs: Date.now() - started }).catch(() => undefined);
      return result;
    } catch (error) {
      await this.integrationHealth.failure({ tenantId: tenant.tenantId, key: `social:${network}`, type: 'social', name, latencyMs: Date.now() - started, error }).catch(() => undefined);
      throw error;
    }
  }
  @Post('settings/fonts') @RequirePermission('publishing.settings') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })) uploadFont(@TenantCtx() tenant: TenantContext, @UploadedFile() file: { originalname: string; buffer: Buffer }, @Body('name') name?: string, @Body('variant') variant?: string) { return this.settingsService.addFont(tenant.tenantId, file, name, variant); }
  @Patch('settings/fonts/:id') @RequirePermission('publishing.settings') renameFont(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body('name') name?: string) { return this.settingsService.renameFontFamily(tenant.tenantId, id, String(name || '')); }
  @Delete('settings/fonts/:id') @RequirePermission('publishing.settings') removeFont(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.settingsService.removeFont(tenant.tenantId, id).then(() => ({ ok: true })); }
  @Post('settings/images') @RequirePermission('publishing.settings') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })) uploadCoverImage(@TenantCtx() tenant: TenantContext, @UploadedFile() file: { originalname: string; mimetype?: string; buffer: Buffer }) { return this.settingsService.addImage(tenant.tenantId, file); }

  @Get('destination/categories') listDestinationCategories(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) {
    return this.destinationCategoryService.list(tenant.tenantId, status as 'pending' | 'approved' | 'rejected' | 'stale' | undefined);
  }
  @Post('destination/categories/sync') @RequirePermission('publishing.settings') syncDestinationCategories(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Body() body: SyncDestinationCategoriesDto) {
    return this.destinationCategoryService.syncFromDestination(tenant.tenantId, user.id, body.siteUrl);
  }
  @Post('destination/categories') @RequirePermission('publishing.settings') createDestinationCategory(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Body() body: CreateDestinationCategoryDto) {
    return this.destinationCategoryService.createManual(tenant.tenantId, body, user.id);
  }
  @Patch('destination/categories/:id') @RequirePermission('publishing.settings') updateDestinationCategory(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Param('id') id: string, @Body() body: UpdateDestinationCategoryDto) {
    return this.destinationCategoryService.updateDetails(id, tenant.tenantId, body);
  }
  @Patch('destination/categories/:id/status') @RequirePermission('publishing.settings') updateDestinationCategoryStatus(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Param('id') id: string, @Body() body: UpdateDestinationCategoryStatusDto) {
    return this.destinationCategoryService.updateStatus(id, tenant.tenantId, body.status, user.id);
  }
  @Post('destination/categories/bulk-approve') @RequirePermission('publishing.settings') bulkApproveDestinationCategories(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Body() body: BulkApproveDestinationCategoriesDto) {
    return this.destinationCategoryService.bulkApprove(tenant.tenantId, body.ids, user.id);
  }

  @Get('proxy/image') async proxyImage(@Query('url') url: string, @Res() response: Response) { const result = await this.sourceReader.proxyImage(String(url || '')); response.setHeader('Content-Type', result.contentType); response.setHeader('Cache-Control', 'private, max-age=3600'); return response.send(result.buffer); }

  @Get('feeds') feeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId); }
  @Get('platform-feeds') platformFeeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.listPlatformFeeds(tenant.tenantId); }
  @Patch('platform-feeds/:id') @RequirePermission('publishing.manage') updatePlatformFeedSubscription(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateTenantPlatformFeedDto) {
    return this.newsroom.updatePlatformFeedSubscription(tenant.tenantId, id, body);
  }
  @Post('feeds') @RequirePermission('publishing.manage') addFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, body); }
  @Patch('feeds/:id') @RequirePermission('publishing.manage') updateFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('feeds/:id/toggle') @RequirePermission('publishing.manage') toggleFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('feeds/:id') @RequirePermission('publishing.manage') deleteFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('feeds/:id/fetch') @RequirePermission('publishing.manage') fetchFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }
  @Post('feeds/probe') @RequirePermission('publishing.manage') probeFeed(@Body() body: ProbeFeedDto) { return this.newsroom.probeFeed(body); }
  @Post('feeds/:id/test') @RequirePermission('publishing.manage') testFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.testFeed(tenant.tenantId, id); }
  @Post('platform-feeds/:id/toggle') @RequirePermission('publishing.manage') togglePlatformFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: TogglePlatformFeedDto) {
    return this.newsroom.togglePlatformFeed(tenant.tenantId, id, body.enabled);
  }

  @Get('news/feeds/export')
  @RequirePermission('publishing.manage')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportNewsFeeds(@TenantCtx() tenant: TenantContext, @Res() response: Response) {
    const buffer = await this.feedBulk.exportTenantWorkbook(tenant.tenantId);
    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Disposition', `attachment; filename="deska-org-feeds-${stamp}.xlsx"`);
    response.send(buffer);
  }

  @Post('news/feeds/import')
  @RequirePermission('publishing.manage')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  importNewsFeeds(@TenantCtx() tenant: TenantContext, @UploadedFile() file: { buffer: Buffer }) {
    if (!file?.buffer?.length) throw new BadRequestException('فایل Excel انتخاب نشده است');
    return this.feedBulk.importTenantWorkbook(tenant.tenantId, file.buffer);
  }

  @Get('news/feeds') newsFeeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId, 'news-room'); }
  @Post('news/feeds') @RequirePermission('publishing.manage') addNewsFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, { ...body, purpose: 'news-room' }); }
  @Patch('news/feeds/:id') @RequirePermission('publishing.manage') updateNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('news/feeds/:id/toggle') @RequirePermission('publishing.manage') toggleNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('news/feeds/:id') @RequirePermission('publishing.manage') deleteNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('news/feeds/:id/fetch') @RequirePermission('publishing.manage') fetchNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }
  @Post('news/feeds/:id/test') @RequirePermission('publishing.manage') testNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.testFeed(tenant.tenantId, id); }
  @Post('news/feeds/probe') @RequirePermission('publishing.manage') probeNewsFeed(@Body() body: ProbeFeedDto) { return this.newsroom.probeFeed(body); }
  @Post('news/sync') @RequirePermission('publishing.manage') syncNews(@TenantCtx() tenant: TenantContext) { return this.newsroom.sync(tenant.tenantId); }
  @Get('news/articles') newsArticles(
    @TenantCtx() tenant: TenantContext,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('generalOnly') generalOnly?: string,
  ) {
    return this.newsroom.articles(tenant.tenantId, {
      status,
      categoryId,
      generalOnly: generalOnly === 'true',
    });
  }
  @Delete('news/articles') @RequirePermission('publishing.manage') deleteAllNewsArticles(@TenantCtx() tenant: TenantContext) { return this.newsroom.deleteAllArticles(tenant.tenantId); }
  @Post('news/articles/:id/summarize') @RequirePermission('publishing.manage') summarize(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.summarize(tenant.tenantId, id); }
  @Post('news/articles/:id/reject') @RequirePermission('publishing.manage') reject(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.reject(tenant.tenantId, id); }
  @Post('news/articles/:id/send-to-social') @RequirePermission('publishing.manage') sendNewsToSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.sendNewsToStudio(tenant.tenantId, id); }
  @Post('news/articles/:id/translate-full') @RequirePermission('publishing.manage') translateNewsFull(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.translateFull(tenant.tenantId, id); }
  @Post('news/articles/:id/publish') @RequirePermission('publishing.publish') publishNews(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: PublishNewsArticleDto) { return this.newsroom.publish(tenant.tenantId, id, body); }
  @Patch('news/articles/:id') @RequirePermission('publishing.manage') updateNews(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Param('id') id: string, @Body() body: UpdateNewsArticleDto) {
    return this.newsroom.updateArticle(tenant.tenantId, id, body, user.id);
  }

  @Get('social/feeds') socialFeeds(@TenantCtx() tenant: TenantContext) { return this.socialStudio.feeds(tenant.tenantId); }
  @Post('social/feeds') @RequirePermission('publishing.manage') addSocialFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, { ...body, purpose: 'social-studio' }); }
  @Patch('social/feeds/:id') @RequirePermission('publishing.manage') updateSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, { ...body, purpose: 'social-studio' }); }
  @Post('social/feeds/:id/toggle') @RequirePermission('publishing.manage') toggleSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('social/feeds/:id') @RequirePermission('publishing.manage') deleteSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('social/feeds/probe') @RequirePermission('publishing.manage') probeSocialFeed(@Body() body: ProbeFeedDto) { return this.newsroom.probeFeed(body); }
  @Post('social/feeds/:id/test') @RequirePermission('publishing.manage') testSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.testFeed(tenant.tenantId, id); }
  @Post('social/feeds/:id/fetch') @RequirePermission('publishing.manage') fetchSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.fetchFeed(tenant.tenantId, id); }
  @Post('social/sync') @RequirePermission('publishing.manage') syncSocial(@TenantCtx() tenant: TenantContext) { return this.socialStudio.sync(tenant.tenantId); }
  @Get('social/articles') socialArticles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.socialStudio.articles(tenant.tenantId, status); }
  @Delete('social/articles') @RequirePermission('publishing.manage') deleteAllSocialArticles(@TenantCtx() tenant: TenantContext) { return this.socialStudio.deleteAllArticles(tenant.tenantId); }
  @Post('social/articles/:id/archive') @RequirePermission('publishing.manage') archiveSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.archive(tenant.tenantId, id); }
  @Post('social/articles/:id/prepare') @RequirePermission('publishing.manage') prepareSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.prepare(tenant.tenantId, id); }
  @Post('social/articles/:id/publish/:network') @RequirePermission('publishing.publish') publishSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Param('network') network: string, @Body() body: PublishSocialArticleDto) { return this.socialPublisher.publish(tenant.tenantId, id, network, body.caption, body.imageDataUrl); }
  @Post('social/articles/:id/featured-image') @RequirePermission('publishing.manage') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })) async updateSocialFeaturedImage(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @UploadedFile() file: { originalname: string; mimetype?: string; buffer: Buffer }) {
    const image = await this.settingsService.addImage(tenant.tenantId, file);
    try {
      const result = await this.socialStudio.updateFeaturedImage(tenant.tenantId, id, image.url);
      await this.settingsService.removeImage(tenant.tenantId, result.previousFeaturedImageUrl).catch(() => undefined);
      return result.article;
    } catch (error) {
      await this.settingsService.removeImage(tenant.tenantId, image.url).catch(() => undefined);
      throw error;
    }
  }
  @Delete('social/articles/:id/featured-image') @RequirePermission('publishing.manage') async removeSocialFeaturedImage(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    const result = await this.socialStudio.updateFeaturedImage(tenant.tenantId, id, null);
    await this.settingsService.removeImage(tenant.tenantId, result.previousFeaturedImageUrl).catch(() => undefined);
    return result.article;
  }
  @Patch('social/articles/:id/rewrite') @RequirePermission('publishing.manage') rewrite(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateSocialCaptionDto) { return this.socialStudio.updateCaption(tenant.tenantId, id, body.rewrittenText); }
  @Patch('social/articles/:id/lead') @RequirePermission('publishing.manage') updateSocialLead(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateSocialLeadDto) { return this.socialStudio.updateLead(tenant.tenantId, id, body.leadText); }
  @Patch('social/articles/:id/title') @RequirePermission('publishing.manage') updateSocialTitle(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateSocialTitleDto) { return this.socialStudio.updateTitle(tenant.tenantId, id, body.title); }
}

@Public()
@Controller('publishing/settings/fonts/file')
export class PublishingFontFileController {
  constructor(private readonly settingsService: PublishingSettingsService) {}
  @Get(':tenantId/:filename') async tenantFile(@Param('tenantId') tenantId: string, @Param('filename') filename: string, @Res() response: Response) {
    const result = await this.settingsService.fontFile(tenantId, filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
  @Get(':filename') async file(@Param('filename') filename: string, @Res() response: Response) {
    const result = await this.settingsService.legacyFontFile(filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
}

@Public()
@Controller('publishing/settings/images/file')
export class PublishingImageFileController {
  constructor(private readonly settingsService: PublishingSettingsService) {}
  @Get(':tenantId/:filename') async tenantFile(@Param('tenantId') tenantId: string, @Param('filename') filename: string, @Res() response: Response) {
    const result = await this.settingsService.imageFile(tenantId, filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
  @Get(':filename') async file(@Param('filename') filename: string, @Res() response: Response) {
    const result = await this.settingsService.legacyImageFile(filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
}

@Public()
@Controller('publishing/social/media')
export class SocialPublishingMediaController {
  constructor(private readonly socialPublisher: SocialNetworkPublisherService) {}

  @Get(':filename')
  async file(@Param('filename') filename: string, @Res() response: Response) {
    const result = await this.socialPublisher.publicMedia(filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=300');
    return response.send(result.buffer);
  }
}
