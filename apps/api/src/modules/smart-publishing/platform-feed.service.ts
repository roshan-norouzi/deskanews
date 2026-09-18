import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { USAGE_METRIC_KEYS } from '@deska/shared';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SourceReaderService } from './source-reader.service';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import { entryFilterText, matchesWordFilters, parseWordList } from './feed-word-filter';
import type { CreatePlatformFeedDto, UpdatePlatformFeedDto } from '../../platform/admin/dto/platform-feed.dto';
import type { SourceType } from './dto/feed.dto';
import { UsageTrackingService } from '../../platform/usage/usage-tracking.service';

const PLATFORM_ARTICLE_MAX_AGE_DAYS = 10;

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
  return value === 'website' ? 'website' : 'rss';
}

function effectiveReadTarget(feed: { sourceType: string; url: string; resolvedFeedUrl: string }) {
  if (feed.sourceType === 'website' && feed.resolvedFeedUrl) {
    return { sourceType: 'rss' as const, url: feed.resolvedFeedUrl };
  }
  return { sourceType: feed.sourceType as SourceType, url: feed.url };
}

@Injectable()
export class PlatformFeedService {
  private readonly logger = new Logger(PlatformFeedService.name);
  private maintenanceRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceReader: SourceReaderService,
    private readonly gapGpt: GapGptClient,
    private readonly settings: PublishingSettingsService,
    private readonly usageTracking: UsageTrackingService,
  ) {}

  listAll() {
    return this.prisma.platformFeed.findMany({ orderBy: { createdAt: 'desc' } });
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

    const feed = await this.prisma.platformFeed.create({
      data: {
        name,
        url,
        sourceType,
        resolvedFeedUrl,
        includeWords: parseWordList(data.includeWords),
        excludeWords: parseWordList(data.excludeWords),
        pollIntervalMinutes: data.pollIntervalMinutes ?? 240,
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

    return this.prisma.platformFeed.update({
      where: { id },
      data: {
        name,
        url,
        sourceType,
        resolvedFeedUrl,
        ...(data.includeWords !== undefined ? { includeWords: parseWordList(data.includeWords) } : {}),
        ...(data.excludeWords !== undefined ? { excludeWords: parseWordList(data.excludeWords) } : {}),
        ...(data.pollIntervalMinutes !== undefined ? { pollIntervalMinutes: data.pollIntervalMinutes } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });
  }

  async delete(id: string) {
    await this.findFeed(id);
    await this.prisma.platformFeed.delete({ where: { id } });
    return { ok: true };
  }

  async test(id: string) {
    const feed = await this.findFeed(id);
    const target = effectiveReadTarget(feed);
    const entries = await this.sourceReader.readSource(target.sourceType, target.url);
    const filtered = entries.filter((entry) => matchesWordFilters(
      entryFilterText(entry),
      feed.includeWords,
      feed.excludeWords,
    ));
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
      items: filtered.slice(0, 5).map((entry) => ({
        title: entry.title,
        summary: entry.summary || entry.content.slice(0, 500),
        url: entry.canonicalUrl,
        publishedAt: entry.publishedAt,
        featuredImageUrl: entry.featuredImageUrl,
      })),
    };
  }

  async fetch(id: string) {
    const feed = await this.findFeed(id);
    if (!feed.enabled) throw new BadRequestException('این منبع پیش‌فرض غیرفعال است');
    const startedAt = Date.now();
    try {
      const target = effectiveReadTarget(feed);
      const cutoff = new Date(Date.now() - PLATFORM_ARTICLE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
      const entries = (await this.sourceReader.readSource(target.sourceType, target.url))
        .filter((entry) => (!entry.publishedAt || entry.publishedAt >= cutoff)
          && matchesWordFilters(entryFilterText(entry), feed.includeWords, feed.excludeWords));

      let created = 0;
      for (const entry of entries) {
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
        data: { lastFetchedAt: new Date(), lastError: '' },
      });

      const synced = await this.syncFeedToSubscribedTenants(feed.id);
      await this.queueSharedPreparation(feed.id, 10);

      return { ok: true, discovered: entries.length, created, synced };
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
      resolvedFeedUrl: row.platformFeed.resolvedFeedUrl,
      includeWords: row.platformFeed.includeWords,
      excludeWords: row.platformFeed.excludeWords,
      pollIntervalMinutes: row.platformFeed.pollIntervalMinutes,
      purpose: 'news-room' as const,
      enabled: row.enabled,
      platformEnabled: row.platformFeed.enabled,
      lastFetchedAt: row.platformFeed.lastFetchedAt,
      lastError: row.platformFeed.lastError,
      autoPoll: true,
      autoPrepare: true,
      autoPublish: null,
      autoSendSocial: null,
    }));
  }

  async toggleForTenant(tenantId: string, platformFeedId: string, enabled?: boolean, isOwner = false) {
    if (!isOwner) throw new ForbiddenException('فقط مالک سازمان می‌تواند منابع پیش‌فرض را مدیریت کند');
    await this.ensureSubscriptions(tenantId);
    const subscription = await this.prisma.tenantPlatformFeed.findUnique({
      where: { tenantId_platformFeedId: { tenantId, platformFeedId } },
      include: { platformFeed: true },
    });
    if (!subscription) throw new NotFoundException('منبع پیش‌فرض یافت نشد');
    if (!subscription.platformFeed.enabled) throw new BadRequestException('این منبع پیش‌فرض توسط مدیر کل غیرفعال شده است');

    const nextEnabled = enabled ?? !subscription.enabled;
    const updated = await this.prisma.tenantPlatformFeed.update({
      where: { id: subscription.id },
      data: { enabled: nextEnabled },
    });

    if (nextEnabled) {
      await this.syncFeedToTenant(tenantId, platformFeedId);
      await this.queueSharedPreparation(platformFeedId, 10, tenantId);
    }
    return updated;
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
    const article = await this.prisma.platformFeedArticle.findUnique({ where: { id: platformFeedArticleId } });
    if (!article || article.prepStatus === 'ready') return article;

    const settings = await this.settings.getRaw(tenantIdForSettings);
    const prepared = await this.gapGpt.summarize(settings, {
      sourceName: article.sourceName,
      title: article.originalTitle,
      summary: article.originalSummary || article.originalContent || article.originalTitle,
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
    await Promise.all(
      subscribedTenants.map(({ tenantId }) =>
        Promise.all([
          this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_SUMMARIZED, 1),
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
