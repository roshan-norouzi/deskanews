import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PLATFORM_ROLES } from '@deska/shared';
import type { AuthUser } from '../../common/decorators/params.decorator';
import { User } from '../../common/decorators/params.decorator';
import { PlatformFeedService } from '../../modules/smart-publishing/platform-feed.service';
import { PlatformAdminService } from './platform-admin.service';
import { UpdatePlatformUserStatusDto } from './dto/update-platform-user-status.dto';
import { UpdatePlatformUserRoleDto } from './dto/update-platform-user-role.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';
import { PlatformTransferOwnershipDto } from './dto/platform-transfer-ownership.dto';
import { DeletePlatformEntityDto } from './dto/delete-platform-entity.dto';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { CreatePlatformFeedDto, UpdatePlatformFeedDto } from './dto/platform-feed.dto';
import { ProbeFeedDto } from '../../modules/smart-publishing/dto/feed.dto';
import { TestGapGptConnectionDto } from '../../modules/smart-publishing/dto/publishing-settings.dto';
import { GapGptClient } from '../../modules/smart-publishing/gapgpt.client';
import { PublishingSettingsService } from '../../modules/smart-publishing/publishing-settings.service';
import { UpdateUsageMetricsDto } from '../usage/dto/update-usage-metrics.dto';
import { UpdatePlatformAiSettingsDto } from './dto/platform-ai-settings.dto';
import { UpdatePlatformSourceFetchSettingsDto } from './dto/platform-source-fetch-settings.dto';
import { SourceReaderService } from '../../modules/smart-publishing/source-reader.service';

@Controller('platform')
export class PlatformAdminController {
  constructor(
    private readonly service: PlatformAdminService,
    private readonly platformFeeds: PlatformFeedService,
    private readonly publishingSettings: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly sourceReader: SourceReaderService,
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

  @Get('feeds')
  listPlatformFeeds(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.platformFeeds.listAll();
  }

  @Post('feeds')
  createPlatformFeed(@User() actor: AuthUser, @Body() body: CreatePlatformFeedDto) {
    this.assertSuperAdmin(actor);
    return this.platformFeeds.create(body);
  }

  @Patch('feeds/:id')
  updatePlatformFeed(@User() actor: AuthUser, @Param('id') id: string, @Body() body: UpdatePlatformFeedDto) {
    this.assertSuperAdmin(actor);
    return this.platformFeeds.update(id, body);
  }

  @Delete('feeds/:id')
  deletePlatformFeed(@User() actor: AuthUser, @Param('id') id: string) {
    this.assertSuperAdmin(actor);
    return this.platformFeeds.delete(id);
  }

  @Post('feeds/probe')
  probePlatformFeed(@User() actor: AuthUser, @Body() body: ProbeFeedDto) {
    this.assertSuperAdmin(actor);
    return this.platformFeeds.probe(body);
  }

  @Post('feeds/audit')
  auditPlatformFeeds(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.platformFeeds.auditAll();
  }

  @Post('feeds/:id/test')
  testPlatformFeed(@User() actor: AuthUser, @Param('id') id: string) {
    this.assertSuperAdmin(actor);
    return this.platformFeeds.test(id);
  }

  @Post('feeds/:id/fetch')
  fetchPlatformFeed(@User() actor: AuthUser, @Param('id') id: string) {
    this.assertSuperAdmin(actor);
    return this.platformFeeds.fetch(id);
  }

  @Get('ai-settings')
  aiSettings(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishingSettings.getGlobalAiPublic();
  }

  @Put('ai-settings')
  saveAiSettings(@User() actor: AuthUser, @Body() body: UpdatePlatformAiSettingsDto) {
    this.assertSuperAdmin(actor);
    return this.publishingSettings.saveGlobalAi(body);
  }

  @Post('ai-settings/test-gapgpt')
  async testGapGpt(@User() actor: AuthUser, @Body() body: TestGapGptConnectionDto) {
    this.assertSuperAdmin(actor);
    return this.gapGpt.test(this.publishingSettings.mergeForGlobalAiTest(await this.publishingSettings.getGlobalAiRaw(), body));
  }

  @Post('ai-settings/gapgpt-models')
  async gapGptModels(@User() actor: AuthUser, @Body() body: TestGapGptConnectionDto) {
    this.assertSuperAdmin(actor);
    return this.gapGpt.models(this.publishingSettings.mergeForGlobalAiTest(await this.publishingSettings.getGlobalAiRaw(), body));
  }

  @Get('source-fetch-settings')
  sourceFetchSettings(@User() actor: AuthUser) {
    this.assertSuperAdmin(actor);
    return this.publishingSettings.getGlobalSourceFetchPublic();
  }

  @Put('source-fetch-settings')
  saveSourceFetchSettings(@User() actor: AuthUser, @Body() body: UpdatePlatformSourceFetchSettingsDto) {
    this.assertSuperAdmin(actor);
    return this.publishingSettings.saveGlobalSourceFetch(body);
  }

  @Post('source-fetch-settings/test')
  async testSourceFetchSettings(@User() actor: AuthUser, @Body() body: UpdatePlatformSourceFetchSettingsDto) {
    this.assertSuperAdmin(actor);
    const merged = this.publishingSettings.mergeForGlobalSourceFetchTest(
      await this.publishingSettings.getGlobalSourceFetchRaw(),
      body,
    );
    return this.sourceReader.testSourceFetchBridge(merged);
  }
}
