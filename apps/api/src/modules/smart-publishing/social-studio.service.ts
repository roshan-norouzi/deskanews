import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { USAGE_METRIC_KEYS } from '@deska/shared';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { SourceReaderService } from './source-reader.service';
import { entryFilterText, matchesWordFilters } from './feed-word-filter';
import type { SocialNetwork } from './social-network-publisher.service';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { SchedulerRuntimeService } from '../../common/services/scheduler-runtime.service';
import { decodeArticleCursor, encodeArticleCursor } from '../../common/article-page';
import { IntegrationHealthService } from '../../common/services/integration-health.service';
import { ContentWorkflowService } from '../../common/services/content-workflow.service';
import { UsageTrackingService } from '../../platform/usage/usage-tracking.service';
import { newsroomArticleWhere } from './newsroom-article-stats';

const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

function settingEnabled(value: string | undefined, fallback = false): boolean {
  return value === 'true' || (value === undefined && fallback);
}

function sourceBoolean(value: boolean | null | undefined, fallback: boolean): boolean {
  return value === null || value === undefined ? fallback : value;
}

function sourceInterval(value: number | null | undefined, fallback: number): number {
  return Number.isInteger(value) && value! >= 5 && value! <= 1440 ? value! : fallback;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/gi, (match, key: string) => values[key] ?? match).trim();
}

function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 300));
}

function persianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

function likelyImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol)) return value;
  } catch { /* invalid values are discarded */ }
  return null;
}

function automaticCoverTemplateId(settings: PublishingSettings): string {
  const requested = settings.social_auto_image_template_id?.trim();
  try {
    const library = JSON.parse(settings.social_image_templates || '') as {
      defaultTemplateId?: unknown;
      templates?: Array<{ id?: unknown }>;
    };
    const ids = new Set((Array.isArray(library.templates) ? library.templates : [])
      .map((template) => typeof template.id === 'string' ? template.id : '')
      .filter(Boolean));
    if (requested && ids.has(requested)) return requested;
    if (typeof library.defaultTemplateId === 'string' && ids.has(library.defaultTemplateId)) return library.defaultTemplateId;
    const first = ids.values().next().value;
    if (typeof first === 'string') return first;
  } catch { /* use the legacy template below */ }
  return requested || 'default';
}

