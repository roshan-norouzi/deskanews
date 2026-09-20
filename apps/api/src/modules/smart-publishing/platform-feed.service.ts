import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DEFAULT_PLATFORM_FEEDS, FEED_CATALOG_GROUP_ORDER, PLATFORM_FEED_CATALOG_VERSION, USAGE_METRIC_KEYS, detectSourceLanguageFromItems, feedCatalogGroupFromSourceType, mergeSourceLanguageCatalog, normalizeFeedSourceType, normalizeSourceLanguage, resolveFeedLogoUrl, shouldUsePersianRewrite, sourceLanguageLabel, type FeedCatalogGroup } from '@deska/shared';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SourceReaderService } from './source-reader.service';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import { entryFilterText, matchesWordFilters, parseWordList } from './feed-word-filter';
import { buildLatestFeedPreviewItems } from './feed-preview';
import {
  DEFAULT_PLATFORM_POLL_MINUTES,
  isAutoPollingSubscription,
  isSubscriptionDue,
  resolveTenantFeedSettings,
  shouldRefreshSharedCatalog,
} from './tenant-platform-feed-settings';
import type { CreatePlatformFeedDto, UpdatePlatformFeedDto } from '../../platform/admin/dto/platform-feed.dto';
import type { ProbeFeedDto, SourceType, UpdateTenantPlatformFeedDto } from './dto/feed.dto';
import { UsageTrackingService } from '../../platform/usage/usage-tracking.service';
import { DestinationCategoryService } from './destination-category.service';
import {
  evaluatePlatformFeedHealth,
  normalizeCatalogHealthIntervalHours,
  parseCatalogHealthEnabled,
  PLATFORM_FEED_HEALTH_ITEM_TARGET,
  CATALOG_HEALTH_CHECK_CONCURRENCY,
  type PlatformFeedHealthStatus,
} from './platform-feed-health';

const PLATFORM_ARTICLE_MAX_AGE_DAYS = 10;

function mapCatalogFeed(feed: {
  id: string;
  name: string;
  url: string;
  sourceType: string;
  catalogGroup: string;
  resolvedFeedUrl: string;
  sourceLanguage: string;
  logoUrl: string;
  enabled: boolean;
  lastFetchedAt: Date | null;
  lastError: string;
  healthStatus?: string;
  healthCheckedAt?: Date | null;
  healthItemCount?: number;
  healthError?: string;
  healthFailSince?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: feed.id,
    name: feed.name,
    url: feed.url,
    sourceType: feed.sourceType,
    catalogGroup: feed.catalogGroup,
    resolvedFeedUrl: feed.resolvedFeedUrl,
    sourceLanguage: feed.sourceLanguage,
    logoUrl: resolveFeedLogoUrl(feed.url, feed.logoUrl, feed.sourceType),
    logoUrlOverride: feed.logoUrl,
    enabled: feed.enabled,
    lastFetchedAt: feed.lastFetchedAt,
    lastError: feed.healthStatus === 'degraded' || feed.healthStatus === 'down' ? (feed.healthError || '') : '',
    healthStatus: feed.healthStatus || 'unknown',
    healthCheckedAt: feed.healthCheckedAt,
    healthItemCount: feed.healthItemCount ?? 0,
    healthError: feed.healthError || '',
    healthFailSince: feed.healthFailSince,
    createdAt: feed.createdAt,
    updatedAt: feed.updatedAt,
  };
}

function mapTenantPlatformFeedRow(row: {
  id: string;
  enabled: boolean;
  autoPoll: boolean | null;
  autoPrepare: boolean | null;
  autoPublish: boolean | null;
  autoSendSocial: boolean | null;
  settingsMode: string;
  includeWords: string[];
  excludeWords: string[];
  pollIntervalMinutes: number | null;
  lastSyncedAt?: Date | null;
  platformFeed: {
    id: string;
    name: string;
    url: string;
    sourceType: string;
    catalogGroup: string;
    resolvedFeedUrl: string;
    sourceLanguage: string;
    logoUrl: string;
    enabled: boolean;
    lastFetchedAt: Date | null;
    lastError: string;
  };
}) {
  const resolved = resolveTenantFeedSettings(row);
  return {
    id: row.platformFeed.id,
    scope: 'platform' as const,
    subscriptionId: row.id,
    name: row.platformFeed.name,
    url: row.platformFeed.url,
    sourceType: row.platformFeed.sourceType,
    catalogGroup: row.platformFeed.catalogGroup,
    resolvedFeedUrl: row.platformFeed.resolvedFeedUrl,
    logoUrl: resolveFeedLogoUrl(row.platformFeed.url, row.platformFeed.logoUrl, row.platformFeed.sourceType),
    includeWords: resolved.includeWords,
    excludeWords: resolved.excludeWords,
    pollIntervalMinutes: resolved.pollIntervalMinutes,
    pollIntervalOverride: row.settingsMode === 'custom' ? row.pollIntervalMinutes : null,
    settingsMode: resolved.settingsMode,
    customIncludeWords: row.includeWords,
    customExcludeWords: row.excludeWords,
    catalogPollIntervalMinutes: DEFAULT_PLATFORM_POLL_MINUTES,
    sourceLanguage: row.platformFeed.sourceLanguage,
    purpose: 'news-room' as const,
    enabled: row.enabled,
    platformEnabled: row.platformFeed.enabled,
    lastFetchedAt: row.lastSyncedAt ?? row.platformFeed.lastFetchedAt,
    lastError: '',
    autoPoll: row.autoPoll,
    autoPrepare: row.autoPrepare,
    autoPublish: row.autoPublish,
    autoSendSocial: row.autoSendSocial,
  };
}

function normalizeFeedUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    url.hash = '';
    return url.toString();
  } catch {
    throw new BadRequestException('آدرس منبع معتبر نیست');
  }
}

function normalizeSourceType(value: unknown): SourceType {
  return normalizeFeedSourceType(value);
}

function normalizeCatalogGroup(
  sourceType: SourceType,
  catalogGroup: unknown,
  sourceLanguage?: string,
): FeedCatalogGroup {
  const normalized = String(catalogGroup || '').trim();
  if ((FEED_CATALOG_GROUP_ORDER as readonly string[]).includes(normalized)) {
    return normalized as FeedCatalogGroup;
  }
  const mediaScope = sourceLanguage === 'fa' ? 'domestic' : 'international';
  return feedCatalogGroupFromSourceType(sourceType, mediaScope);
}

const PLATFORM_FEED_LIST_SELECT = {
  id: true,
  name: true,
  url: true,
  sourceType: true,
  catalogGroup: true,
  resolvedFeedUrl: true,
  sourceLanguage: true,
  logoUrl: true,
  enabled: true,
  lastFetchedAt: true,
  lastError: true,
  healthStatus: true,
  healthCheckedAt: true,
  healthItemCount: true,
  healthError: true,
  healthFailSince: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PlatformFeedService implements OnModuleInit {
  private readonly logger = new Logger(PlatformFeedService.name);
  private maintenanceRunning = false;
  private healthMaintenanceRunning = false;
  private socialPhotoBackfillRunning = false;
  private readonly subscriptionEnsureInflight = new Map<string, Promise<void>>();
  private catalogHealthRun = {
    running: false,
    checked: 0,
    total: 0,
    startedAt: null as string | null,
    finishedAt: null as string | null,
    healthy: 0,
    degraded: 0,
    down: 0,
    errorMessage: '',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceReader: SourceReaderService,
    private readonly gapGpt: GapGptClient,
    private readonly settings: PublishingSettingsService,
    private readonly usageTracking: UsageTrackingService,
    private readonly destinationCategories: DestinationCategoryService,
  ) {}

  onModuleInit() {
    void this.ensureDefaultPlatformFeeds().catch((error) => {
      this.logger.warn(`Default platform feeds could not be ensured: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }

  private async readStoredCatalogVersion(): Promise<number> {
    try {
      const row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
      const settings = (row?.settings ?? {}) as Record<string, unknown>;
      const version = settings.platformFeedCatalogVersion;
      return typeof version === 'number' ? version : 0;
    } catch {
      return 0;
    }
  }

  private async writeStoredCatalogVersion() {
    const row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
    const settings = {
      ...((row?.settings ?? {}) as Record<string, unknown>),
      platformFeedCatalogVersion: PLATFORM_FEED_CATALOG_VERSION,
    };
    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', settings },
      update: { settings },
    });
  }

  async ensureDefaultPlatformFeeds() {
    const storedVersion = await this.readStoredCatalogVersion();
    const addMissingFromCode = storedVersion < PLATFORM_FEED_CATALOG_VERSION;
    if (addMissingFromCode) {
      this.logger.log(
        `Ensuring missing platform catalog feeds for version ${PLATFORM_FEED_CATALOG_VERSION} (${DEFAULT_PLATFORM_FEEDS.length} default feeds)`,
      );
    }

    for (const seed of DEFAULT_PLATFORM_FEEDS) {
      const existing = await this.prisma.platformFeed.findUnique({ where: { url: seed.url } });
      if (existing) {
        await this.ensureSubscriptionsForAllTenants(existing.id);
        continue;
      }
      const existingByName = await this.prisma.platformFeed.findFirst({ where: { name: seed.name } });
      if (existingByName) {
        await this.ensureSubscriptionsForAllTenants(existingByName.id);
        continue;
      }
      if (!addMissingFromCode && storedVersion > 0) continue;

      let resolvedFeedUrl = '';
      if (seed.sourceType === 'website') {
        resolvedFeedUrl = (await this.sourceReader.discoverFeedUrl(seed.url).catch(() => null)) || '';
      }

      const feed = await this.prisma.platformFeed.create({
        data: {
          name: seed.name,
          url: seed.url,
          sourceType: seed.sourceType,
          catalogGroup: seed.catalogGroup,
          resolvedFeedUrl,
        sourceLanguage: seed.sourceLanguage,
        pollIntervalMinutes: DEFAULT_PLATFORM_POLL_MINUTES,
        includeWords: [],
        excludeWords: [],
        logoUrl: '',
        enabled: true,
          lastError: '',
        },
      });
      await this.ensureSubscriptionsForAllTenants(feed.id);
    }

    if (addMissingFromCode) {
      await this.writeStoredCatalogVersion();
    }
  }

  async listAll() {
    const feeds = await this.prisma.platformFeed.findMany({
      orderBy: { name: 'asc' },
      select: PLATFORM_FEED_LIST_SELECT,
    });
    this.scheduleSocialPhotoBackfill(feeds);
    return feeds.map(mapCatalogFeed);
  }

  async listSourceLanguageCatalog() {
    const learned = await this.settings.listLearnedSourceLanguages();
    const [platform, tenant] = await Promise.all([
      this.prisma.platformFeed.findMany({ select: { sourceLanguage: true }, distinct: ['sourceLanguage'] }),
      this.prisma.newsFeed.findMany({ select: { sourceLanguage: true }, distinct: ['sourceLanguage'] }),
    ]);
    return mergeSourceLanguageCatalog([
      ...learned,
      ...platform.map((row) => row.sourceLanguage),
      ...tenant.map((row) => row.sourceLanguage),
    ]).map((code) => ({ code, label: sourceLanguageLabel(code) }));
  }

  async create(data: CreatePlatformFeedDto) {
    const name = data.name.trim();
    const url = normalizeFeedUrl(data.url);
    const sourceType = normalizeSourceType(data.sourceType);
    const duplicate = await this.prisma.platformFeed.findUnique({ where: { url } });
    if (duplicate) throw new ConflictException('این منبع پیش‌فرض قبلاً ثبت شده است');

    let resolvedFeedUrl = '';
    if (sourceType === 'website') {
      resolvedFeedUrl = (await this.sourceReader.discoverFeedUrl(url).catch(() => null)) || '';
    }

    const sourceLanguage = normalizeSourceLanguage(data.sourceLanguage);
    const profilePhoto = (sourceType === 'telegram' || sourceType === 'twitter')
      ? await this.sourceReader.resolveFeedProfilePhoto(url, sourceType).catch(() => '')
      : '';
    const feed = await this.prisma.platformFeed.create({
      data: {
        name,
        url,
        sourceType,
        catalogGroup: normalizeCatalogGroup(sourceType, data.catalogGroup, sourceLanguage),
        resolvedFeedUrl,
        includeWords: [],
        excludeWords: [],
        pollIntervalMinutes: DEFAULT_PLATFORM_POLL_MINUTES,
        sourceLanguage,
        logoUrl: String(data.logoUrl ?? '').trim() || profilePhoto,
        enabled: data.enabled ?? true,
      },
    });
    await this.ensureSubscriptionsForAllTenants(feed.id);
    if (sourceLanguage !== 'auto') {
      await this.settings.rememberSourceLanguages([sourceLanguage]).catch(() => undefined);
    }
    return mapCatalogFeed(feed);
  }

  async update(id: string, data: UpdatePlatformFeedDto) {
    const feed = await this.findFeed(id);
    const name = String(data.name ?? feed.name).trim();
    const url = normalizeFeedUrl(String(data.url ?? feed.url));
    const sourceType = normalizeSourceType(data.sourceType ?? feed.sourceType);
    const duplicate = await this.prisma.platformFeed.findFirst({ where: { url, NOT: { id } } });
    if (duplicate) throw new ConflictException('این آدرس قبلاً ثبت شده است');

    let resolvedFeedUrl = feed.resolvedFeedUrl;
    if (sourceType === 'website' && (data.url || data.sourceType)) {
      resolvedFeedUrl = (await this.sourceReader.discoverFeedUrl(url).catch(() => null)) || '';
    } else if (sourceType === 'rss') {
      resolvedFeedUrl = '';
    }

    const sourceLanguage = normalizeSourceLanguage(data.sourceLanguage ?? feed.sourceLanguage);
    const updated = await this.prisma.platformFeed.update({
      where: { id },
      data: {
        name,
        url,
        sourceType,
        catalogGroup: normalizeCatalogGroup(sourceType, data.catalogGroup ?? feed.catalogGroup, sourceLanguage),
        resolvedFeedUrl,
        ...(data.sourceLanguage !== undefined ? { sourceLanguage } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: String(data.logoUrl).trim() } : {}),
      },
    });
    if (data.sourceLanguage !== undefined && sourceLanguage !== 'auto') {
      await this.settings.rememberSourceLanguages([sourceLanguage]).catch(() => undefined);
    }
    return mapCatalogFeed(updated);
  }

  async delete(id: string) {
    await this.findFeed(id);
    await this.prisma.platformFeed.delete({ where: { id } });
    return { ok: true };
  }

  async probe(dto: ProbeFeedDto) {
    const url = normalizeFeedUrl(dto.url);
    const sourceType = normalizeSourceType(dto.sourceType);
    const includeWords = parseWordList(dto.includeWords);
    const excludeWords = parseWordList(dto.excludeWords);
    const resolvedFeedUrl = sourceType === 'website'
      ? ((await this.sourceReader.discoverFeedUrl(url).catch(() => null)) || '')
      : '';
    const entries = await this.sourceReader.readSource(sourceType, url);
    const items = buildLatestFeedPreviewItems(entries, includeWords, excludeWords);
    return {
      ok: true,
      source: {
        name: dto.name?.trim() || url,
        url,
        sourceType,
        resolvedFeedUrl: resolvedFeedUrl || undefined,
      },
      discoveredFeedUrl: resolvedFeedUrl || null,
      items,
    };
  }

  async test(id: string) {
    const feed = await this.findFeed(id);
    const health = await this.checkFeedHealth(feed);
    const items = health.items;
    return {
      ok: health.status === 'healthy',
      source: {
        id: feed.id,
        name: feed.name,
        url: feed.url,
        sourceType: feed.sourceType,
        resolvedFeedUrl: feed.resolvedFeedUrl,
      },
      discoveredFeedUrl: feed.resolvedFeedUrl || null,
      healthStatus: health.status,
      healthError: health.errorMessage,
      items,
    };
  }

  getCatalogHealthRunStatus() {
    return {
      ok: true,
      running: this.catalogHealthRun.running,
      checked: this.catalogHealthRun.checked,
      total: this.catalogHealthRun.total,
      startedAt: this.catalogHealthRun.startedAt,
      finishedAt: this.catalogHealthRun.finishedAt,
      healthy: this.catalogHealthRun.healthy,
      degraded: this.catalogHealthRun.degraded,
      down: this.catalogHealthRun.down,
      errorMessage: this.catalogHealthRun.errorMessage,
    };
  }

  async startCatalogHealthChecksManual() {
    if (this.catalogHealthRun.running) {
      return {
        ok: true,
        started: false,
        running: true,
        checked: this.catalogHealthRun.checked,
        total: this.catalogHealthRun.total,
      };
    }

    const feeds = await this.prisma.platformFeed.findMany({
      where: { enabled: true },
      orderBy: [{ catalogGroup: 'asc' }, { name: 'asc' }],
    });

    this.catalogHealthRun = {
      running: true,
      checked: 0,
      total: feeds.length,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      healthy: 0,
      degraded: 0,
      down: 0,
      errorMessage: '',
    };

    void this.executeCatalogHealthChecks(feeds)
      .then(async (summary) => {
        this.catalogHealthRun.healthy = summary.healthy;
        this.catalogHealthRun.degraded = summary.degraded;
        this.catalogHealthRun.down = summary.down;
        await this.settings.markCatalogHealthLastRun(new Date());
      })
      .catch((error) => {
        this.catalogHealthRun.errorMessage = error instanceof Error ? error.message : 'اجرای تست سلامت ناموفق بود';
        this.logger.warn(`Manual catalog health run failed: ${this.catalogHealthRun.errorMessage}`);
      })
      .finally(() => {
        this.catalogHealthRun.running = false;
        this.catalogHealthRun.finishedAt = new Date().toISOString();
      });

    return {
      ok: true,
      started: true,
      running: true,
      checked: 0,
      total: feeds.length,
    };
  }

  async runCatalogHealthChecks() {
    const feeds = await this.prisma.platformFeed.findMany({
      where: { enabled: true },
      orderBy: [{ catalogGroup: 'asc' }, { name: 'asc' }],
    });
    const summary = await this.executeCatalogHealthChecks(feeds);
    await this.settings.markCatalogHealthLastRun(new Date());
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      total: summary.total,
      healthy: summary.healthy,
      degraded: summary.degraded,
      down: summary.down,
      results: summary.results,
    };
  }

  private async executeCatalogHealthChecks(feeds: Array<{
    id: string;
    name: string;
    url: string;
    sourceType: string;
    resolvedFeedUrl: string;
    sourceLanguage?: string;
    healthFailSince?: Date | null;
  }>) {
    const results: Array<{
      feedId: string;
      name: string;
      status: PlatformFeedHealthStatus;
      itemCount: number;
      errorMessage: string;
    }> = new Array(feeds.length);
    let checked = 0;
    let cursor = 0;

    const workers = Array.from(
      { length: Math.min(CATALOG_HEALTH_CHECK_CONCURRENCY, Math.max(feeds.length, 1)) },
      async () => {
        while (cursor < feeds.length) {
          const index = cursor;
          cursor += 1;
          const feed = feeds[index];
          results[index] = await this.checkFeedHealth(feed);
          checked += 1;
          this.catalogHealthRun.checked = checked;
        }
      },
    );

    await Promise.all(workers);

    return {
      total: results.length,
      healthy: results.filter((item) => item.status === 'healthy').length,
      degraded: results.filter((item) => item.status === 'degraded').length,
      down: results.filter((item) => item.status === 'down').length,
      results: results.map((item) => ({
        id: item.feedId,
        name: item.name,
        status: item.status,
        itemCount: item.itemCount,
        errorMessage: item.errorMessage,
      })),
    };
  }

  private async checkFeedHealth(feed: {
    id: string;
    name: string;
    url: string;
    sourceType: string;
    resolvedFeedUrl: string;
    sourceLanguage?: string;
    healthFailSince?: Date | null;
  }) {
    try {
      const { entries } = await this.sourceReader.readSourceWithMeta(feed.sourceType || 'rss', feed.url, {
        resolvedFeedUrl: feed.resolvedFeedUrl,
      });
      const items = buildLatestFeedPreviewItems(entries, [], [], PLATFORM_FEED_HEALTH_ITEM_TARGET);
      const evaluation = evaluatePlatformFeedHealth({
        itemCount: items.length,
        totalEntries: entries.length,
        previousFailSince: feed.healthFailSince,
      });
      await this.persistFeedHealth(feed.id, evaluation, items.length, {
        currentLanguage: feed.sourceLanguage,
        items,
      });
      return {
        feedId: feed.id,
        name: feed.name,
        status: evaluation.status,
        itemCount: items.length,
        errorMessage: evaluation.errorMessage,
        items,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته دریافت منبع';
      const evaluation = evaluatePlatformFeedHealth({
        itemCount: 0,
        totalEntries: 0,
        previousFailSince: feed.healthFailSince,
        failed: true,
        errorMessage: message.slice(0, 500),
      });
      await this.persistFeedHealth(feed.id, evaluation, 0);
      return {
        feedId: feed.id,
        name: feed.name,
        status: evaluation.status,
        itemCount: 0,
        errorMessage: evaluation.errorMessage,
        items: [],
      };
    }
  }

  private async persistFeedHealth(
    feedId: string,
    evaluation: { status: PlatformFeedHealthStatus; failSince: Date | null; errorMessage: string },
    itemCount: number,
    options?: {
      currentLanguage?: string;
      items?: Array<{ title?: string; summary?: string }>;
    },
  ) {
    const detectedLanguage = evaluation.status === 'healthy'
      ? detectSourceLanguageFromItems(options?.items || [])
      : 'auto';
    const currentLanguage = String(options?.currentLanguage || 'auto').trim() || 'auto';
    const shouldWriteLanguage = currentLanguage === 'auto' && detectedLanguage !== 'auto';

    await this.prisma.platformFeed.update({
      where: { id: feedId },
      data: {
        healthStatus: evaluation.status,
        healthCheckedAt: new Date(),
        healthItemCount: itemCount,
        healthError: evaluation.errorMessage,
        healthFailSince: evaluation.failSince,
        lastError: evaluation.status === 'healthy' ? '' : evaluation.errorMessage,
        ...(shouldWriteLanguage ? { sourceLanguage: detectedLanguage } : {}),
      },
    });
    if (detectedLanguage !== 'auto') {
      await this.settings.rememberSourceLanguages([detectedLanguage]).catch(() => undefined);
    }
  }

  private async shouldRunScheduledCatalogHealth(now = new Date()): Promise<boolean> {
    const settings = await this.settings.getGlobalCatalogHealthPublic();
    if (!parseCatalogHealthEnabled(settings.catalog_health_enabled)) return false;
    const intervalHours = normalizeCatalogHealthIntervalHours(settings.catalog_health_interval_hours);
    const lastRunRaw = settings.catalog_health_last_run_at;
    if (!lastRunRaw) return true;
    const lastRun = new Date(lastRunRaw);
    if (Number.isNaN(lastRun.getTime())) return true;
    return now.getTime() - lastRun.getTime() >= intervalHours * 60 * 60 * 1000;
  }

  async auditAll() {
    const feeds = await this.prisma.platformFeed.findMany({
      where: { enabled: true },
      orderBy: [{ catalogGroup: 'asc' }, { name: 'asc' }],
    });
    const results: Array<{
      id: string;
      name: string;
      url: string;
      sourceType: string;
      catalogGroup: string;
      ok: boolean;
      itemCount: number;
      latencyMs: number;
      lastError: string;
      sampleTitles: string[];
    }> = [];

    for (const feed of feeds) {
      const startedAt = Date.now();
      try {
        const { entries } = await this.sourceReader.readSourceWithMeta(feed.sourceType || 'rss', feed.url, {
          resolvedFeedUrl: feed.resolvedFeedUrl,
        });
        const items = buildLatestFeedPreviewItems(entries, [], []);
        results.push({
          id: feed.id,
          name: feed.name,
          url: feed.url,
          sourceType: feed.sourceType,
          catalogGroup: feed.catalogGroup,
          ok: true,
          itemCount: items.length,
          latencyMs: Date.now() - startedAt,
          lastError: '',
          sampleTitles: items.slice(0, 3).map((item) => item.title),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'خطای ناشناخته دریافت منبع';
        results.push({
          id: feed.id,
          name: feed.name,
          url: feed.url,
          sourceType: feed.sourceType,
          catalogGroup: feed.catalogGroup,
          ok: false,
          itemCount: 0,
          latencyMs: Date.now() - startedAt,
          lastError: message.slice(0, 500),
          sampleTitles: [],
        });
      }
    }

    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      total: feeds.length,
      passed: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    };
  }

  async fetch(id: string, options?: { tenantIds?: string[] }) {
    const feed = await this.findFeed(id);
    if (!feed.enabled) throw new BadRequestException('این منبع پیش‌فرض غیرفعال است');
    try {
      const cutoff = new Date(Date.now() - PLATFORM_ARTICLE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
      const { entries, resolvedFeedUrl } = await this.sourceReader.readSourceWithMeta(feed.sourceType || 'rss', feed.url, {
        resolvedFeedUrl: feed.resolvedFeedUrl,
      });
      const filtered = entries
        .filter((entry) => !entry.publishedAt || entry.publishedAt >= cutoff);

      let created = 0;
      for (const entry of filtered) {
        const result = await this.prisma.platformFeedArticle.upsert({
          where: { platformFeedId_canonicalUrl: { platformFeedId: feed.id, canonicalUrl: entry.canonicalUrl } },
          create: {
            platformFeedId: feed.id,
            canonicalUrl: entry.canonicalUrl,
            originalUrl: entry.canonicalUrl,
            guid: entry.guid,
            originalTitle: entry.title,
            originalSummary: entry.summary,
            originalContent: entry.content,
            originalContentIsFull: entry.contentIsFull,
            featuredImageUrl: entry.featuredImageUrl,
            sourceName: feed.name,
            publishedAtSource: entry.publishedAt,
          },
          update: {
            originalTitle: entry.title,
            originalSummary: entry.summary,
            originalContent: entry.content,
            originalContentIsFull: entry.contentIsFull,
            featuredImageUrl: entry.featuredImageUrl || undefined,
            publishedAtSource: entry.publishedAt,
          },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
      }

      await this.prisma.platformFeed.update({
        where: { id },
        data: {
          lastFetchedAt: new Date(),
          lastError: '',
          ...(resolvedFeedUrl && resolvedFeedUrl !== feed.resolvedFeedUrl ? { resolvedFeedUrl } : {}),
        },
      });

      const tenantIds = options?.tenantIds;
      const synced = tenantIds
        ? await this.syncTenants(id, tenantIds)
        : await this.syncFeedToSubscribedTenants(feed.id);
      await this.queueSharedPreparation(feed.id, 10, tenantIds?.[0]);

      return { ok: true, discovered: filtered.length, created, synced };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته دریافت منبع';
      await this.prisma.platformFeed.update({
        where: { id },
        data: { lastFetchedAt: new Date(), lastError: message.slice(0, 1000) },
      });
      throw error;
    }
  }

  async listForTenant(tenantId: string) {
    await this.ensureSubscriptions(tenantId);
    const rows = await this.prisma.tenantPlatformFeed.findMany({
      where: { tenantId },
      include: { platformFeed: { select: PLATFORM_FEED_LIST_SELECT } },
      orderBy: { platformFeed: { name: 'asc' } },
    });
    this.scheduleSocialPhotoBackfill(rows.map((row) => row.platformFeed));
    return rows.map((row) => mapTenantPlatformFeedRow(row));
  }

  private scheduleSocialPhotoBackfill(
    feeds: Array<{ id: string; url: string; sourceType: string; logoUrl: string }>,
  ) {
    if (this.socialPhotoBackfillRunning) return;
    const pending = feeds.filter(
      (feed) => !String(feed.logoUrl || '').trim() && feed.sourceType === 'twitter',
    );
    if (!pending.length) return;
    this.socialPhotoBackfillRunning = true;
    void this.backfillSocialProfilePhotos(pending).finally(() => {
      this.socialPhotoBackfillRunning = false;
    });
  }

  private async backfillSocialProfilePhotos(
    feeds: Array<{ id: string; url: string; sourceType: string; logoUrl: string }>,
  ) {
    const pending = feeds.filter(
      (feed) => !String(feed.logoUrl || '').trim() && feed.sourceType === 'twitter',
    );
    if (!pending.length) return;
    await Promise.all(pending.slice(0, 6).map(async (feed) => {
      const photo = await this.sourceReader.resolveFeedProfilePhoto(feed.url, feed.sourceType as SourceType).catch(() => '');
      if (!photo) return;
      feed.logoUrl = photo;
      await this.prisma.platformFeed.update({ where: { id: feed.id }, data: { logoUrl: photo } });
    }));
  }

  async updateSubscriptionForTenant(
    tenantId: string,
    platformFeedId: string,
    data: UpdateTenantPlatformFeedDto,
  ) {
    await this.ensureSubscriptions(tenantId);
    const subscription = await this.prisma.tenantPlatformFeed.findUnique({
      where: { tenantId_platformFeedId: { tenantId, platformFeedId } },
      include: { platformFeed: true },
    });
    if (!subscription) throw new NotFoundException('منبع پیش‌فرض یافت نشد');
    if (data.enabled === true && !subscription.platformFeed.enabled) {
      throw new BadRequestException('این منبع پیش‌فرض توسط مدیر کل غیرفعال شده است');
    }

    let payload = data;
    if (payload.settingsMode === 'default') {
      payload = {
        ...payload,
        settingsMode: 'default',
        includeWords: [],
        excludeWords: [],
        pollIntervalMinutes: null,
      };
    }

    const updated = await this.prisma.tenantPlatformFeed.update({
      where: { id: subscription.id },
      data: {
        ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
        ...(payload.autoPoll !== undefined ? { autoPoll: payload.autoPoll } : {}),
        ...(payload.autoPrepare !== undefined ? { autoPrepare: payload.autoPrepare } : {}),
        ...(payload.autoPublish !== undefined ? { autoPublish: payload.autoPublish } : {}),
        ...(payload.autoSendSocial !== undefined ? { autoSendSocial: payload.autoSendSocial } : {}),
        ...(payload.settingsMode !== undefined ? { settingsMode: payload.settingsMode } : {}),
        ...(payload.includeWords !== undefined ? { includeWords: parseWordList(payload.includeWords) } : {}),
        ...(payload.excludeWords !== undefined ? { excludeWords: parseWordList(payload.excludeWords) } : {}),
        ...(payload.pollIntervalMinutes !== undefined ? { pollIntervalMinutes: payload.pollIntervalMinutes } : {}),
      },
      include: { platformFeed: true },
    });

    if (data.enabled === true) {
      await this.syncFeedToTenant(tenantId, platformFeedId);
      await this.queueSharedPreparation(platformFeedId, 10, tenantId);
    }

    return mapTenantPlatformFeedRow(updated);
  }

  async toggleForTenant(tenantId: string, platformFeedId: string, enabled?: boolean) {
    await this.ensureSubscriptions(tenantId);
    const subscription = await this.prisma.tenantPlatformFeed.findUnique({
      where: { tenantId_platformFeedId: { tenantId, platformFeedId } },
    });
    if (!subscription) throw new NotFoundException('منبع پیش‌فرض یافت نشد');
    const nextEnabled = enabled ?? !subscription.enabled;
    return this.updateSubscriptionForTenant(tenantId, platformFeedId, { enabled: nextEnabled });
  }

  async syncFeedToSubscribedTenants(platformFeedId: string) {
    const subscriptions = await this.prisma.tenantPlatformFeed.findMany({
      where: { platformFeedId, enabled: true, tenant: { isActive: true, status: 'active' } },
      select: { tenantId: true },
    });
    return this.syncTenants(platformFeedId, subscriptions.map((row) => row.tenantId));
  }

  private async syncTenants(platformFeedId: string, tenantIds: string[]) {
    let synced = 0;
    for (const tenantId of tenantIds) {
      synced += await this.syncFeedToTenant(tenantId, platformFeedId);
    }
    return synced;
  }

  async syncTenantSubscriptions(tenantId: string, options?: { refresh?: boolean }) {
    await this.ensureSubscriptions(tenantId);
    const subscriptions = await this.prisma.tenantPlatformFeed.findMany({
      where: {
        tenantId,
        enabled: true,
        platformFeed: { enabled: true },
      },
      select: { platformFeedId: true },
    });

    const results: Array<{ platformFeedId: string; ok: boolean; created?: number; error?: string }> = [];
    for (const subscription of subscriptions) {
      try {
        if (options?.refresh) {
          await this.fetch(subscription.platformFeedId).catch((error) => {
            this.logger.warn(
              `Platform feed refresh failed for ${subscription.platformFeedId}: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
          });
        }
        const created = await this.syncFeedToTenant(tenantId, subscription.platformFeedId);
        await this.queueSharedPreparation(subscription.platformFeedId, 10, tenantId);
        results.push({ platformFeedId: subscription.platformFeedId, ok: true, created });
      } catch (error) {
        results.push({
          platformFeedId: subscription.platformFeedId,
          ok: false,
          error: error instanceof Error ? error.message : 'خطای همگام‌سازی منبع پیش‌فرض',
        });
      }
    }
    return results;
  }

  async syncFeedToTenant(tenantId: string, platformFeedId: string) {
    const feed = await this.findFeed(platformFeedId);
    const subscription = await this.prisma.tenantPlatformFeed.findUnique({
      where: { tenantId_platformFeedId: { tenantId, platformFeedId } },
    });
    const tenantSettings = resolveTenantFeedSettings(subscription ?? {});
    const articles = await this.prisma.platformFeedArticle.findMany({
      where: { platformFeedId },
      orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const filtered = articles.filter((article) => matchesWordFilters(
      entryFilterText({
        title: article.originalTitle,
        summary: article.originalSummary,
        content: article.originalContent,
      }),
      tenantSettings.includeWords,
      tenantSettings.excludeWords,
    ));

    const markSynced = () => this.prisma.tenantPlatformFeed.updateMany({
      where: { tenantId, platformFeedId },
      data: { lastSyncedAt: new Date() },
    });

    if (!filtered.length) {
      await markSynced();
      return 0;
    }

    const result = await this.prisma.newsArticle.createMany({
      skipDuplicates: true,
      data: filtered.map((article) => ({
        tenantId,
        platformFeedArticleId: article.id,
        canonicalUrl: article.canonicalUrl,
        originalUrl: article.originalUrl,
        guid: article.guid,
        originalTitle: article.originalTitle,
        originalSummary: article.originalSummary,
        originalContent: article.originalContent,
        originalContentIsFull: article.originalContentIsFull,
        featuredImageUrl: article.featuredImageUrl,
        sourceName: article.sourceName || feed.name,
        publishedAtSource: article.publishedAtSource,
        titleFa: article.titleFa,
        summaryFa: article.summaryFa,
        status: article.prepStatus === 'ready' ? 'ready' : 'new',
      })),
    });

    await this.prisma.tenantPlatformFeed.updateMany({
      where: { tenantId, platformFeedId },
      data: { lastSyncedAt: new Date() },
    });

    if (result.count > 0) {
      await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_MONITORED, result.count);
      await this.destinationCategories.categorizeArticlesByCanonicalUrls(
        tenantId,
        filtered.map((article) => article.canonicalUrl),
      ).catch((error) => {
        this.logger.warn(`Platform feed categorization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }

    for (const article of filtered.filter((row) => row.prepStatus === 'ready')) {
      await this.prisma.newsArticle.updateMany({
        where: { tenantId, platformFeedArticleId: article.id },
        data: {
          titleFa: article.titleFa,
          summaryFa: article.summaryFa,
          status: 'ready',
        },
      });
    }
    return result.count;
  }

  async prepareSharedArticle(platformFeedArticleId: string, tenantIdForSettings: string) {
    const article = await this.prisma.platformFeedArticle.findUnique({
      where: { id: platformFeedArticleId },
      include: { platformFeed: { select: { sourceLanguage: true } } },
    });
    if (!article || article.prepStatus === 'ready') return article;

    const settings = await this.settings.getRaw(tenantIdForSettings);
    const prepared = await this.gapGpt.summarize(settings, {
      sourceName: article.sourceName,
      title: article.originalTitle,
      summary: article.originalSummary || article.originalContent || article.originalTitle,
      sourceLanguage: article.platformFeed.sourceLanguage,
    });

    const updated = await this.prisma.platformFeedArticle.update({
      where: { id: platformFeedArticleId },
      data: {
        titleFa: prepared.title,
        summaryFa: prepared.summary,
        prepStatus: 'ready',
        prepLastError: '',
        preparedAt: new Date(),
      },
    });

    await this.prisma.newsArticle.updateMany({
      where: { platformFeedArticleId },
      data: {
        titleFa: prepared.title,
        summaryFa: prepared.summary,
        status: 'ready',
      },
    });

    const subscribedTenants = await this.prisma.newsArticle.findMany({
      where: { platformFeedArticleId },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    const summaryIsPersian = shouldUsePersianRewrite(
      article.platformFeed.sourceLanguage,
      `${article.originalTitle}\n${article.originalSummary || article.originalContent || ''}`,
    );
    await Promise.all(
      subscribedTenants.map(({ tenantId }) =>
        Promise.all([
          this.usageTracking.record(tenantId, summaryIsPersian ? USAGE_METRIC_KEYS.NEWS_REWRITTEN : USAGE_METRIC_KEYS.NEWS_SUMMARIZED, 1),
          this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_PREPARED, 1),
        ]),
      ),
    );

    return updated;
  }

  async queueSharedPreparation(platformFeedId: string, limit: number, preferredTenantId?: string) {
    const pending = await this.prisma.platformFeedArticle.findMany({
      where: { platformFeedId, prepStatus: 'new' },
      orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: { id: true },
    });
    if (!pending.length) return 0;

    let tenantId = preferredTenantId;
    if (!tenantId) {
      const subscription = await this.prisma.tenantPlatformFeed.findFirst({
        where: { platformFeedId, enabled: true, tenant: { isActive: true, status: 'active' } },
        select: { tenantId: true },
      });
      tenantId = subscription?.tenantId;
    }
    if (!tenantId) return 0;

    let prepared = 0;
    for (const row of pending) {
      try {
        await this.prepareSharedArticle(row.id, tenantId);
        prepared += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'خطای آماده‌سازی';
        await this.prisma.platformFeedArticle.update({
          where: { id: row.id },
          data: { prepStatus: 'failed', prepLastError: message.slice(0, 1000) },
        });
      }
    }
    return prepared;
  }

  @Interval('platform-feed-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      const feeds = await this.prisma.platformFeed.findMany({
        where: { enabled: true },
        include: {
          subscriptions: {
            where: { enabled: true, tenant: { isActive: true, status: 'active' } },
          },
        },
        orderBy: { lastFetchedAt: 'asc' },
      });
      for (const feed of feeds) {
        const due = feed.subscriptions.filter((subscription) => {
          if (!isAutoPollingSubscription(subscription)) return false;
          const settings = resolveTenantFeedSettings(subscription);
          return isSubscriptionDue(subscription.lastSyncedAt, settings.pollIntervalMinutes);
        });
        if (!due.length) continue;
        const dueTenantIds = due.map((subscription) => subscription.tenantId);
        const dueIntervals = due.map((subscription) => resolveTenantFeedSettings(subscription).pollIntervalMinutes);
        try {
          if (shouldRefreshSharedCatalog(feed.lastFetchedAt, dueIntervals)) {
            await this.fetch(feed.id, { tenantIds: dueTenantIds });
          } else {
            await this.syncTenants(feed.id, dueTenantIds);
            await this.queueSharedPreparation(feed.id, 10, dueTenantIds[0]);
          }
        } catch (error) {
          this.logger.warn(`Platform feed fetch failed for ${feed.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
    } catch (error) {
      this.logger.error(`Platform feed maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintenanceRunning = false;
    }
  }

  @Interval('platform-feed-health', 60_000)
  async healthMaintenance() {
    if (this.healthMaintenanceRunning) return;
    this.healthMaintenanceRunning = true;
    try {
      if (!(await this.shouldRunScheduledCatalogHealth())) return;
      const result = await this.runCatalogHealthChecks();
      this.logger.log(
        `Catalog health checks completed: ${result.healthy} healthy, ${result.degraded} degraded, ${result.down} down`,
      );
    } catch (error) {
      this.logger.warn(`Catalog health maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.healthMaintenanceRunning = false;
    }
  }

  private async ensureSubscriptionsForAllTenants(platformFeedId: string) {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true, status: 'active' },
      select: { id: true },
    });
    if (!tenants.length) return;
    await this.prisma.tenantPlatformFeed.createMany({
      skipDuplicates: true,
      data: tenants.map((tenant) => ({
        tenantId: tenant.id,
        platformFeedId,
        enabled: false,
      })),
    });
  }

  async ensureSubscriptions(tenantId: string) {
    const inflight = this.subscriptionEnsureInflight.get(tenantId);
    if (inflight) return inflight;
    const task = this.ensureSubscriptionsNow(tenantId).finally(() => {
      this.subscriptionEnsureInflight.delete(tenantId);
    });
    this.subscriptionEnsureInflight.set(tenantId, task);
    return task;
  }

  private async ensureSubscriptionsNow(tenantId: string) {
    const [feedCount, subscriptionCount] = await Promise.all([
      this.prisma.platformFeed.count(),
      this.prisma.tenantPlatformFeed.count({ where: { tenantId } }),
    ]);
    if (!feedCount || subscriptionCount >= feedCount) return;
    const feeds = await this.prisma.platformFeed.findMany({ select: { id: true } });
    if (!feeds.length) return;
    await this.prisma.tenantPlatformFeed.createMany({
      skipDuplicates: true,
      data: feeds.map((feed) => ({
        tenantId,
        platformFeedId: feed.id,
        enabled: false,
      })),
    });
  }

  private async findFeed(id: string) {
    const feed = await this.prisma.platformFeed.findUnique({ where: { id } });
    if (!feed) throw new NotFoundException('منبع پیش‌فرض یافت نشد');
    return feed;
  }
}
