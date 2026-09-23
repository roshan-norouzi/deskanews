import type { CreatePlatformFeedDto, UpdatePlatformFeedDto } from '../platform/admin/dto/platform-feed.dto';
import type { ProbeFeedDto } from '../modules/smart-publishing/dto/feed.dto';
import type { TestGapGptConnectionDto } from '../modules/smart-publishing/dto/publishing-settings.dto';
import type { UpdatePlatformAiSettingsDto } from '../platform/admin/dto/platform-ai-settings.dto';
import type { UpdatePlatformCatalogHealthSettingsDto } from '../platform/admin/dto/platform-catalog-health-settings.dto';
import type { UpdatePlatformSourceFetchSettingsDto } from '../platform/admin/dto/platform-source-fetch-settings.dto';

export const PLATFORM_PUBLISHING_PORT = Symbol('PLATFORM_PUBLISHING_PORT');

/** Platform admin uses publishing through this boundary, not by importing its services. */
export interface PlatformPublishingPort {
  exportFeeds(): Promise<Buffer> | Buffer;
  importFeeds(buffer: Buffer): Promise<unknown>;
  listFeeds(): Promise<unknown>;
  listSourceLanguages(): Promise<unknown>;
  createFeed(body: CreatePlatformFeedDto): Promise<unknown>;
  updateFeed(id: string, body: UpdatePlatformFeedDto): Promise<unknown>;
  deleteFeed(id: string): Promise<unknown>;
  probeFeed(body: ProbeFeedDto): Promise<unknown>;
  auditFeeds(): Promise<unknown>;
  testFeed(id: string): Promise<unknown>;
  fetchFeed(id: string): Promise<unknown>;
  startCatalogHealth(): Promise<unknown>;
  catalogHealthStatus(): unknown;
  catalogHealthSettings(): Promise<unknown>;
  saveCatalogHealth(body: UpdatePlatformCatalogHealthSettingsDto): Promise<unknown>;
  aiSettings(): Promise<unknown>;
  saveAiSettings(body: UpdatePlatformAiSettingsDto): Promise<unknown>;
  testGapGpt(body: TestGapGptConnectionDto): Promise<unknown>;
  gapGptModels(body: TestGapGptConnectionDto): Promise<unknown>;
  sourceFetchSettings(): Promise<unknown>;
  saveSourceFetch(body: UpdatePlatformSourceFetchSettingsDto): Promise<unknown>;
  testSourceFetch(body: UpdatePlatformSourceFetchSettingsDto): Promise<unknown>;
}
