import { Body, Controller, Delete, ForbiddenException, Get, Header, Inject, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { PLATFORM_ROLES } from '@deska/shared';
import type { AuthUser } from '../../common/decorators/params.decorator';
import { User } from '../../common/decorators/params.decorator';
import { PLATFORM_PUBLISHING_PORT, type PlatformPublishingPort } from '../../contracts/platform-publishing.port';
import { PlatformAdminService } from './platform-admin.service';
import { UpdatePlatformUserStatusDto } from './dto/update-platform-user-status.dto';
import { UpdatePlatformUserRoleDto } from './dto/update-platform-user-role.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';
import { PlatformTransferOwnershipDto } from './dto/platform-transfer-ownership.dto';
import { DeletePlatformEntityDto } from './dto/delete-platform-entity.dto';
import { UpdatePlatformUserDto } from './dto/update-platform-user.dto';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { CreatePlatformFeedDto, UpdatePlatformFeedDto } from './dto/platform-feed.dto';
import { ProbeFeedDto } from '../../modules/smart-publishing/dto/feed.dto';
import { TestGapGptConnectionDto } from '../../modules/smart-publishing/dto/publishing-settings.dto';
import { UpdateUsageMetricsDto } from '../usage/dto/update-usage-metrics.dto';
import { UpdatePlatformAiSettingsDto } from './dto/platform-ai-settings.dto';
import { UpdatePlatformSourceFetchSettingsDto } from './dto/platform-source-fetch-settings.dto';
import { UpdatePlatformCatalogHealthSettingsDto } from './dto/platform-catalog-health-settings.dto';
import { UpdateFeedTopicLabelsDto } from './dto/platform-topic-labels.dto';
import { UpdatePlatformPaymentSettingsDto } from './dto/update-platform-payment-settings.dto';

@Controller('platform')
export class PlatformAdminController {
  constructor(
    private readonly service: PlatformAdminService,
    @Inject(PLATFORM_PUBLISHING_PORT) private readonly publishing: PlatformPublishingPort,
  ) {}

  private assertSuperAdmin(actor: AuthUser) {
    if (actor.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('فقط مدیر کل می‌تواند منابع پیش‌فرض را مدیریت کند');
    }
  }

  @Get('overview')
  overview(@User() actor: AuthUser) {
    return this.service.overview(actor);
  }

  @Get('users')
  users(
    @User() actor: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listUsers(actor, { q, status, role, page, limit });
  }

  @Post('users')
  createUser(@User() actor: AuthUser, @Body() dto: CreatePlatformUserDto) {
    return this.service.createUser(actor, dto);
  }

  @Get('users/:id')
  user(@User() actor: AuthUser, @Param('id') id: string) {
    return this.service.getUser(actor, id);
  }

  @Patch('users/:id')
  updateUser(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserDto,
  ) {
    return this.service.updateUser(actor, id, dto);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserStatusDto,
  ) {
    return this.service.updateUserStatus(actor, id, dto.status);
  }

  @Patch('users/:id/role')
  updateUserRole(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserRoleDto,
  ) {
    return this.service.updateUserRole(actor, id, dto.role);
  }

  @Delete('users/:id')
  deleteUser(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeletePlatformEntityDto,
  ) {
    return this.service.deleteUser(actor, id, dto);
  }

  @Get('organizations')
  organizations(
    @User() actor: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listOrganizations(actor, { q, status, page, limit });
  }

  @Get('organizations/:id')
  organization(@User() actor: AuthUser, @Param('id') id: string) {
    return this.service.getOrganization(actor, id);
  }

  @Patch('organizations/:id/status')
  updateOrganizationStatus(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationStatusDto,
  ) {
    return this.service.updateOrganizationStatus(actor, id, dto.status);
  }

  @Delete('organizations/:id')
  deleteOrganization(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeletePlatformEntityDto,
  ) {
    return this.service.deleteOrganization(actor, id, dto);
  }

  @Post('organizations/:id/transfer-ownership')
  transferOwnership(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: PlatformTransferOwnershipDto,
  ) {
    return this.service.transferOwnership(actor, id, dto.targetUserId);
  }

  @Get('usage-metrics')
  listUsageMetrics(@User() actor: AuthUser) {
    return this.service.listUsageMetrics(actor);
  }

  @Patch('usage-metrics')
  updateUsageMetrics(@User() actor: AuthUser, @Body() dto: UpdateUsageMetricsDto) {
    return this.service.updateUsageMetrics(actor, dto);
  }

  @Get('organizations/:id/usage')
  organizationUsage(@User() actor: AuthUser, @Param('id') id: string) {
    return this.service.getOrganizationUsage(actor, id);
  }

  @Get('organizations/:id/wallet')
  organizationWallet(@User() actor: AuthUser, @Param('id') id: string) {
    return this.service.organizationWallet(actor, id);
  }

  @Post('organizations/:id/wallet/credits')
  creditOrganization(@User() actor: AuthUser, @Param('id') id: string, @Body() body: { amount?: number }) {
    return this.service.creditOrganization(actor, id, Number(body.amount));
  }

  @Post('organizations/:id/payments')
  createPayment(@User() actor: AuthUser, @Param('id') id: string, @Body() body: { packageId?: string }) {
    return this.service.createOrganizationPayment(actor, id, String(body.packageId ?? ''));
  }

  @Post('payments/:id/confirm')
  confirmPayment(@User() actor: AuthUser, @Param('id') id: string) {
    return this.service.confirmPayment(actor, id);
  }

  @Get('payments/pending')
  pendingPayments(@User() actor: AuthUser, @Query('limit') limit?: string) {
    return this.service.listPendingPayments(actor, Number(limit) || 50);
  }

  @Get('payment-settings')
  paymentSettings(@User() actor: AuthUser) {
    return this.service.getPaymentSettings(actor);
  }

  @Put('payment-settings')
  savePaymentSettings(@User() actor: AuthUser, @Body() dto: UpdatePlatformPaymentSettingsDto) {
    return this.service.savePaymentSettings(actor, dto);
  }

  @Get('feeds/export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportPlatformFeeds(@User() actor: AuthUser, @Res() response: Response) {
    this.assertSuperAdmin(actor);
    const buffer = await this.publishing.exportFeeds();
    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Disposition', `attachment; filename="deska-platform-feeds-${stamp}.xlsx"`);
    response.send(buffer);
  }

  @Post('feeds/import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  importPlatformFeeds(@User() actor: AuthUser, @UploadedFile() file: { buffer: Buffer; originalname?: string }) {
    this.assertSuperAdmin(actor);
    if (!file?.buffer?.length) throw new BadRequestException('فایل Excel انتخاب نشده است');
    return this.publishing.importFeeds(file.buffer);
  }

  @Get('feeds')
  listPlatformFeeds(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.listFeeds();
  }

  @Get('source-languages')
  listSourceLanguages(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.listSourceLanguages();
  }

  @Post('feeds')
  createPlatformFeed(@User() actor: AuthUser, @Body() body: CreatePlatformFeedDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.createFeed(body);
  }

  @Patch('feeds/:id')
  updatePlatformFeed(@User() actor: AuthUser, @Param('id') id: string, @Body() body: UpdatePlatformFeedDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.updateFeed(id, body);
  }

  @Delete('feeds/:id')
  deletePlatformFeed(@User() actor: AuthUser, @Param('id') id: string) {
    this.assertSuperAdmin(actor);
    return this.publishing.deleteFeed(id);
  }

  @Post('feeds/probe')
  probePlatformFeed(@User() actor: AuthUser, @Body() body: ProbeFeedDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.probeFeed(body);
  }

  @Post('feeds/audit')
  auditPlatformFeeds(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.auditFeeds();
  }

  @Post('feeds/:id/test')
  testPlatformFeed(@User() actor: AuthUser, @Param('id') id: string) {
    this.assertSuperAdmin(actor);
    return this.publishing.testFeed(id);
  }

  @Post('feeds/:id/fetch')
  fetchPlatformFeed(@User() actor: AuthUser, @Param('id') id: string) {
    this.assertSuperAdmin(actor);
    return this.publishing.fetchFeed(id);
  }

  @Post('feeds/health-check')
  runCatalogHealthChecks(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.startCatalogHealth();
  }

  @Get('catalog-health-run-status')
  catalogHealthRunStatus(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.catalogHealthStatus();
  }

  @Get('feed-topic-labels')
  feedTopicLabels(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.feedTopicLabels();
  }

  @Put('feed-topic-labels')
  saveFeedTopicLabels(@User() actor: AuthUser, @Body() body: UpdateFeedTopicLabelsDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.saveFeedTopicLabels(body);
  }

  @Get('catalog-health-settings')
  catalogHealthSettings(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.catalogHealthSettings();
  }

  @Put('catalog-health-settings')
  saveCatalogHealthSettings(@User() actor: AuthUser, @Body() body: UpdatePlatformCatalogHealthSettingsDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.saveCatalogHealth(body);
  }

  @Get('ai-settings')
  aiSettings(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.aiSettings();
  }

  @Put('ai-settings')
  saveAiSettings(@User() actor: AuthUser, @Body() body: UpdatePlatformAiSettingsDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.saveAiSettings(body);
  }

  @Post('ai-settings/test-gapgpt')
  testGapGpt(@User() actor: AuthUser, @Body() body: TestGapGptConnectionDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.testGapGpt(body);
  }

  @Post('ai-settings/gapgpt-models')
  gapGptModels(@User() actor: AuthUser, @Body() body: TestGapGptConnectionDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.gapGptModels(body);
  }

  @Get('source-fetch-settings')
  sourceFetchSettings(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishing.sourceFetchSettings();
  }

  @Put('source-fetch-settings')
  saveSourceFetchSettings(@User() actor: AuthUser, @Body() body: UpdatePlatformSourceFetchSettingsDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.saveSourceFetch(body);
  }

  @Post('source-fetch-settings/test')
  testSourceFetchSettings(@User() actor: AuthUser, @Body() body: UpdatePlatformSourceFetchSettingsDto) {
    this.assertSuperAdmin(actor);
    return this.publishing.testSourceFetch(body);
  }
}
