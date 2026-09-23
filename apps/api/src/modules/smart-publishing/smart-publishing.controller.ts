import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { Public, RequirePermission } from '../../common/decorators/metadata.decorator';
import { verifyMediaSignature } from '../../common/media-signature';
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
import { DESTINATION_HEALTH_KEY, DESTINATION_HEALTH_NAME } from './destination-health';
import { SourceIconService } from './source-icon.service';
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

  private memberNewsroomAccess(user: AuthUser, tenant: TenantContext) {
    return { permissions: user.permissions, newsroomServiceIds: tenant.newsroomServiceIds };
  }

  @Get('operations') @RequirePermission('publishing.operations') operationsOverview(@TenantCtx() tenant: TenantContext) { return this.operations.overview(tenant.tenantId); }
  @Get('operations/jobs') @RequirePermission('publishing.operations') operationsJobs(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) { return this.operations.listJobs(tenant.tenantId, status); }
  @Get('operations/workflow') @RequirePermission('publishing.operations') operationsWorkflow(@TenantCtx() tenant: TenantContext) { return this.operations.workflowHistory(tenant.tenantId); }
  @Post('operations/jobs/retry-all') @RequirePermission('publishing.operations') retryAllOperations(@TenantCtx() tenant: TenantContext) { return this.operations.retryAllFailedJobs(tenant.tenantId); }
  @Post('operations/jobs/:id/retry') @RequirePermission('publishing.operations') retryOperation(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.operations.retryJob(tenant.tenantId, id); }
  @Post('operations/jobs/:id/cancel') @RequirePermission('publishing.operations') cancelOperation(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.operations.cancelJob(tenant.tenantId, id); }

  @Get('settings') @RequirePermission('publishing.settings') @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate') @Header('Pragma', 'no-cache') settings(@TenantCtx() tenant: TenantContext) { return this.settingsService.getPublic(tenant.tenantId); }
  @Put('settings') @RequirePermission('publishing.settings') saveSettings(@TenantCtx() tenant: TenantContext, @Body() body: UpdatePublishingSettingsDto) { return this.settingsService.save(tenant.tenantId, body); }
  @Post('settings/test-wordpress') @RequirePermission('publishing.settings') async testWordPress(@TenantCtx() tenant: TenantContext, @Body() body: TestWordPressConnectionDto) {
    const started = Date.now();
    const merged = this.settingsService.mergeForTest(await this.settingsService.getRaw(tenant.tenantId), body);
    const platform = merged.destination_platform || body.destination_platform || 'wordpress';
    if (platform !== 'wordpress') {
      try {
        const result = await this.settingsService.testDestinationSite(merged, this.sourceReader);
        await this.integrationHealth.success({ tenantId: tenant.tenantId, key: DESTINATION_HEALTH_KEY, type: 'publishing', name: DESTINATION_HEALTH_NAME, latencyMs: Date.now() - started }).catch(() => undefined);
        return result;
      } catch (error) {
        await this.integrationHealth.failure({ tenantId: tenant.tenantId, key: DESTINATION_HEALTH_KEY, type: 'publishing', name: DESTINATION_HEALTH_NAME, latencyMs: Date.now() - started, error }).catch(() => undefined);
        throw error;
      }
    }
    try {
      const result = await this.wordpress.test(merged);
      await this.integrationHealth.success({ tenantId: tenant.tenantId, key: DESTINATION_HEALTH_KEY, type: 'publishing', name: DESTINATION_HEALTH_NAME, latencyMs: Date.now() - started, metadata: { categories: result.categories.length } }).catch(() => undefined);
      return result;
    } catch (error) {
      await this.integrationHealth.failure({ tenantId: tenant.tenantId, key: DESTINATION_HEALTH_KEY, type: 'publishing', name: DESTINATION_HEALTH_NAME, latencyMs: Date.now() - started, error }).catch(() => undefined);
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
  @Post('settings/cover-templates/from-sample') @RequirePermission('publishing.settings') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })) async inferCoverTemplateFromSample(@TenantCtx() tenant: TenantContext, @UploadedFile() file: { originalname: string; mimetype?: string; buffer: Buffer }) {
    const uploaded = await this.settingsService.addImage(tenant.tenantId, file);
    const inferred = await this.settingsService.inferCoverTemplateFromSample(tenant.tenantId, uploaded.url);
    return { ...inferred, imageUrl: uploaded.url };
  }

  @Get('destination/categories') listDestinationCategories(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.destinationCategoryService.listForMember(
      tenant,
      user.permissions,
      status as 'pending' | 'approved' | 'rejected' | 'stale' | undefined,
    );
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
  @Post('destination/categories/bulk-delete-stale') @RequirePermission('publishing.settings') bulkDeleteStaleDestinationCategories(@TenantCtx() tenant: TenantContext, @User() user: AuthUser) {
    return this.destinationCategoryService.bulkDeleteStale(tenant.tenantId, user.id);
  }

  @Get('proxy/image') async proxyImage(@Query('url') url: string, @Res() response: Response) {
    const result = await this.sourceReader.proxyImage(String(url || ''));
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(result.buffer);
  }

  @Get('feeds') @RequirePermission('publishing.feeds') feeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId); }
  @Get('source-languages') sourceLanguages() { return this.newsroom.listSourceLanguages(); }
  @Get('platform-feeds') @RequirePermission('publishing.feeds') platformFeeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.listPlatformFeeds(tenant.tenantId); }
  @Patch('platform-feeds/:id') @RequirePermission('publishing.feeds') updatePlatformFeedSubscription(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateTenantPlatformFeedDto) {
    return this.newsroom.updatePlatformFeedSubscription(tenant.tenantId, id, body);
  }
  @Post('feeds') @RequirePermission('publishing.feeds') addFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, body); }
  @Patch('feeds/:id') @RequirePermission('publishing.feeds') updateFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('feeds/:id/toggle') @RequirePermission('publishing.feeds') toggleFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('feeds/:id') @RequirePermission('publishing.feeds') deleteFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('feeds/:id/fetch') @RequirePermission('publishing.feeds') fetchFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }
  @Post('feeds/probe') @RequirePermission('publishing.feeds') probeFeed(@Body() body: ProbeFeedDto) { return this.newsroom.probeFeed(body); }
  @Post('feeds/:id/test') @RequirePermission('publishing.feeds') testFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.testFeed(tenant.tenantId, id); }
  @Post('platform-feeds/:id/toggle') @RequirePermission('publishing.feeds') togglePlatformFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: TogglePlatformFeedDto) {
    return this.newsroom.togglePlatformFeed(tenant.tenantId, id, body.enabled);
  }

  @Get('news/feeds/export')
  @RequirePermission('publishing.feeds')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportNewsFeeds(@TenantCtx() tenant: TenantContext, @Res() response: Response) {
    const buffer = await this.feedBulk.exportTenantWorkbook(tenant.tenantId);
    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Disposition', `attachment; filename="deska-org-feeds-${stamp}.xlsx"`);
    response.send(buffer);
  }

  @Post('news/feeds/import')
  @RequirePermission('publishing.feeds')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  importNewsFeeds(@TenantCtx() tenant: TenantContext, @UploadedFile() file: { buffer: Buffer }) {
    if (!file?.buffer?.length) throw new BadRequestException('فایل Excel انتخاب نشده است');
    return this.feedBulk.importTenantWorkbook(tenant.tenantId, file.buffer);
  }

  @Get('news/feeds') @RequirePermission('publishing.news') newsFeeds(@TenantCtx() tenant: TenantContext) { return this.newsroom.feeds(tenant.tenantId, 'news-room'); }
  @Post('news/feeds') @RequirePermission('publishing.feeds') addNewsFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, { ...body, purpose: 'news-room' }); }
  @Patch('news/feeds/:id') @RequirePermission('publishing.feeds') updateNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, body); }
  @Post('news/feeds/:id/toggle') @RequirePermission('publishing.feeds') toggleNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('news/feeds/:id') @RequirePermission('publishing.feeds') deleteNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('news/feeds/:id/fetch') @RequirePermission('publishing.feeds') fetchNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.fetchFeed(tenant.tenantId, id); }
  @Post('news/feeds/:id/test') @RequirePermission('publishing.feeds') testNewsFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.testFeed(tenant.tenantId, id); }
  @Post('news/feeds/probe') @RequirePermission('publishing.feeds') probeNewsFeed(@Body() body: ProbeFeedDto) { return this.newsroom.probeFeed(body); }
  @Post('news/sync') @RequirePermission('publishing.news') syncNews(@TenantCtx() tenant: TenantContext) { return this.newsroom.sync(tenant.tenantId); }
  @Get('news/articles') @RequirePermission('publishing.news') newsArticles(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('generalOnly') generalOnly?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.newsroom.articles(tenant.tenantId, {
      status,
      categoryId,
      generalOnly: generalOnly === 'true',
      access: { permissions: user.permissions, newsroomServiceIds: tenant.newsroomServiceIds },
      cursor,
    });
  }
  @Delete('news/articles') @RequirePermission('publishing.news') deleteAllNewsArticles(@TenantCtx() tenant: TenantContext) { return this.newsroom.deleteAllArticles(tenant.tenantId); }
  @Post('news/articles/:id/summarize') @RequirePermission('publishing.news') summarize(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.newsroom.summarize(tenant.tenantId, id, this.memberNewsroomAccess(user, tenant));
  }
  @Post('news/articles/:id/reject') @RequirePermission('publishing.news') reject(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.newsroom.reject(tenant.tenantId, id, this.memberNewsroomAccess(user, tenant));
  }
  @Post('news/articles/:id/send-to-social') @RequirePermission('publishing.news') sendNewsToSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.sendNewsToStudio(tenant.tenantId, id); }
  @Post('news/articles/:id/translate-full') @RequirePermission('publishing.news') translateNewsFull(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.newsroom.translateFull(tenant.tenantId, id, this.memberNewsroomAccess(user, tenant));
  }
  @Post('news/articles/:id/publish') @RequirePermission('publishing.news') publishNews(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
    @Body() body: PublishNewsArticleDto,
  ) {
    return this.newsroom.publish(tenant.tenantId, id, body, this.memberNewsroomAccess(user, tenant));
  }
  @Post('news/articles/:id/featured-image') @RequirePermission('publishing.news') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  async updateNewsFeaturedImage(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; mimetype?: string; buffer: Buffer },
  ) {
    const image = await this.settingsService.addImage(tenant.tenantId, file);
    try {
      const result = await this.newsroom.updateFeaturedImage(
        tenant.tenantId,
        id,
        image.url,
        this.memberNewsroomAccess(user, tenant),
      );
      await this.settingsService.removeImage(tenant.tenantId, result.previousFeaturedImageUrl).catch(() => undefined);
      return result.article;
    } catch (error) {
      await this.settingsService.removeImage(tenant.tenantId, image.url).catch(() => undefined);
      throw error;
    }
  }
  @Delete('news/articles/:id/featured-image') @RequirePermission('publishing.news')
  async removeNewsFeaturedImage(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
  ) {
    const result = await this.newsroom.updateFeaturedImage(
      tenant.tenantId,
      id,
      null,
      this.memberNewsroomAccess(user, tenant),
    );
    await this.settingsService.removeImage(tenant.tenantId, result.previousFeaturedImageUrl).catch(() => undefined);
    return result.article;
  }
  @Patch('news/articles/:id') @RequirePermission('publishing.news') updateNews(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateNewsArticleDto,
  ) {
    return this.newsroom.updateArticle(
      tenant.tenantId,
      id,
      body,
      user.id,
      this.memberNewsroomAccess(user, tenant),
    );
  }

  @Get('social/feeds') @RequirePermission('publishing.social') socialFeeds(@TenantCtx() tenant: TenantContext) { return this.socialStudio.feeds(tenant.tenantId); }
  @Post('social/feeds') @RequirePermission('publishing.manage') addSocialFeed(@TenantCtx() tenant: TenantContext, @Body() body: CreateFeedDto) { return this.newsroom.addFeed(tenant.tenantId, { ...body, purpose: 'social-studio' }); }
  @Patch('social/feeds/:id') @RequirePermission('publishing.manage') updateSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateFeedDto) { return this.newsroom.updateFeed(tenant.tenantId, id, { ...body, purpose: 'social-studio' }); }
  @Post('social/feeds/:id/toggle') @RequirePermission('publishing.manage') toggleSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.toggleFeed(tenant.tenantId, id); }
  @Delete('social/feeds/:id') @RequirePermission('publishing.manage') deleteSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.deleteFeed(tenant.tenantId, id); }
  @Post('social/feeds/probe') @RequirePermission('publishing.manage') probeSocialFeed(@Body() body: ProbeFeedDto) { return this.newsroom.probeFeed(body); }
  @Post('social/feeds/:id/test') @RequirePermission('publishing.manage') testSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.newsroom.testFeed(tenant.tenantId, id); }
  @Post('social/feeds/:id/fetch') @RequirePermission('publishing.manage') fetchSocialFeed(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.fetchFeed(tenant.tenantId, id); }
  @Post('social/sync') @RequirePermission('publishing.manage') syncSocial(@TenantCtx() tenant: TenantContext) { return this.socialStudio.sync(tenant.tenantId); }
  @Get('social/articles') @RequirePermission('publishing.social') socialArticles(@TenantCtx() tenant: TenantContext, @Query('status') status?: string, @Query('cursor') cursor?: string) { return this.socialStudio.articles(tenant.tenantId, status, cursor); }
  @Delete('social/articles') @RequirePermission('publishing.manage') deleteAllSocialArticles(@TenantCtx() tenant: TenantContext) { return this.socialStudio.deleteAllArticles(tenant.tenantId); }
  @Post('social/articles/:id/archive') @RequirePermission('publishing.manage') archiveSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.archive(tenant.tenantId, id); }
  @Post('social/articles/:id/prepare') @RequirePermission('publishing.manage') prepareSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string) { return this.socialStudio.prepare(tenant.tenantId, id); }
  @Post('social/articles/:id/publish/:network') @RequirePermission('publishing.publish') async publishSocial(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Param('network') network: string, @Body() body: PublishSocialArticleDto) {
    if (this.socialStudio.defersHeavyWork()) {
      if (body.caption?.trim()) await this.socialStudio.updateCaption(tenant.tenantId, id, body.caption);
      if (body.imageDataUrl?.trim()) {
        const stored = await this.socialPublisher.storeGeneratedMedia(Buffer.from(body.imageDataUrl.replace(/^data:image\/\w+;base64,/u, ''), 'base64'));
        await this.socialStudio.rememberGeneratedImage(tenant.tenantId, id, stored.url);
      }
      return this.socialStudio.enqueueNetworkPublish(tenant.tenantId, id, network);
    }
    return this.socialPublisher.publish(tenant.tenantId, id, network, body.caption, body.imageDataUrl);
  }
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

