import { Injectable } from '@nestjs/common';
import { PlatformPublishingPort } from '../../contracts/platform-publishing.port';
import { PlatformFeedService } from './platform-feed.service';
import { FeedBulkService } from './feed-bulk.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { GapGptClient } from './gapgpt.client';
import { SourceReaderService } from './source-reader.service';
import type { CreatePlatformFeedDto, UpdatePlatformFeedDto } from '../../platform/admin/dto/platform-feed.dto';
import type { ProbeFeedDto } from './dto/feed.dto';
import type { TestGapGptConnectionDto } from './dto/publishing-settings.dto';
import type { UpdatePlatformAiSettingsDto } from '../../platform/admin/dto/platform-ai-settings.dto';
import type { UpdatePlatformCatalogHealthSettingsDto } from '../../platform/admin/dto/platform-catalog-health-settings.dto';
import type { UpdatePlatformSourceFetchSettingsDto } from '../../platform/admin/dto/platform-source-fetch-settings.dto';

@Injectable()
export class PlatformPublishingFacade implements PlatformPublishingPort {
  constructor(
    private readonly platformFeeds: PlatformFeedService,
    private readonly feedBulk: FeedBulkService,
    private readonly settings: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly sourceReader: SourceReaderService,
  ) {}

  exportFeeds() { return this.feedBulk.exportPlatformWorkbook(); }
  importFeeds(buffer: Buffer) { return this.feedBulk.importPlatformWorkbook(buffer); }
  listFeeds() { return this.platformFeeds.listAll(); }
  listSourceLanguages() { return this.platformFeeds.listSourceLanguageCatalog(); }
  createFeed(body: CreatePlatformFeedDto) { return this.platformFeeds.create(body); }
  updateFeed(id: string, body: UpdatePlatformFeedDto) { return this.platformFeeds.update(id, body); }
  deleteFeed(id: string) { return this.platformFeeds.delete(id); }
  probeFeed(body: ProbeFeedDto) { return this.platformFeeds.probe(body); }
  auditFeeds() { return this.platformFeeds.auditAll(); }
  testFeed(id: string) { return this.platformFeeds.test(id); }
  fetchFeed(id: string) { return this.platformFeeds.fetch(id); }
  startCatalogHealth() { return this.platformFeeds.startCatalogHealthChecksManual(); }
  catalogHealthStatus() { return this.platformFeeds.getCatalogHealthRunStatus(); }
  catalogHealthSettings() { return this.settings.getGlobalCatalogHealthPublic(); }
  saveCatalogHealth(body: UpdatePlatformCatalogHealthSettingsDto) { return this.settings.saveGlobalCatalogHealth(body); }
  aiSettings() { return this.settings.getGlobalAiPublic(); }
  saveAiSettings(body: UpdatePlatformAiSettingsDto) { return this.settings.saveGlobalAi(body); }
  async testGapGpt(body: TestGapGptConnectionDto) {
    return this.gapGpt.test(this.settings.mergeForGlobalAiTest(await this.settings.getGlobalAiRaw(), body));
  }
  async gapGptModels(body: TestGapGptConnectionDto) {
    return this.gapGpt.models(this.settings.mergeForGlobalAiTest(await this.settings.getGlobalAiRaw(), body));
  }
  sourceFetchSettings() { return this.settings.getGlobalSourceFetchPublic(); }
  saveSourceFetch(body: UpdatePlatformSourceFetchSettingsDto) { return this.settings.saveGlobalSourceFetch(body); }
  async testSourceFetch(body: UpdatePlatformSourceFetchSettingsDto) {
    const merged = this.settings.mergeForGlobalSourceFetchTest(await this.settings.getGlobalSourceFetchRaw(), body);
    return this.sourceReader.testSourceFetchBridge(merged);
  }
}
