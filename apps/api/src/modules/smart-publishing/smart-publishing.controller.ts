import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Public, RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx } from '../../common/decorators/params.decorator';
import type { TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CreateFeedDto, UpdateFeedDto } from './dto/feed.dto';
import { UpdateNewsArticleDto } from './dto/news-article.dto';
import { TestGapGptConnectionDto, TestWordPressConnectionDto, UpdatePublishingSettingsDto } from './dto/publishing-settings.dto';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { WordPressClient } from './wordpress.client';
import { SocialStudioService } from './social-studio.service';
import { PublishSocialArticleDto, UpdateSocialCaptionDto, UpdateSocialLeadDto, UpdateSocialTitleDto } from './dto/social-article.dto';
import { SourceReaderService } from './source-reader.service';
import { SocialNetworkPublisherService } from './social-network-publisher.service';
import { DailyReportService } from './daily-report.service';
import { AddDailyReportItemDto, CreateDailyReportDto, UpdateDailyReportDto } from './dto/daily-report.dto';
import { PublishingOperationsService } from './publishing-operations.service';
import { IntegrationHealthService } from '../../common/services/integration-health.service';
import { ListWordPressPostsDto, UpdateWordPressImportanceDto, UpdateWordPressPostDto } from './dto/wordpress-post.dto';
import { WordPressMediaService } from './wordpress-media.service';