function assertSignedMedia(request: Request) {
  const pathname = (request.path || '').replace(/^\/api(?=\/)/u, '');
  const exp = typeof request.query.exp === 'string' ? request.query.exp : undefined;
  const sig = typeof request.query.sig === 'string' ? request.query.sig : undefined;
  if (!verifyMediaSignature(pathname, exp, sig)) {
    throw new UnauthorizedException('لینک فایل منقضی یا نامعتبر است');
  }
}

@Public()
@Controller('publishing/settings/fonts/file')
export class PublishingFontFileController {
  constructor(private readonly settingsService: PublishingSettingsService) {}
  @Get(':tenantId/:filename') async tenantFile(@Req() request: Request, @Param('tenantId') tenantId: string, @Param('filename') filename: string, @Res() response: Response) {
    assertSignedMedia(request);
    const result = await this.settingsService.fontFile(tenantId, filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
  @Get(':filename') async file(@Req() request: Request, @Param('filename') filename: string, @Res() response: Response) {
    assertSignedMedia(request);
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
  @Get(':tenantId/:filename') async tenantFile(@Req() request: Request, @Param('tenantId') tenantId: string, @Param('filename') filename: string, @Res() response: Response) {
    assertSignedMedia(request);
    const result = await this.settingsService.imageFile(tenantId, filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
  @Get(':filename') async file(@Req() request: Request, @Param('filename') filename: string, @Res() response: Response) {
    assertSignedMedia(request);
    const result = await this.settingsService.legacyImageFile(filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.send(result.buffer);
  }
}

@Public()
@Controller('publishing/source-icons')
export class PublishingSourceIconController {
  constructor(private readonly sourceIcons: SourceIconService) {}

  @Get(':domain')
  async file(@Param('domain') domain: string, @Res() response: Response) {
    const result = await this.sourceIcons.getIcon(domain);
    if (!result) {
      response.status(404).end();
      return;
    }
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=604800');
    return response.send(result.buffer);
  }
}

@Public()
@Controller('publishing/social/media')
export class SocialPublishingMediaController {
  constructor(private readonly socialPublisher: SocialNetworkPublisherService) {}

  @Get(':filename')
  async file(@Req() request: Request, @Param('filename') filename: string, @Res() response: Response) {
    assertSignedMedia(request);
    const result = await this.socialPublisher.publicMedia(filename);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=300');
    return response.send(result.buffer);
  }
}