@Injectable()
export class SocialStudioService {
  private readonly logger = new Logger(SocialStudioService.name);
  private maintenanceRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly sourceReader: SourceReaderService,
    private readonly jobs: AutomationJobService,
    private readonly integrationHealth: IntegrationHealthService,
    private readonly workflow: ContentWorkflowService,
    private readonly usageTracking: UsageTrackingService,
    private readonly scheduler: SchedulerRuntimeService,
  ) {}

  private recordWorkflow(params: {
    tenantId: string;
    id: string;
    entityType?: 'news-article' | 'social-article';
    fromStatus?: string | null;
    toStatus: string;
    action: string;
    title: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.workflow.record({
      tenantId: params.tenantId,
      entityType: params.entityType ?? 'social-article',
      entityId: params.id,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      action: params.action,
      actorType: 'system',
      title: params.title,
      metadata: params.metadata,
    }).catch((error) => this.logger.warn(`Workflow history could not be recorded: ${error instanceof Error ? error.message : 'unknown error'}`));
  }

  async feeds(tenantId: string) {
    const feeds = await this.prisma.newsFeed.findMany({
      where: { tenantId, purpose: 'social-studio' },
      orderBy: { createdAt: 'desc' },
    });
    return feeds.map((feed) => ({ ...feed, lastError: '' }));
  }

  articles(tenantId: string, status?: string, cursor?: string) {
    if (status && !['pending', 'processing', 'ready', 'failed', 'archived'].includes(status)) {
      throw new BadRequestException('وضعیت محتوای اجتماعی معتبر نیست');
    }
    const decoded = decodeArticleCursor(cursor);
    const reader = this.prisma.reader ?? this.prisma;
    return reader.socialArticle.findMany({
      where: {
        tenantId,
        ...(status ? { status } : { status: { not: 'archived' } }),
        ...(decoded ? {
          OR: [
            { createdAt: { lt: decoded.stamp ?? new Date(0) } },
            { createdAt: decoded.stamp ?? new Date(0), id: { lt: decoded.id } },
          ],
        } : {}),
      },
      omit: { originalText: true, rewrittenText: true },
      include: { feed: { select: { id: true, name: true, enabled: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
    }).then((rows) => {
      const items = rows.slice(0, 50);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > 50 && last ? encodeArticleCursor(last.createdAt, last.id) : null };
    });
  }

  async deleteAllArticles(tenantId: string) {
    const result = await this.prisma.socialArticle.deleteMany({ where: { tenantId } });
    return { ok: true, deleted: result.count };
  }

  async archive(tenantId: string, id: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    if (article.status === 'processing') throw new BadRequestException('مطلب در حال آماده‌سازی را نمی‌توان آرشیو کرد');
    if (article.status === 'archived') return article;
    const updated = await this.prisma.socialArticle.update({
      where: { id: article.id },
      data: { status: 'archived', processingStartedAt: null, lastError: '' },
    });
    await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'archived', action: 'archived', title: `مطلب اجتماعی «${article.title}» آرشیو شد` });
    return updated;
  }

  async fetchFeed(tenantId: string, feedId: string) {
    const feed = await this.prisma.newsFeed.findFirst({ where: { id: feedId, tenantId, purpose: 'social-studio' } });
    if (!feed) throw new NotFoundException('فید استودیوی اجتماعی یافت نشد');
    if (!feed.enabled) throw new BadRequestException('ابتدا فید را فعال کنید');
    const deferred = await this.deferHeavyWork(tenantId, 'social.feed.fetch', { feedId }, `feed:${feedId}:fetch`);
    if (deferred) return deferred;
    const startedAt = Date.now();
    try {
      const settings = await this.settings.getRaw(tenantId);
      const maxAgeDays = Number(settings.social_max_age_days || 10);
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      const { entries, resolvedFeedUrl } = await this.sourceReader.readSourceWithMeta(feed.sourceType || 'rss', feed.url, {
        resolvedFeedUrl: feed.resolvedFeedUrl,
      });
      const filtered = entries
        .filter((entry) => (!entry.publishedAt || entry.publishedAt >= cutoff)
          && matchesWordFilters(entryFilterText(entry), feed.includeWords, feed.excludeWords));
      const enrichedEntries = await Promise.all(filtered.map(async (entry) => ({
        ...entry,
        authorImageUrl: entry.authorImageUrl || await this.sourceReader.readAuthorImage(entry.canonicalUrl),
      })));
      const result = enrichedEntries.length ? await this.prisma.socialArticle.createMany({
        skipDuplicates: true,
        data: enrichedEntries.map((entry) => ({
          tenantId,
          feedId: feed.id,
          title: entry.title,
          link: entry.canonicalUrl,
          author: entry.author || null,
          category: entry.category || null,
          publishedAt: entry.publishedAt,
          featuredImageUrl: entry.featuredImageUrl || null,
          authorImageUrl: entry.authorImageUrl || null,
          originalText: entry.content || entry.summary,
          status: 'pending',
        })),
      }) : { count: 0 };
      await Promise.all(enrichedEntries.filter((entry) => entry.authorImageUrl).map((entry) => this.prisma.socialArticle.updateMany({
        where: { tenantId, link: entry.canonicalUrl, OR: [{ authorImageUrl: null }, { authorImageUrl: '' }] },
        data: { authorImageUrl: entry.authorImageUrl },
      })));
      await this.prisma.newsFeed.update({
        where: { id: feed.id },
        data: {
          lastFetchedAt: new Date(),
          lastError: '',
          ...(resolvedFeedUrl && resolvedFeedUrl !== feed.resolvedFeedUrl ? { resolvedFeedUrl } : {}),
        },
      });
      await this.integrationHealth.success({
        tenantId,
        key: `feed:${feed.id}`,
        type: 'feed',
        name: feed.name,
        latencyMs: Date.now() - startedAt,
        metadata: { purpose: feed.purpose, url: feed.url, discovered: enrichedEntries.length, created: result.count },
      }).catch((error) => this.logger.warn(`Feed health could not be recorded: ${error instanceof Error ? error.message : 'unknown error'}`));
      if (result.count > 0) await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.SOCIAL_MONITORED, result.count);
      return { ok: true, discovered: enrichedEntries.length, created: result.count };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای دریافت فید اجتماعی';
      await this.prisma.newsFeed.update({ where: { id: feed.id }, data: { lastFetchedAt: new Date(), lastError: message.slice(0, 1000) } });
      await this.integrationHealth.failure({
        tenantId,
        key: `feed:${feed.id}`,
        type: 'feed',
        name: feed.name,
        latencyMs: Date.now() - startedAt,
        metadata: { purpose: feed.purpose, url: feed.url },
        error,
      }).catch((healthError) => this.logger.warn(`Feed failure health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
      throw error;
    }
  }

  async sync(tenantId: string) {
    const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId, purpose: 'social-studio', enabled: true } });
    if (!feeds.length) throw new BadRequestException('هیچ فید فعالی برای استودیوی اجتماعی ثبت نشده است');
    const results: Array<{ feedId: string; ok: boolean; created?: number; error?: string }> = [];
    for (const feed of feeds) {
      try {
        const result = await this.fetchFeed(tenantId, feed.id);
        results.push({ feedId: feed.id, ok: true, created: 'created' in result ? result.created : 0 });
      } catch (error) {
        results.push({ feedId: feed.id, ok: false, error: error instanceof Error ? error.message : 'خطای دریافت فید' });
      }
    }
    const failed = results.filter((item) => !item.ok);
    const automation = await this.queueAutomation(tenantId, 25);
    const queued = await this.prisma.socialArticle.count({ where: { tenantId, status: 'pending' } });
    return { ok: failed.length === 0, feeds: results, queued, automation };
  }

  async sendNewsToStudio(tenantId: string, newsArticleId: string) {
    const news = await this.prisma.newsArticle.findFirst({
      where: {
        id: newsArticleId,
        ...newsroomArticleWhere(tenantId),
      },
      include: {
        feed: { select: { id: true, name: true } },
        platformFeedArticle: {
          select: { platformFeed: { select: { name: true } } },
        },
      },
    });
    if (!news) throw new NotFoundException('خبر یافت نشد');

    const link = news.originalUrl || news.canonicalUrl;
    const existing = await this.prisma.socialArticle.findUnique({
      where: { tenantId_link: { tenantId, link } },
    });
    if (news.status === 'social_sent' && existing) {
      return { ok: true, alreadySent: true, article: existing };
    }
    if (!['ready', 'publish_failed', 'social_failed', 'social_sent'].includes(news.status)) {
      throw new BadRequestException('ابتدا ترجمه و خلاصه خبر را آماده کنید');
    }
    if (existing?.status === 'processing') {
      throw new BadRequestException('این خبر هم‌اکنون در استودیوی اجتماعی در حال آماده‌سازی است');
    }
    const deferred = await this.deferHeavyWork(tenantId, 'news.send-social', { articleId: newsArticleId }, `news:${newsArticleId}:send-social`);
    if (deferred) return deferred;

    const claimed = await this.prisma.newsArticle.updateMany({
      where: {
        id: news.id,
        tenantId,
        status: { in: ['ready', 'publish_failed', 'social_failed', 'social_sent'] },
      },
      data: { status: 'social_processing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new BadRequestException('این خبر هم‌اکنون در حال پردازش است');
    await this.recordWorkflow({ tenantId, id: news.id, entityType: 'news-article', fromStatus: news.status, toStatus: 'social_processing', action: 'social-routing-started', title: `ارسال خبر «${news.titleFa || news.originalTitle}» به استودیوی اجتماعی آغاز شد` });

    try {
      const [settings, source] = await Promise.all([
        this.settings.getRaw(tenantId),
        this.sourceReader.readArticleOrFallback(link, {
          text: news.originalContent || news.originalSummary || news.originalTitle,
          title: news.titleFa || news.originalTitle,
          canonicalUrl: news.canonicalUrl,
          featuredImageUrl: news.featuredImageUrl,
          author: news.sourceName || news.feed?.name || news.platformFeedArticle?.platformFeed.name || '',
        }).catch(() => null),
      ]);
      const sourceName = news.sourceName || news.feed?.name || news.platformFeedArticle?.platformFeed.name || '';
      const text = news.summaryFa || news.originalSummary || news.originalContent || news.originalTitle;
      const aiStartedAt = Date.now();
      let prepared: { title: string; lead: string; summary: string };
      try {
        prepared = await this.gapGpt.prepareNewsForSocial(settings, {
          sourceName,
          title: news.titleFa || news.originalTitle,
          text,
        });
        await this.integrationHealth.success({ tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - aiStartedAt, metadata: { operation: 'news-to-social' } }).catch(() => undefined);
      } catch (error) {
        await this.integrationHealth.failure({ tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - aiStartedAt, metadata: { operation: 'news-to-social' }, error }).catch(() => undefined);
        throw error;
      }
      const author = source?.author || sourceName || 'نامشخص';
      const category = source?.category || 'خبر';
      const shortUrl = source?.shortUrl || source?.canonicalUrl || link;
      const readingTime = readingMinutes(source?.text || text);
      const values = {
        title: prepared.title,
        lead: prepared.lead,
        author,
        category,
        reading_time: persianDigits(readingTime),
        summary: prepared.summary,
        link: shortUrl,
        source: sourceName,
      };
      const captionTemplate = String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}');
      const captionText = renderTemplate(captionTemplate, values);
      const article = await this.prisma.socialArticle.upsert({
        where: { tenantId_link: { tenantId, link } },
        create: {
          tenantId,
          feedId: news.feedId,
          title: prepared.title,
          link,
          author,
          category,
          publishedAt: news.publishedAtSource,
          featuredImageUrl: source?.featuredImageUrl || news.featuredImageUrl || null,
          authorImageUrl: likelyImageUrl(source?.authorImageUrl),
          originalText: text,
          leadText: prepared.lead,
          summaryText: prepared.summary,
          rewrittenText: captionText,
          shortUrl,
          captionText,
          readingTime,
          generatedImageUrl: null,
          generatedImageTemplateId: null,
          status: 'ready',
          processingStartedAt: null,
          lastError: '',
        },
        update: {
          feedId: news.feedId,
          title: prepared.title,
          author,
          category,
          publishedAt: news.publishedAtSource,
          featuredImageUrl: source?.featuredImageUrl || news.featuredImageUrl || existing?.featuredImageUrl || null,
          authorImageUrl: likelyImageUrl(source?.authorImageUrl) || likelyImageUrl(existing?.authorImageUrl),
          originalText: text,
          leadText: prepared.lead,
          summaryText: prepared.summary,
          rewrittenText: captionText,
          shortUrl,
          captionText,
          readingTime,
          generatedImageUrl: null,
          generatedImageTemplateId: null,
          status: 'ready',
          processingStartedAt: null,
          lastError: '',
        },
      });
      await this.prisma.newsArticle.updateMany({
        where: { id: news.id, tenantId, status: 'social_processing' },
        data: { status: 'social_sent', processingStartedAt: null, lastError: '' },
      });
      await Promise.all([
        this.recordWorkflow({ tenantId, id: news.id, entityType: 'news-article', fromStatus: 'social_processing', toStatus: 'social_sent', action: 'social-routed', title: `خبر «${news.titleFa || news.originalTitle}» به استودیوی اجتماعی ارسال شد`, metadata: { socialArticleId: article.id } }),
        this.recordWorkflow({ tenantId, id: article.id, fromStatus: existing?.status ?? null, toStatus: 'ready', action: 'created-from-news', title: `مطلب اجتماعی «${article.title}» آماده شد`, metadata: { newsArticleId: news.id } }),
        this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_SENT_SOCIAL, 1),
        this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.SOCIAL_PREPARED, 1),
      ]);
      // A direct click in the newsroom does not pass through the durable job
      // processor, so explicitly wake the next automation stage here. Queue
      // failures are recoverable by maintenance and must not undo the already
      // completed transfer to the social studio.
      const automation = await this.queueAutomation(tenantId, 25).catch((automationError) => {
        this.logger.warn(`Social automation could not be queued after newsroom transfer: ${automationError instanceof Error ? automationError.message : 'unknown error'}`);
        return null;
      });
      return { ok: true, alreadySent: false, article, automation };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای آماده‌سازی خبر برای شبکه‌های اجتماعی';
      await this.prisma.newsArticle.updateMany({
        where: { id: news.id, tenantId, status: 'social_processing' },
        data: { status: 'social_failed', processingStartedAt: null, lastError: message.slice(0, 1000) },
      });
      await this.recordWorkflow({ tenantId, id: news.id, entityType: 'news-article', fromStatus: 'social_processing', toStatus: 'social_failed', action: 'social-routing-failed', title: `ارسال خبر «${news.titleFa || news.originalTitle}» به استودیوی اجتماعی ناموفق بود`, metadata: { error: message.slice(0, 1000) } });
      throw new BadRequestException(`ارسال به استودیوی اجتماعی انجام نشد: ${message}`);
    }
  }

  async prepare(tenantId: string, id: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const preserveArchive = article.status === 'archived';
    const deferred = await this.deferHeavyWork(tenantId, 'social.prepare', { articleId: id }, `social:${id}:prepare`);
    if (deferred) return deferred;
    const claimed = await this.prisma.socialArticle.updateMany({
      where: { id, tenantId, status: { in: ['pending', 'ready', 'failed', 'archived'] } },
      data: { status: 'processing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new BadRequestException('این مطلب هم‌اکنون در حال پردازش است');
    await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'processing', action: 'preparation-started', title: `آماده‌سازی مطلب اجتماعی «${article.title}» آغاز شد` });
    try {
      const [settings, source] = await Promise.all([
        this.settings.getRaw(tenantId),
        this.sourceReader.readArticleOrFallback(article.link, {
          text: article.originalText || article.summaryText || article.title,
          title: article.title,
          canonicalUrl: article.link,
          featuredImageUrl: article.featuredImageUrl || '',
          author: article.author || '',
          category: article.category || '',
        }),
      ]);
      const text = source.text || article.originalText || '';
      const author = source.author || article.author || 'نامشخص';
      const category = source.category || article.category || 'نامشخص';
      const readingTime = readingMinutes(text);
      const aiStartedAt = Date.now();
      let prepared: { lead: string; summary: string };
      try {
        prepared = await this.gapGpt.prepareSocial(settings, { title: article.title, author, category, text });
        await this.integrationHealth.success({ tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - aiStartedAt, metadata: { operation: 'social-prepare' } }).catch(() => undefined);
      } catch (error) {
        await this.integrationHealth.failure({ tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - aiStartedAt, metadata: { operation: 'social-prepare' }, error }).catch(() => undefined);
        throw error;
      }
      const shortUrl = source.shortUrl || source.canonicalUrl || article.link;
      const feed = article.feedId ? await this.prisma.newsFeed.findUnique({ where: { id: article.feedId }, select: { name: true } }) : null;
      const values = {
        title: article.title,
        lead: prepared.lead,
        author,
        category,
        reading_time: persianDigits(readingTime),
        summary: prepared.summary,
        link: shortUrl,
        source: feed?.name || '',
      };
      const captionTemplate = String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}');
      return await this.prisma.socialArticle.updateMany({
        where: { id, tenantId, status: 'processing' },
        data: {
          // The source title is deliberately preserved verbatim.
          author,
          category,
          featuredImageUrl: source.featuredImageUrl || article.featuredImageUrl,
          authorImageUrl: likelyImageUrl(source.authorImageUrl) || likelyImageUrl(article.authorImageUrl),
          originalText: text,
          leadText: prepared.lead,
          summaryText: prepared.summary,
          shortUrl,
          captionText: renderTemplate(captionTemplate, values),
          readingTime,
          generatedImageUrl: null,
          generatedImageTemplateId: null,
          status: preserveArchive ? 'archived' : 'ready',
          processingStartedAt: null,
          lastError: '',
        },
      }).then(async (result) => {
        if (!result.count) throw new NotFoundException('مطلب اجتماعی در زمان آماده‌سازی حذف شده است');
        const updated = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
        if (updated) {
          await Promise.all([
            this.recordWorkflow({ tenantId, id, fromStatus: 'processing', toStatus: updated.status, action: 'prepared', title: `مطلب اجتماعی «${updated.title}» آماده شد` }),
            this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.SOCIAL_PREPARED, 1),
          ]);
        }
        return updated;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای آماده‌سازی مطلب اجتماعی';
      await this.prisma.socialArticle.updateMany({ where: { id, tenantId, status: 'processing' }, data: { status: preserveArchive ? 'archived' : 'failed', processingStartedAt: null, lastError: message.slice(0, 1000) } });
      await this.recordWorkflow({ tenantId, id, fromStatus: 'processing', toStatus: preserveArchive ? 'archived' : 'failed', action: 'preparation-failed', title: `آماده‌سازی مطلب اجتماعی «${article.title}» ناموفق بود`, metadata: { error: message.slice(0, 1000) } });
      throw new BadRequestException(`آماده‌سازی مطلب اجتماعی انجام نشد: ${message}`);
    }
  }

  async updateCaption(tenantId: string, id: string, captionText: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    return this.prisma.socialArticle.update({ where: { id }, data: { captionText: captionText.trim(), rewrittenText: captionText.trim(), status: article.status === 'archived' ? 'archived' : 'ready' } });
  }

  async updateFeaturedImage(tenantId: string, id: string, featuredImageUrl: string | null) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId }, select: { id: true, featuredImageUrl: true } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const updated = await this.prisma.socialArticle.update({
      where: { id },
      data: {
        featuredImageUrl,
        generatedImageUrl: null,
        generatedImageTemplateId: null,
        lastError: '',
      },
      include: { feed: { select: { id: true, name: true, enabled: true } } },
    });
    return { article: updated, previousFeaturedImageUrl: article.featuredImageUrl };
  }

  async updateLead(tenantId: string, id: string, leadText: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const normalized = leadText.trim();
    if (!normalized) throw new BadRequestException('لید نمی‌تواند خالی باشد');
    const [settings, feed] = await Promise.all([
      this.settings.getRaw(tenantId),
      article.feedId ? this.prisma.newsFeed.findUnique({ where: { id: article.feedId }, select: { name: true } }) : null,
    ]);
    const captionTemplate = String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}');
    const values = {
      title: article.title,
      lead: normalized,
      author: article.author || 'نامشخص',
      category: article.category || 'نامشخص',
      reading_time: article.readingTime ? persianDigits(article.readingTime) : 'نامشخص',
      summary: article.summaryText || '',
      link: article.shortUrl || article.link,
      source: feed?.name || '',
    };
    const caption = renderTemplate(captionTemplate, values);
    return this.prisma.socialArticle.update({ where: { id }, data: { leadText: normalized, captionText: caption, rewrittenText: caption, generatedImageUrl: null, generatedImageTemplateId: null, status: article.status === 'archived' ? 'archived' : 'ready' } });
  }

  async updateTitle(tenantId: string, id: string, title: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const normalized = title.trim();
    if (!normalized) throw new BadRequestException('تیتر نمی‌تواند خالی باشد');
    const [settings, feed] = await Promise.all([
      this.settings.getRaw(tenantId),
      article.feedId ? this.prisma.newsFeed.findUnique({ where: { id: article.feedId }, select: { name: true } }) : null,
    ]);
    const captionTemplate = String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}');
    const values = {
      title: normalized,
      lead: article.leadText || '',
      author: article.author || 'نامشخص',
      category: article.category || 'نامشخص',
      reading_time: article.readingTime ? persianDigits(article.readingTime) : 'نامشخص',
      summary: article.summaryText || '',
      link: article.shortUrl || article.link,
      source: feed?.name || '',
    };
    const caption = renderTemplate(captionTemplate, values);
    return this.prisma.socialArticle.update({ where: { id }, data: { title: normalized, captionText: caption, rewrittenText: caption, generatedImageUrl: null, generatedImageTemplateId: null, status: article.status === 'archived' ? 'archived' : 'ready' } });
  }

  @Interval('smart-publishing-social-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    await this.scheduler.runIntervalMaintenance('smart-publishing-social-maintenance', async () => {
    this.maintenanceRunning = true;
    try {
      const activeTenants = await this.prisma.tenant.findMany({
        where: { isActive: true, status: 'active' },
        select: { id: true },
      });
      const enabledTenantIds = activeTenants.map((row) => row.id);
      if (!enabledTenantIds.length) return;

      const staleBefore = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
      await this.prisma.socialArticle.updateMany({
        where: { tenantId: { in: enabledTenantIds }, status: 'processing', processingStartedAt: { lte: staleBefore } },
        data: { status: 'pending', processingStartedAt: null },
      });
      const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId: { in: enabledTenantIds }, purpose: 'social-studio', enabled: true }, orderBy: { lastFetchedAt: 'asc' } });
      for (const feed of feeds) {
        const settings = await this.settings.getRaw(feed.tenantId);
        const intervalMs = sourceInterval(feed.pollIntervalMinutes, Number(settings.social_poll_interval_minutes || 240)) * 60_000;
        if (sourceBoolean(feed.autoPoll, settingEnabled(settings.social_auto_poll, true)) && (!feed.lastFetchedAt || Date.now() - feed.lastFetchedAt.getTime() >= intervalMs)) {
          await this.jobs.enqueue({
            tenantId: feed.tenantId,
            type: 'social.feed.fetch',
            payload: { feedId: feed.id },
            dedupeKey: `feed:${feed.id}:fetch`,
            retryDead: true,
            priority: 20,
            maxAttempts: 6,
          });
        }
      }
      for (const tenantId of enabledTenantIds) await this.queueAutomation(tenantId, 25);
    } catch (error) {
      this.logger.error(`Social studio maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintenanceRunning = false;
    }
    }).catch(() => undefined);
  }

  defersHeavyWork(): boolean {
    const check = this.scheduler.runsHeavyWorkInline;
    return typeof check === 'function' && check.call(this.scheduler) === false;
  }

  async rememberGeneratedImage(tenantId: string, id: string, url: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    await this.prisma.socialArticle.update({ where: { id }, data: { generatedImageUrl: url } });
    return { ok: true };
  }

  async enqueueNetworkPublish(tenantId: string, articleId: string, network: string) {
    if (!['telegram', 'instagram', 'linkedin', 'facebook'].includes(network)) {
      throw new BadRequestException('شبکه اجتماعی معتبر نیست');
    }
    return this.deferHeavyWork(tenantId, 'social.publish', { articleId, networks: [network] }, `social:${articleId}:publish:${network}`);
  }

  private async deferHeavyWork(
    tenantId: string,
    type: 'social.feed.fetch' | 'social.prepare' | 'social.publish' | 'news.send-social',
    payload: Record<string, unknown>,
    dedupeKey: string,
  ) {
    if (!this.defersHeavyWork()) return null;
    const queued = await this.jobs.enqueue({
      tenantId,
      type,
      payload,
      dedupeKey,
      retryDead: true,
      priority: 30,
    });
    return { queued: true as const, created: 0, jobId: queued.job.id, message: 'کار به worker سپرده شد.' };
  }

  private autoPublishNetworks(settings: PublishingSettings): SocialNetwork[] {
    const networks: SocialNetwork[] = [];
    if (settingEnabled(settings.social_auto_publish_telegram)) networks.push('telegram');
    if (settingEnabled(settings.social_auto_publish_instagram)) networks.push('instagram');
    if (settingEnabled(settings.social_auto_publish_linkedin)) networks.push('linkedin');
    if (settingEnabled(settings.social_auto_publish_facebook)) networks.push('facebook');
    return networks;
  }

  async queueAutomation(tenantId: string, limit = 25) {
    const settings = await this.settings.getRaw(tenantId);
    const prepared = await this.enqueuePending(tenantId, limit, settingEnabled(settings.social_auto_prepare));
    const autoGenerateImage = settingEnabled(settings.social_auto_generate_image);
    const templateId = automaticCoverTemplateId(settings);
    const generated = autoGenerateImage
      ? await this.enqueueReadyImages(tenantId, templateId, limit)
      : 0;
    const networks = this.autoPublishNetworks(settings);
    const published = networks.length ? await this.enqueueReadyPublishing(tenantId, networks, limit, autoGenerateImage) : 0;
    return { prepared, generated, published };
  }

  async queueFeaturedImageFallback(tenantId: string, articleId: string) {
    const settings = await this.settings.getRaw(tenantId);
    const networks = this.autoPublishNetworks(settings);
    if (!networks.length) return { queued: false, reason: 'automatic-publishing-disabled' };
    const article = await this.prisma.socialArticle.findFirst({
      where: { id: articleId, tenantId, status: 'ready' },
      select: {
        id: true, featuredImageUrl: true,
        telegramSentAt: true, instagramSentAt: true, linkedinSentAt: true, facebookSentAt: true,
      },
    });
    if (!article?.featuredImageUrl) return { queued: false, reason: 'featured-image-missing' };
    const pending = networks.filter((network) => {
      if (network === 'telegram') return !article.telegramSentAt;
      if (network === 'instagram') return !article.instagramSentAt;
      if (network === 'linkedin') return !article.linkedinSentAt;
      return !article.facebookSentAt;
    });
    if (!pending.length) return { queued: false, reason: 'already-published' };
    const result = await this.jobs.enqueue({
      tenantId,
      type: 'social.publish',
      payload: { articleId: article.id, networks: pending, imageFallback: 'featured' },
      dedupeKey: `social:${article.id}:publish:${[...pending].sort().join(',')}`,
      priority: 4,
      maxAttempts: 6,
    });
    return { queued: result.created, networks: pending };
  }

  private async enqueuePending(tenantId: string, limit: number, fallback: boolean) {
    const rows = await this.prisma.socialArticle.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(limit * 4, 100),
      select: { id: true, feed: { select: { autoPrepare: true } } },
    });
    let queued = 0;
    for (const row of rows.filter((item) => sourceBoolean(item.feed?.autoPrepare, fallback)).slice(0, limit)) {
      const result = await this.jobs.enqueue({
        tenantId,
        type: 'social.prepare',
        payload: { articleId: row.id },
        dedupeKey: `social:${row.id}:prepare`,
        priority: 10,
      });
      if (result.created) queued += 1;
    }
    return queued;
  }

  private async enqueueReadyImages(tenantId: string, templateId: string, limit: number) {
    const rows = await this.prisma.socialArticle.findMany({
      where: {
        tenantId,
        status: 'ready',
        OR: [{ generatedImageUrl: null }, { generatedImageTemplateId: null }, { generatedImageTemplateId: { not: templateId } }],
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: { id: true },
    });
    let queued = 0;
    for (const row of rows) {
      const result = await this.jobs.enqueue({
        tenantId,
        type: 'social.cover',
        payload: { articleId: row.id, templateId },
        dedupeKey: `social:${row.id}:cover:${templateId}`,
        priority: 6,
        maxAttempts: 4,
      });
      if (result.created) queued += 1;
    }
    return queued;
  }

  private async enqueueReadyPublishing(tenantId: string, networks: SocialNetwork[], limit: number, requireGeneratedImage = false) {
    const missingDelivery: Array<Record<string, null>> = [];
    if (networks.includes('telegram')) missingDelivery.push({ telegramSentAt: null });
    if (networks.includes('instagram')) missingDelivery.push({ instagramSentAt: null });
    if (networks.includes('linkedin')) missingDelivery.push({ linkedinSentAt: null });
    if (networks.includes('facebook')) missingDelivery.push({ facebookSentAt: null });
    const rows = await this.prisma.socialArticle.findMany({
      where: { tenantId, status: 'ready', OR: missingDelivery, ...(requireGeneratedImage ? { generatedImageUrl: { not: null } } : {}) },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(limit * 4, 100),
      select: { id: true, feed: { select: { autoPublish: true, purpose: true } } },
    });
    let queued = 0;
    for (const row of rows.filter((item) => item.feed?.purpose === 'news-room' || sourceBoolean(item.feed?.autoPublish, true)).slice(0, limit)) {
      const result = await this.jobs.enqueue({
        tenantId,
        type: 'social.publish',
        payload: { articleId: row.id, networks },
        dedupeKey: `social:${row.id}:publish:${[...networks].sort().join(',')}`,
        priority: 4,
        maxAttempts: 6,
      });
      if (result.created) queued += 1;
    }
    return queued;
  }

}