@Controller('publishing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('smart-publishing')
@RequirePermission('publishing.view')
export class SmartPublishingController {
  constructor(
    private readonly newsroom: NewsroomService,
    private readonly settingsService: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly wordpress: WordPressClient,
    private readonly socialStudio: SocialStudioService,
    private readonly sourceReader: SourceReaderService,
    private readonly socialPublisher: SocialNetworkPublisherService,
    private readonly dailyReports: DailyReportService,
    private readonly operations: PublishingOperationsService,
    private readonly integrationHealth: IntegrationHealthService,
    private readonly wordpressMedia: WordPressMediaService,
  ) {}

  @Get('operations') operationsOverview(@TenantCtx() tenant: TenantContext) { return this.operations.overview(tenant.tenantId); }
  @Get('operations/jobs') operationsJobs(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.operations.listJobs(tenant.tenantId, status); }
  @Get('operations/workflow') operationsWorkflow(@TenantCtx() tenant: TenantContext) { return this.operations.workflowHistory(tenant.tenantId); }
  @Post('operations/jobs/retry-all') @RequirePermission('publishing.manage') retryAllOperations(@TenantCtx() tenant: TenantContext) { return this.operations.retryAllFailedJobs(tenant.tenantId); }
  @Post('operations/jobs/:id/retry') @RequirePermission('publishing.manage') retryOperation(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.operations.retryJob(tenant.tenantId, id); }
  @Post('operations/jobs/:id/cancel') @RequirePermission('publishing.manage') cancelOperation(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.operations.cancelJob(tenant.tenantId, id); }

  @Get('settings') @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate') @Header('Pragma', 'no-cache') settings(@TenantCtx() tenant: TenantContext) { return this.settingsService.getPublic(tenant.tenantId); }
  @Put('settings') @RequirePermission('publishing.settings') saveSettings(@TenantCtx() tenant: TenantContext, @Body() body: UpdatePublishingSettingsDto) { return this.settingsService.save(tenant.tenantId, body); }
  @Post('settings/test-gapgpt') @RequirePermission('publishing.settings') async testGapGpt(@TenantCtx() tenant: TenantContext, @Body() body: TestGapGptConnectionDto) {
    const started = Date.now();
    try {
      const result = await this.gapGpt.test(this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body));
      await this.integrationHealth.success({ tenantId: tenant.tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - started }).catch(() => undefined);
      return result;
    } catch (error) {
      await this.integrationHealth.failure({ tenantId: tenant.tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - started, error }).catch(() => undefined);
      throw error;
    }
  }
  @Post('settings/gapgpt-models') @RequirePermission('publishing.settings') async gapGptModels(@TenantCtx() tenant: TenantContext, @Body() body: TestGapGptConnectionDto) { return this.gapGpt.models(this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body)); }
  @Post('settings/test-wordpress') @RequirePermission('publishing.settings') async testWordPress(@TenantCtx() tenant: TenantContext, @Body() body: TestWordPressConnectionDto) {
    const started = Date.now();
    try {
      const result = await this.wordpress.test(this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body));
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

  @Get('media/posts') async wordPressPosts(@TenantCtx() tenant: TenantContext, @Query() query: ListWordPressPostsDto) {
    return this.wordpressMedia.listPosts(tenant.tenantId, query);
  }
  @Get('media/posts/:id') async wordPressPost(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.wordpressMedia.getPost(tenant.tenantId, id);
  }
  @Get('media/categories') async wordPressMediaCategories(@TenantCtx() tenant: TenantContext) {
    return this.wordpress.categories(await this.wordpressMedia.settingsForMedia(tenant.tenantId));
  }
  @Patch('media/posts/:id') @RequirePermission('publishing.manage') async updateWordPressPost(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateWordPressPostDto) {
    return this.wordpress.updatePost(await this.wordpressMedia.settingsForMedia(tenant.tenantId), id, body);
  }
  @Post('media/posts/:id/publish') @RequirePermission('publishing.publish') async publishWordPressPost(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateWordPressPostDto) {
    return this.wordpress.updatePost(await this.wordpressMedia.settingsForMedia(tenant.tenantId), id, { ...body, status: 'publish' });
  }
  @Post('media/posts/:id/featured-image') @RequirePermission('publishing.manage') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })) async updateWordPressFeaturedImage(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @UploadedFile() file: { originalname: string; mimetype?: string; buffer: Buffer }) {
    return this.wordpress.updateFeaturedImage(await this.wordpressMedia.settingsForMedia(tenant.tenantId), id, file);
  }
  @Delete('media/posts/:id/featured-image') @RequirePermission('publishing.manage') async removeWordPressFeaturedImage(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.wordpress.updateFeaturedImage(await this.wordpressMedia.settingsForMedia(tenant.tenantId), id, null);
  }
  @Post('media/importance/queue') @RequirePermission('publishing.manage') queueWordPressImportance(@TenantCtx() tenant: TenantContext) { return this.wordpressMedia.queueEvaluations(tenant.tenantId); }
  @Post('media/importance/reevaluate-all') @RequirePermission('publishing.manage') reevaluateAllWordPressImportance(@TenantCtx() tenant: TenantContext) { return this.wordpressMedia.queueAllReevaluations(tenant.tenantId); }
  @Get('media/importance/status') evaluationAutomationStatus(@TenantCtx() tenant: TenantContext) { return this.wordpressMedia.automationStatus(tenant.tenantId); }
  @Get('media/importance/memory-summary') @RequirePermission('publishing.manage') editorialMemorySummary(@TenantCtx() tenant: TenantContext) { return this.wordpressMedia.editorialMemorySummary(tenant.tenantId); }
  @Post('media/posts/:id/importance/evaluate') @RequirePermission('publishing.manage') evaluateWordPressImportance(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.wordpressMedia.evaluate(tenant.tenantId, id); }
  @Patch('media/posts/:id/importance') @RequirePermission('publishing.manage') overrideWordPressImportance(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateWordPressImportanceDto) { return this.wordpressMedia.override(tenant.tenantId, id, body.importance); }

  @Get('feeds') feeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId); }
  @Post('feeds') @RequirePermission('publishing.manage') addFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, body); }
  @Patch('feeds/:id') @RequirePermission('publishing.manage') updateFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('feeds/:id/toggle') @RequirePermission('publishing.manage') toggleFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('feeds/:id') @RequirePermission('publishing.manage') deleteFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('feeds/:id/fetch') @RequirePermission('publishing.manage') fetchFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }
  @Post('feeds/:id/test') @RequirePermission('publishing.manage') testFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.testFeed(tenant.tenantId, id); }

  @Get('news/feeds') newsFeeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId, 'news-room'); }
  @Post('news/feeds') @RequirePermission('publishing.manage') addNewsFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, { ...body, purpose: 'news-room' }); }
  @Patch('news/feeds/:id') @RequirePermission('publishing.manage') updateNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('news/feeds/:id/toggle') @RequirePermission('publishing.manage') toggleNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('news/feeds/:id') @RequirePermission('publishing.manage') deleteNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('news/feeds/:id/fetch') @RequirePermission('publishing.manage') fetchNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }
  @Post('news/feeds/:id/test') @RequirePermission('publishing.manage') testNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.testFeed(tenant.tenantId, id); }
  @Post('news/sync') @RequirePermission('publishing.manage') syncNews(@TenantCtx() tenant: TenantContext) { return this.newsroom.sync(tenant.tenantId); }
  @Get('news/articles') newsArticles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.newsroom.articles(tenant.tenantId, status); }
  @Delete('news/articles') @RequirePermission('publishing.manage') deleteAllNewsArticles(@TenantCtx() tenant: TenantContext) { return this.newsroom.deleteAllArticles(tenant.tenantId); }
  @Post('news/articles/:id/summarize') @RequirePermission('publishing.manage') summarize(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.summarize(tenant.tenantId, id); }
  @Post('news/articles/:id/reject') @RequirePermission('publishing.manage') reject(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.reject(tenant.tenantId, id); }
  @Post('news/articles/:id/send-to-social') @RequirePermission('publishing.manage') sendNewsToSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.sendNewsToStudio(tenant.tenantId, id); }
  @Post('news/articles/:id/publish') @RequirePermission('publishing.publish') publishNews(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.publish(tenant.tenantId, id); }
  @Patch('news/articles/:id') @RequirePermission('publishing.manage') updateNews(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateNewsArticleDto) { return this.newsroom.updateArticle(tenant.tenantId, id, body); }

  @Get('daily-reports/overview') dailyReportOverview(@TenantCtx() tenant: TenantContext) { return this.dailyReports.overview(tenant.tenantId); }
  @Post('daily-reports/sync') @RequirePermission('publishing.manage') syncDailyReports(@TenantCtx() tenant: TenantContext) { return this.dailyReports.sync(tenant.tenantId); }
  @Post('daily-reports') @RequirePermission('publishing.manage') createDailyReport(@TenantCtx() tenant: TenantContext, @Body() body: CreateDailyReportDto) { return this.dailyReports.createReport(tenant.tenantId, body.reportDate); }
  @Patch('daily-reports/:reportId') @RequirePermission('publishing.manage') updateDailyReport(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Body() body: UpdateDailyReportDto) { return this.dailyReports.updateReport(tenant.tenantId, reportId, body.reportDate); }
  @Delete('daily-reports/:reportId') @RequirePermission('publishing.manage') deleteDailyReport(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string) { return this.dailyReports.deleteReport(tenant.tenantId, reportId); }
  @Post('daily-reports/:reportId/items') @RequirePermission('publishing.manage') addDailyReportItem(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Body() body: AddDailyReportItemDto) { return this.dailyReports.addItem(tenant.tenantId, reportId, body.articleId); }
  @Delete('daily-reports/:reportId/items/:itemId') @RequirePermission('publishing.manage') removeDailyReportItem(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Param('itemId') itemId: string) { return this.dailyReports.removeItem(tenant.tenantId, reportId, itemId); }
  @Post('daily-reports/:reportId/articles/:articleId/reject') @RequirePermission('publishing.manage') rejectDailyReportArticle(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Param('articleId') articleId: string) { return this.dailyReports.rejectArticle(tenant.tenantId, reportId, articleId); }
  @Delete('daily-reports/:reportId/articles/:articleId/reject') @RequirePermission('publishing.manage') restoreDailyReportArticle(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string, @Param('articleId') articleId: string) { return this.dailyReports.restoreArticle(tenant.tenantId, reportId, articleId); }
  @Post('daily-reports/items/:itemId/prepare') @RequirePermission('publishing.manage') prepareDailyReportItem(@TenantCtx() tenant: TenantContext, @Param('itemId') itemId: string) { return this.dailyReports.prepareItem(tenant.tenantId, itemId); }
  @Post('daily-reports/:reportId/prepare-all') @RequirePermission('publishing.manage') prepareDailyReport(@TenantCtx() tenant: TenantContext, @Param('reportId') reportId: string) { return this.dailyReports.prepareAll(tenant.tenantId, reportId); }

  @Get('social/feeds') socialFeeds(@TenantCtx() tenant: TenantContext) { return this.socialStudio.feeds(tenant.tenantId); }
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
  @Get('media/image') async proxyImage(@Query('url') url: string, @Res() response: Response) { const result = await this.sourceReader.proxyImage(String(url || '')); response.setHeader('Content-Type', result.contentType); response.setHeader('Cache-Control', 'private, max-age=3600'); return response.send(result.buffer); }
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
