import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DEFAULT_PLATFORM_FEEDS, FEED_CATALOG_GROUP_ORDER, PLATFORM_FEED_CATALOG_VERSION, USAGE_METRIC_KEYS, feedCatalogGroupFromSourceType, normalizeFeedSourceType, shouldUsePersianRewrite, type FeedCatalogGroup } from '@deska/shared';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SourceReaderService } from './source-reader.service';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import { entryFilterText, matchesWordFilters, parseWordList } from './feed-word-filter';
import { buildLatestFeedPreviewItems } from './feed-preview';
import type { CreatePlatformFeedDto, UpdatePlatformFeedDto } from '../../platform/admin/dto/platform-feed.dto';
import type { ProbeFeedDto, SourceType, UpdateTenantPlatformFeedDto } from './dto/feed.dto';
import { UsageTrackingService } from '../../platform/usage/usage-tracking.service';

const PLATFORM_ARTICLE_MAX_AGE_DAYS = 10;

function subscriptionPollInterval(row: unknown): number | null | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const value = (row as { pollIntervalMinutes?: unknown }).pollIntervalMinutes;
  if (value === null) return null;
  return typeof value === 'number' ? value : undefined;
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

@Injectable()
export class PlatformFeedService implements OnModuleInit {  private readonly logger = new Logger(PlatformFeedService.name);
  private maintenanceRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceReader: SourceReaderService,
    private readonly gapGpt: GapGptClient,
    private readonly settings: PublishingSettingsService,
    private readonly usageTracking: UsageTrackingService,
  ) {}

  onModuleInit() {
    void this.ensureDefaultPlatformFeeds().catch((error) => {
      this.logger.warn(`Default platform feeds could not be ensured: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }

  private catalogSeedUrls(): string[] {
    return [...new Set(DEFAULT_PLATFORM_FEEDS.map((feed) => feed.url))].sort();
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

  private async catalogNeedsRebuild(): Promise<boolean> {
    const storedVersion = await this.readStoredCatalogVersion();
    if (storedVersion !== PLATFORM_FEED_CATALOG_VERSION) return true;

    const seedUrls = this.catalogSeedUrls();
    const existing = await this.prisma.platformFeed.findMany({
      select: { url: true, lastError: true },
      orderBy: { url: 'asc' },
    });
    const existingUrls = existing.map((feed) => feed.url).sort();
    if (seedUrls.length !== existingUrls.length) return true;
    for (let index = 0; index < seedUrls.length; index += 1) {
      if (seedUrls[index] !== existingUrls[index]) return true;
    }
    return existing.some((feed) => feed.lastError.includes('حذف شده'));
  }

  async ensureDefaultPlatformFeeds() {
    if (await this.catalogNeedsRebuild()) {
      this.logger.log(
        `Rebuilding platform feed catalog to version ${PLATFORM_FEED_CATALOG_VERSION} (${DEFAULT_PLATFORM_FEEDS.length} feeds)`,
      );
      await this.prisma.platformFeed.deleteMany({});
    }

    for (const seed of DEFAULT_PLATFORM_FEEDS) {
      let resolvedFeedUrl = '';
      if (seed.sourceType === 'website') {
        resolvedFeedUrl = (await this.sourceReader.discoverFeedUrl(seed.url).catch(() => null)) || '';
      }

      const feed = await this.prisma.platformFeed.upsert({
        where: { url: seed.url },
        create: {
          name: seed.name,
          url: seed.url,
          sourceType: seed.sourceType,
          catalogGroup: seed.catalogGroup,
          resolvedFeedUrl,
          sourceLanguage: seed.sourceLanguage,
          pollIntervalMinutes: seed.pollIntervalMinutes,
          enabled: true,
          lastError: '',
        },
        update: {
          name: seed.name,
          sourceType: seed.sourceType,
          catalogGroup: seed.catalogGroup,
          resolvedFeedUrl,
          sourceLanguage: seed.sourceLanguage,
          pollIntervalMinutes: seed.pollIntervalMinutes,
          enabled: true,
          lastError: '',
        },
      });
      await this.ensureSubscriptionsForAllTenants(feed.id);
    }

    await this.writeStoredCatalogVersion();
  }

  listAll() {    return this.prisma.platformFeed.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(data: CreatePlatformFeedDto) {
    const name = data.name.trim();
    const url = normalizeFeedUrl(data.url);
    const sourceType = normalizeSourceType(data.sourceType);
    const duplicate = await this.prisma.platformFeed.findUnique({ where: { url } });
    if (duplicate) throw new ConflictException('این منبع پیش‌فرض قبلاً ثبت شده است');
    const tenantDuplicate = await this.prisma.newsFeed.findFirst({ where: { url } });
    if (tenantDuplicate) throw new ConflictException('این آدرس قبلاً به‌عنوان منبع سازمانی ثبت شده است');

    let resolvedFeedUrl = '';
    if (sourceType === 'website') {
      resolvedFeedUrl = (await this.sourceReader.discoverFeedUrl(url).catch(() => null)) || '';
    }

    const sourceLanguage = data.sourceLanguage ?? 'auto';
    const feed = await this.prisma.platformFeed.create({
      data: {
        name,
        url,
        sourceType,
        catalogGroup: normalizeCatalogGroup(sourceType, data.catalogGroup, sourceLanguage),
        resolvedFeedUrl,
        includeWords: parseWordList(data.includeWords),
        excludeWords: parseWordList(data.excludeWords),
        pollIntervalMinutes: data.pollIntervalMinutes ?? 240,
        sourceLanguage,
        enabled: data.enabled ?? true,
      },
    });
    await this.ensureSubscriptionsForAllTenants(feed.id);
    return feed;
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

    const sourceLanguage = data.sourceLanguage ?? feed.sourceLanguage;
    return this.prisma.platformFeed.update({
      where: { id },
      data: {
        name,
        url,
        sourceType,
        catalogGroup: normalizeCatalogGroup(sourceType, data.catalogGroup ?? feed.catalogGroup, sourceLanguage),
        resolvedFeedUrl,
        ...(data.includeWords !== undefined ? { includeWords: parseWordList(data.includeWords) } : {}),
        ...(data.excludeWords !== undefined ? { excludeWords: parseWordList(data.excludeWords) } : {}),
        ...(data.pollIntervalMinutes !== undefined ? { pollIntervalMinutes: data.pollIntervalMinutes } : {}),
        ...(data.sourceLanguage !== undefined ? { sourceLanguage: data.sourceLanguage } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });
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
    const entries = await this.sourceReader.readSource(feed.sourceType || 'rss', feed.url);
    const items = buildLatestFeedPreviewItems(entries, feed.includeWords, feed.excludeWords);
    return {
      ok: true,
      source: {
        id: feed.id,
        name: feed.name,
        url: feed.url,
        sourceType: feed.sourceType,
        resolvedFeedUrl: feed.resolvedFeedUrl,
      },
      discoveredFeedUrl: feed.resolvedFeedUrl || null,
      items,
    };
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
        const items = buildLatestFeedPreviewItems(entries, feed.includeWords, feed.excludeWords);
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

  async fetch(id: string) {
    const feed = await this.findFeed(id);
    if (!feed.enabled) throw new BadRequestException('این منبع پیش‌فرض غیرفعال است');
    const startedAt = Date.now();
    try {
      const cutoff = new Date(Date.now() - PLATFORM_ARTICLE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
      const { entries, resolvedFeedUrl } = await this.sourceReader.readSourceWithMeta(feed.sourceType || 'rss', feed.url, {
        resolvedFeedUrl: feed.resolvedFeedUrl,
      });
      const filtered = entries
        .filter((entry) => (!entry.publishedAt || entry.publishedAt >= cutoff)
          && matchesWordFilters(entryFilterText(entry), feed.includeWords, feed.excludeWords));

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

      const synced = await this.syncFeedToSubscribedTenants(feed.id);
      await this.queueSharedPreparation(feed.id, 10);

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
      include: { platformFeed: true },
      orderBy: { platformFeed: { createdAt: 'desc' } },
    });
    return rows.map((row) => ({
      id: row.platformFeedId,
      scope: 'platform' as const,
      subscriptionId: row.id,
      name: row.platformFeed.name,
      url: row.platformFeed.url,
      sourceType: row.platformFeed.sourceType,
      catalogGroup: row.platformFeed.catalogGroup,
      resolvedFeedUrl: row.platformFeed.resolvedFeedUrl,
      includeWords: row.platformFeed.includeWords,
      excludeWords: row.platformFeed.excludeWords,
      pollIntervalMinutes: subscriptionPollInterval(row) ?? row.platformFeed.pollIntervalMinutes,
      pollIntervalOverride: subscriptionPollInterval(row) ?? null,
      sourceLanguage: row.platformFeed.sourceLanguage,
      purpose: 'news-room' as const,
      enabled: row.enabled,
      platformEnabled: row.platformFeed.enabled,
      lastFetchedAt: row.platformFeed.lastFetchedAt,
      lastError: row.platformFeed.lastError,
      autoPoll: row.autoPoll,
      autoPrepare: row.autoPrepare,
      autoPublish: row.autoPublish,
      autoSendSocial: row.autoSendSocial,
    }));
  }

  async updateSubscriptionForTenant(
    tenantId: string,
    platformFeedId: string,
    data: UpdateTenantPlatformFeedDto,
    isOwner = false,
  ) {
    if (!isOwner) throw new ForbiddenException('فقط مالک سازمان می‌تواند منابع پیش‌فرض را مدیریت کند');
    await this.ensureSubscriptions(tenantId);
    const subscription = await this.prisma.tenantPlatformFeed.findUnique({
      where: { tenantId_platformFeedId: { tenantId, platformFeedId } },
      include: { platformFeed: true },
    });
    if (!subscription) throw new NotFoundException('منبع پیش‌فرض یافت نشد');
    if (data.enabled === true && !subscription.platformFeed.enabled) {
      throw new BadRequestException('این منبع پیش‌فرض توسط مدیر کل غیرفعال شده است');
    }

    const updated = await this.prisma.tenantPlatformFeed.update({
      where: { id: subscription.id },
      data: {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.autoPoll !== undefined ? { autoPoll: data.autoPoll } : {}),
        ...(data.autoPrepare !== undefined ? { autoPrepare: data.autoPrepare } : {}),
        ...(data.autoPublish !== undefined ? { autoPublish: data.autoPublish } : {}),
        ...(data.autoSendSocial !== undefined ? { autoSendSocial: data.autoSendSocial } : {}),
        ...(data.pollIntervalMinutes !== undefined ? { pollIntervalMinutes: data.pollIntervalMinutes } : {}),
      // Prisma client must be regenerated after migration 20260919140000.
      } as Parameters<PrismaService['tenantPlatformFeed']['update']>[0]['data'],
      include: { platformFeed: true },
    });

    if (data.enabled === true) {
      await this.syncFeedToTenant(tenantId, platformFeedId);
      await this.queueSharedPreparation(platformFeedId, 10, tenantId);
    }

    return {
      id: updated.platformFeedId,
      scope: 'platform' as const,
      subscriptionId: updated.id,
      name: updated.platformFeed.name,
      url: updated.platformFeed.url,
      sourceType: updated.platformFeed.sourceType,
      resolvedFeedUrl: updated.platformFeed.resolvedFeedUrl,
      includeWords: updated.platformFeed.includeWords,
      excludeWords: updated.platformFeed.excludeWords,
      pollIntervalMinutes: subscriptionPollInterval(updated) ?? updated.platformFeed.pollIntervalMinutes,
      pollIntervalOverride: subscriptionPollInterval(updated) ?? null,
      sourceLanguage: updated.platformFeed.sourceLanguage,
      purpose: 'news-room' as const,
      enabled: updated.enabled,
      platformEnabled: updated.platformFeed.enabled,
      lastFetchedAt: updated.platformFeed.lastFetchedAt,
      lastError: updated.platformFeed.lastError,
      autoPoll: updated.autoPoll,
      autoPrepare: updated.autoPrepare,
      autoPublish: updated.autoPublish,
      autoSendSocial: updated.autoSendSocial,
    };
  }

  async toggleForTenant(tenantId: string, platformFeedId: string, enabled?: boolean, isOwner = false) {
    if (!isOwner) throw new ForbiddenException('فقط مالک سازمان می‌تواند منابع پیش‌فرض را مدیریت کند');
    await this.ensureSubscriptions(tenantId);
    const subscription = await this.prisma.tenantPlatformFeed.findUnique({
      where: { tenantId_platformFeedId: { tenantId, platformFeedId } },
    });
    if (!subscription) throw new NotFoundException('منبع پیش‌فرض یافت نشد');
    const nextEnabled = enabled ?? !subscription.enabled;
    return this.updateSubscriptionForTenant(tenantId, platformFeedId, { enabled: nextEnabled }, isOwner);
  }

  async syncFeedToSubscribedTenants(platformFeedId: string) {
    const subscriptions = await this.prisma.tenantPlatformFeed.findMany({
      where: { platformFeedId, enabled: true, tenant: { isActive: true, status: 'active' } },
      select: { tenantId: true },
    });
    let synced = 0;
    for (const row of subscriptions) {
      synced += await this.syncFeedToTenant(row.tenantId, platformFeedId);
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
    const articles = await this.prisma.platformFeedArticle.findMany({
      where: { platformFeedId },
      orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    if (!articles.length) return 0;

    const result = await this.prisma.newsArticle.createMany({
      skipDuplicates: true,
      data: articles.map((article) => ({
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

    if (result.count > 0) {
      await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_MONITORED, result.count);
    }

    for (const article of articles.filter((row) => row.prepStatus === 'ready')) {
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
        orderBy: { lastFetchedAt: 'asc' },
      });
      for (const feed of feeds) {
        const intervalMs = Math.max(5, feed.pollIntervalMinutes) * 60_000;
        if (!feed.lastFetchedAt || Date.now() - feed.lastFetchedAt.getTime() >= intervalMs) {
          await this.fetch(feed.id).catch((error) => {
            this.logger.warn(`Platform feed fetch failed for ${feed.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
          });
        }
      }
    } catch (error) {
      this.logger.error(`Platform feed maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintenanceRunning = false;
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
