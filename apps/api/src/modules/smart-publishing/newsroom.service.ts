import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FEED_PURPOSES, type CreateFeedDto, type FeedPurpose, type UpdateFeedDto, type SourceType } from './dto/feed.dto';
import { NEWS_STATUSES, type UpdateNewsArticleDto } from './dto/news-article.dto';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { SourceReaderService } from './source-reader.service';
import { WordPressClient } from './wordpress.client';
import { parseWordPressCategories } from './wordpress-category';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { IntegrationHealthService } from '../../common/services/integration-health.service';
import { ContentWorkflowService } from '../../common/services/content-workflow.service';

const REJECT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;
const DAILY_REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function settingEnabled(value: string | undefined, fallback = false): boolean {
  return value === 'true' || (value === undefined && fallback);
}

function normalizePurpose(value: unknown, fallback: FeedPurpose = 'news-room'): FeedPurpose {
  return FEED_PURPOSES.includes(value as FeedPurpose) ? value as FeedPurpose : fallback;
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
  return ['rss', 'website', 'blog', 'telegram', 'twitter'].includes(String(value))
    ? String(value) as SourceType
    : 'rss';
}

function sourceBoolean(value: boolean | null | undefined, fallback: boolean): boolean {
  return value === null || value === undefined ? fallback : value;
}

function sourceInterval(value: number | null | undefined, fallback: number): number {
  return Number.isInteger(value) && value! >= 5 && value! <= 1440 ? value! : fallback;
}

function splitText(value: string, maxChars = 10_000): string[] {
  const paragraphs = value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) { chunks.push(current); current = ''; }
      for (let offset = 0; offset < paragraph.length; offset += maxChars) chunks.push(paragraph.slice(offset, offset + maxChars));
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function attributionVariant(seed: string): number {
  let hash = 0;
  for (const character of seed) hash = ((hash * 31) + character.codePointAt(0)!) >>> 0;
  return hash % 5;
}

function toWordPressHtml(value: string, sourceName: string, sourceUrl: string, seed: string): string {
  const paragraphs = value.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!paragraphs.length) return '';
  const source = `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceName || sourceUrl)}</a>`;
  const attributions = [
    `به گزارش ${source}، `,
    `${source} گزارش داده است که `,
    `بر پایه گزارش ${source}، `,
    `طبق گزارش منتشرشده از سوی ${source}، `,
    `آن‌گونه که ${source} گزارش کرده است، `,
  ];
  return paragraphs.map((paragraph, index) => {
    const body = escapeHtml(paragraph).replace(/\n/g, '<br>');
    return `<p>${index === 0 ? attributions[attributionVariant(seed)] : ''}${body}</p>`;
  }).join('\n');
}

function normalizedNewsText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function looksLikeFullStoredFeedContent(content: string, summary: string): boolean {
  const normalizedContent = normalizedNewsText(content);
  const normalizedSummary = normalizedNewsText(summary);
  if (normalizedContent.length < 400) return false;
  if (!normalizedSummary) return normalizedContent.length >= 1_200;
  return normalizedContent.length >= 1_200
    || (normalizedContent !== normalizedSummary && normalizedContent.length >= normalizedSummary.length * 1.35);
}

@Injectable()
export class NewsroomService {
  private readonly logger = new Logger(NewsroomService.name);
  private maintenanceRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly sourceReader: SourceReaderService,
    private readonly wordpress: WordPressClient,
    private readonly jobs: AutomationJobService,
    private readonly integrationHealth: IntegrationHealthService,
    private readonly workflow: ContentWorkflowService,
  ) {}

  private recordWorkflow(params: {
    tenantId: string;
    id: string;
    fromStatus?: string | null;
    toStatus: string;
    action: string;
    title: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.workflow.record({
      tenantId: params.tenantId,
      entityType: 'news-article',
      entityId: params.id,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      action: params.action,
      actorType: 'system',
      title: params.title,
      metadata: params.metadata,
    }).catch((error) => this.logger.warn(`Workflow history could not be recorded: ${error instanceof Error ? error.message : 'unknown error'}`));
  }

  feeds(tenantId: string, purpose?: FeedPurpose) {
    return this.prisma.newsFeed.findMany({
      where: { tenantId, ...(purpose ? { purpose } : {}) },
      orderBy: [{ purpose: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async addFeed(tenantId: string, data: CreateFeedDto) {
    const name = data.name.trim();
    const url = normalizeFeedUrl(data.url);
    const sourceType = normalizeSourceType(data.sourceType);
    const category = String(data.category || 'عمومی').trim() || 'عمومی';
    const purpose = normalizePurpose(data.purpose);
    const duplicate = await this.prisma.newsFeed.findFirst({ where: { tenantId, url } });
    if (duplicate) throw new ConflictException('این فید قبلاً ثبت شده است');
    return this.prisma.newsFeed.create({ data: {
      tenantId, name, url, sourceType, category, purpose, enabled: data.enabled ?? true,
      pollIntervalMinutes: data.pollIntervalMinutes ?? 240,
      autoPoll: data.autoPoll ?? true,
      autoPrepare: data.autoPrepare ?? purpose === 'news-room',
      autoPublish: data.autoPublish ?? false,
      autoSendSocial: data.autoSendSocial ?? false,
    } });
  }

  async updateFeed(tenantId: string, id: string, data: UpdateFeedDto) {
    const feed = await this.findFeed(tenantId, id);
    const name = String(data.name ?? feed.name).trim();
    const url = normalizeFeedUrl(String(data.url ?? feed.url));
    const sourceType = normalizeSourceType(data.sourceType ?? feed.sourceType);
    const category = String(data.category ?? feed.category ?? 'عمومی').trim() || 'عمومی';
    const purpose = normalizePurpose(data.purpose, normalizePurpose(feed.purpose));
    const duplicate = await this.prisma.newsFeed.findFirst({ where: { tenantId, url, NOT: { id } } });
    if (duplicate) throw new ConflictException('این آدرس قبلاً ثبت شده است');
    return this.prisma.newsFeed.update({ where: { id }, data: {
      name, url, sourceType, category, purpose,
      ...(data.pollIntervalMinutes !== undefined ? { pollIntervalMinutes: data.pollIntervalMinutes } : {}),
      ...(data.autoPoll !== undefined ? { autoPoll: data.autoPoll } : {}),
      ...(data.autoPrepare !== undefined ? { autoPrepare: data.autoPrepare } : {}),
      ...(data.autoPublish !== undefined ? { autoPublish: data.autoPublish } : {}),
      ...(data.autoSendSocial !== undefined ? { autoSendSocial: data.autoSendSocial } : {}),
    } });
  }

  async toggleFeed(tenantId: string, id: string) {
    const feed = await this.findFeed(tenantId, id);
    return this.prisma.newsFeed.update({ where: { id }, data: { enabled: !feed.enabled } });
  }

  async deleteFeed(tenantId: string, id: string) {
    await this.findFeed(tenantId, id);
    await this.prisma.$transaction([
      this.prisma.newsArticle.deleteMany({ where: { tenantId, feedId: id, status: { not: 'published' } } }),
      this.prisma.newsFeed.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  async articles(tenantId: string, status?: string) {
    await this.purgeRejected();
    if (status && !NEWS_STATUSES.includes(status as (typeof NEWS_STATUSES)[number])) {
      throw new BadRequestException('وضعیت خبر معتبر نیست');
    }
    return this.prisma.newsArticle.findMany({
      where: { tenantId, feed: { purpose: 'news-room' }, ...(status ? { status } : {}) },
      include: { feed: { select: { id: true, name: true, purpose: true } } },
      orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async deleteAllArticles(tenantId: string) {
    const result = await this.prisma.newsArticle.deleteMany({ where: { tenantId, feed: { purpose: 'news-room' } } });
    return { ok: true, deleted: result.count };
  }

  async updateArticle(tenantId: string, id: string, data: UpdateNewsArticleDto) {
    const article = await this.findArticle(tenantId, id);
    if (['rejected', 'publishing', 'published', 'social_processing', 'social_sent'].includes(article.status)) {
      throw new BadRequestException('ویرایش خبر در وضعیت فعلی مجاز نیست');
    }
    const titleFa = data.titleFa !== undefined ? data.titleFa.trim() : article.titleFa;
    const summaryFa = data.summaryFa !== undefined ? data.summaryFa.trim() : article.summaryFa;
    if (data.status === 'ready' && (!titleFa || !summaryFa)) {
      throw new BadRequestException('برای آماده‌کردن خبر، تیتر و خلاصهٔ فارسی الزامی است');
    }
    const updated = await this.prisma.newsArticle.update({
      where: { id },
      data: {
        ...(data.titleFa !== undefined ? { titleFa } : {}),
        ...(data.summaryFa !== undefined ? { summaryFa } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });
    if (data.status && data.status !== article.status) {
      await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: data.status, action: 'status-updated', title: `وضعیت خبر «${updated.titleFa || updated.originalTitle}» تغییر کرد` });
    }
    return updated;
  }

  async fetchFeed(tenantId: string, feedId: string) {
    const feed = await this.findFeed(tenantId, feedId);
    if (!['news-room', 'daily-report'].includes(feed.purpose)) throw new BadRequestException('پایش این فید در بخش مربوط به آن انجام می‌شود');
    if (!feed.enabled) throw new BadRequestException('ابتدا فید را فعال کنید');
    const startedAt = Date.now();
    try {
      const settings = await this.settings.getRaw(tenantId);
      const maxAgeMs = feed.purpose === 'daily-report'
        ? DAILY_REPORT_MAX_AGE_MS
        : Number(settings.news_max_age_days || 10) * 24 * 60 * 60 * 1000;
      const now = new Date();
      const cutoff = new Date(now.getTime() - maxAgeMs);
      const entries = (await this.sourceReader.readSource(feed.sourceType || 'rss', feed.url)).filter((entry) => feed.purpose === 'daily-report'
        ? Boolean(entry.publishedAt && entry.publishedAt >= cutoff && entry.publishedAt <= now)
        : !entry.publishedAt || entry.publishedAt >= cutoff);
      const result = entries.length ? await this.prisma.newsArticle.createMany({
        skipDuplicates: true,
        data: entries.map((entry) => ({
          tenantId,
          feedId,
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
          status: feed.purpose === 'daily-report' ? 'report_available' : 'new',
        })),
      }) : { count: 0 };
      await this.prisma.newsFeed.update({ where: { id: feedId }, data: { lastFetchedAt: new Date(), lastError: '' } });
      await this.integrationHealth.success({
        tenantId,
        key: `feed:${feed.id}`,
        type: 'feed',
        name: feed.name,
        latencyMs: Date.now() - startedAt,
        metadata: { purpose: feed.purpose, url: feed.url, discovered: entries.length, created: result.count },
      }).catch((error) => this.logger.warn(`Feed health could not be recorded: ${error instanceof Error ? error.message : 'unknown error'}`));
      return { ok: true, discovered: entries.length, created: result.count };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته دریافت فید';
      await this.prisma.newsFeed.update({ where: { id: feedId }, data: { lastFetchedAt: new Date(), lastError: message.slice(0, 1000) } });
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

  async testFeed(tenantId: string, feedId: string) {
    const feed = await this.findFeed(tenantId, feedId);
    const startedAt = Date.now();
    try {
      const entries = await this.sourceReader.readSource(feed.sourceType || 'rss', feed.url);
      const latest = entries.map((entry, index) => ({ entry, index }))
        .sort((left, right) => {
          const leftTime = left.entry.publishedAt?.getTime() ?? 0;
          const rightTime = right.entry.publishedAt?.getTime() ?? 0;
          return rightTime - leftTime || left.index - right.index;
        })
        .slice(0, 5)
        .map(({ entry }) => ({
          title: entry.title,
          summary: entry.summary || entry.content.slice(0, 500),
          url: entry.canonicalUrl,
          publishedAt: entry.publishedAt,
          featuredImageUrl: entry.featuredImageUrl,
          category: entry.category || feed.category,
        }));
      await this.integrationHealth.success({ tenantId, key: `feed:${feed.id}`, type: 'feed', name: feed.name, latencyMs: Date.now() - startedAt, metadata: { operation: 'health-test', sourceType: feed.sourceType || 'rss', items: latest.length } }).catch(() => undefined);
      return { ok: true, source: { id: feed.id, name: feed.name, url: feed.url, sourceType: feed.sourceType || 'rss', category: feed.category }, items: latest };
    } catch (error) {
      await this.integrationHealth.failure({ tenantId, key: `feed:${feed.id}`, type: 'feed', name: feed.name, latencyMs: Date.now() - startedAt, metadata: { operation: 'health-test', sourceType: feed.sourceType || 'rss' }, error }).catch(() => undefined);
      throw error;
    }
  }

  async sync(tenantId: string) {
    const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId, purpose: 'news-room', enabled: true } });
    if (!feeds.length) throw new BadRequestException('هیچ فید فعال برای اتاق خبر ثبت نشده است');
    const results: Array<{ feedId: string; ok: boolean; created?: number; error?: string }> = [];
    for (const feed of feeds) {
      try {
        const result = await this.fetchFeed(tenantId, feed.id);
        results.push({ feedId: feed.id, ok: true, created: result.created });
      } catch (error) {
        results.push({ feedId: feed.id, ok: false, error: error instanceof Error ? error.message : 'خطای دریافت فید' });
      }
    }
    const automation = await this.queueAutomation(tenantId, 25);
    const queued = await this.prisma.newsArticle.count({ where: { tenantId, status: 'new' } });
    const failed = results.filter((item) => !item.ok);
    return {
      ok: failed.length === 0,
      feeds: results,
      queued,
      automation,
      message: failed.length ? `${failed.length} فید دریافت نشد؛ خطای هر فید در صفحه فیدها ثبت شده است` : 'همه فیدهای اتاق خبر با موفقیت پایش شدند',
    };
  }

  async summarize(tenantId: string, id: string) {
    const article = await this.findArticle(tenantId, id);
    if (['rejected', 'publishing', 'published'].includes(article.status)) throw new BadRequestException('آماده‌سازی خبر در وضعیت فعلی مجاز نیست');
    const claimed = await this.prisma.newsArticle.updateMany({
      where: { id, tenantId, status: { in: ['new', 'ready', 'failed', 'publish_failed'] } },
      data: { status: 'processing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new ConflictException('این خبر هم‌اکنون در حال پردازش است');
    await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'processing', action: 'preparation-started', title: `آماده‌سازی خبر «${article.titleFa || article.originalTitle}» آغاز شد` });
    const startedAt = Date.now();
    try {
      const settings = await this.settings.getRaw(tenantId);
      const [prepared, metadata] = await Promise.all([
        this.gapGpt.summarize(settings, {
          sourceName: article.sourceName,
          title: article.originalTitle,
          summary: article.originalSummary || article.originalContent || article.originalTitle,
        }),
        article.featuredImageUrl || typeof this.sourceReader.readArticleMetadata !== 'function'
          ? Promise.resolve({ featuredImageUrl: '' })
          : this.sourceReader.readArticleMetadata(article.originalUrl || article.canonicalUrl),
      ]);
      const updated = await this.prisma.newsArticle.update({
        where: { id },
        data: {
          titleFa: prepared.title,
          summaryFa: prepared.summary,
          featuredImageUrl: article.featuredImageUrl || metadata.featuredImageUrl || '',
          status: 'ready',
          processingStartedAt: null,
          lastError: '',
        },
      });
      await this.integrationHealth.success({ tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - startedAt, metadata: { operation: 'news-summary' } }).catch((healthError) => this.logger.warn(`GapGPT health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
      await this.recordWorkflow({ tenantId, id, fromStatus: 'processing', toStatus: 'ready', action: 'prepared', title: `خبر «${updated.titleFa}» آماده شد` });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته GapGPT';
      await this.prisma.newsArticle.updateMany({ where: { id, tenantId, status: 'processing' }, data: { status: 'failed', processingStartedAt: null, lastError: message.slice(0, 1000) } });
      await this.integrationHealth.failure({ tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - startedAt, metadata: { operation: 'news-summary' }, error }).catch((healthError) => this.logger.warn(`GapGPT failure health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
      await this.recordWorkflow({ tenantId, id, fromStatus: 'processing', toStatus: 'failed', action: 'preparation-failed', title: `آماده‌سازی خبر «${article.titleFa || article.originalTitle}» ناموفق بود`, metadata: { error: message.slice(0, 1000) } });
      throw new BadRequestException(`آماده‌سازی خبر انجام نشد: ${message}`);
    }
  }

  async reject(tenantId: string, id: string) {
    const article = await this.findArticle(tenantId, id);
    if (['published', 'rejected', 'social_processing', 'social_sent'].includes(article.status)) throw new BadRequestException('این خبر قبلاً تعیین تکلیف شده است');
    const rejectedAt = new Date();
    const purgeAfter = new Date(rejectedAt.getTime() + REJECT_RETENTION_MS);
    const updated = await this.prisma.newsArticle.update({
      where: { id },
      data: { status: 'rejected', rejectedAt, purgeAfter, processingStartedAt: null, lastError: '' },
    });
    await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'rejected', action: 'rejected', title: `خبر «${article.titleFa || article.originalTitle}» رد شد` });
    return updated;
  }

  async publish(tenantId: string, id: string) {
    const article = await this.findArticle(tenantId, id);
    if (article.status === 'published' && article.wordpressPostUrl) return article;
    if (!['ready', 'publish_failed'].includes(article.status)) throw new BadRequestException('ابتدا خبر را با توجه به زبان آن آماده کنید');
    const claimed = await this.prisma.newsArticle.updateMany({
      where: { id, tenantId, status: { in: ['ready', 'publish_failed'] } },
      data: { status: 'publishing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new ConflictException('انتشار این خبر هم‌اکنون در حال انجام است');
    await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'publishing', action: 'publishing-started', title: `انتشار خبر «${article.titleFa || article.originalTitle}» آغاز شد` });

    try {
      const settings = await this.settings.getRaw(tenantId);
      this.wordpress.validateSettings(settings);
      const cachedCategories = parseWordPressCategories(settings.wp_categories);
      const [source, liveCategories] = await Promise.all([
        this.sourceReader.readArticleOrFallback(article.originalUrl || article.canonicalUrl, {
          text: article.originalContent || article.originalSummary || article.originalTitle,
          title: article.originalTitle,
          canonicalUrl: article.canonicalUrl,
          featuredImageUrl: article.featuredImageUrl,
          author: article.sourceName,
          fullTextAvailable: article.originalContentIsFull
            || looksLikeFullStoredFeedContent(article.originalContent, article.originalSummary),
        }),
        this.wordpress.categories(settings).catch((error) => {
          this.logger.warn(`Refreshing WordPress categories failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          return [];
        }),
      ]);
      const categories = liveCategories.length ? liveCategories : cachedCategories;
      const originalContent = source.text;
      const featuredImageUrl = source.featuredImageUrl || article.featuredImageUrl;
      if (!originalContent.trim()) throw new Error('متن کامل خبر از منبع دریافت نشد');
      if (source.contentSource === 'feed' && source.isFullText === false) {
        throw new Error(`فید «${article.sourceName || 'منبع'}» فقط چکیده خبر را ارائه می‌کند و صفحه خبر نیز متن کامل را به درخواست سرور تحویل نداد. برای جلوگیری از تولید خبر ناقص، انتشار متوقف شد؛ فید تمام‌متن، API رسمی یا دسترسی مجاز منبع لازم است`);
      }

      let contentFa = article.originalContent === originalContent ? article.contentFa : '';
      if (!contentFa) {
        const chunks = splitText(originalContent);
        const translated: string[] = [];
        for (let index = 0; index < chunks.length; index++) {
          translated.push(await this.gapGpt.translateFullText(settings, {
            sourceName: article.sourceName,
            title: article.originalTitle,
            text: chunks[index],
            part: index + 1,
            totalParts: chunks.length,
          }));
        }
        contentFa = translated.join('\n\n');
      }

      await this.prisma.newsArticle.update({ where: { id }, data: { originalContent, contentFa, featuredImageUrl } });
      let categoryId = Number(settings.wp_category_id || 0);
      if (categories.length) {
        if (!categories.some((category) => category.id === categoryId)) categoryId = 0;
        try {
          categoryId = await this.gapGpt.chooseWordPressCategory(settings, {
            sourceName: article.sourceName,
            title: article.titleFa,
            summary: article.summaryFa,
            categories,
          });
        } catch (error) {
          this.logger.warn(`Automatic WordPress category selection failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
      const wordpressStartedAt = Date.now();
      let published: { postId: string; url: string };
      try {
        published = await this.wordpress.publish(settings, {
          articleId: article.id,
          title: article.titleFa,
          excerpt: article.summaryFa,
          content: toWordPressHtml(contentFa, article.sourceName, article.originalUrl || article.canonicalUrl, article.id),
          featuredImageUrl,
          categoryId: Number.isSafeInteger(categoryId) && categoryId > 0 ? categoryId : null,
        });
        await this.integrationHealth.success({ tenantId, key: 'wordpress', type: 'publishing', name: 'WordPress', latencyMs: Date.now() - wordpressStartedAt, metadata: { operation: 'publish' } }).catch((healthError) => this.logger.warn(`WordPress health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
      } catch (error) {
        await this.integrationHealth.failure({ tenantId, key: 'wordpress', type: 'publishing', name: 'WordPress', latencyMs: Date.now() - wordpressStartedAt, metadata: { operation: 'publish' }, error }).catch((healthError) => this.logger.warn(`WordPress failure health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
        throw error;
      }
      const updated = await this.prisma.newsArticle.update({
        where: { id },
        data: {
          status: 'published',
          publishedAt: new Date(),
          processingStartedAt: null,
          wordpressPostId: published.postId,
          wordpressPostUrl: published.url,
          lastError: '',
        },
      });
      await this.recordWorkflow({ tenantId, id, fromStatus: 'publishing', toStatus: 'published', action: 'published', title: `خبر «${updated.titleFa}» در سایت منتشر شد`, metadata: { url: updated.wordpressPostUrl, postId: updated.wordpressPostId } });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته انتشار';
      await this.prisma.newsArticle.updateMany({ where: { id, tenantId, status: 'publishing' }, data: { status: 'publish_failed', processingStartedAt: null, lastError: message.slice(0, 1000) } });
      await this.recordWorkflow({ tenantId, id, fromStatus: 'publishing', toStatus: 'publish_failed', action: 'publishing-failed', title: `انتشار خبر «${article.titleFa || article.originalTitle}» ناموفق بود`, metadata: { error: message.slice(0, 1000) } });
      throw new BadRequestException(`انتشار خبر انجام نشد: ${message}`);
    }
  }

  async purgeRejected(tenantId?: string) {
    return this.prisma.newsArticle.deleteMany({ where: { ...(tenantId ? { tenantId } : {}), status: 'rejected', purgeAfter: { lte: new Date() } } });
  }

  @Interval('smart-publishing-newsroom-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      const enabledModules = await this.prisma.tenantModule.findMany({
        where: { moduleId: 'smart-publishing', enabled: true, tenant: { isActive: true } },
        select: { tenantId: true },
      });
      const enabledTenantIds = enabledModules.map((row) => row.tenantId);
      if (!enabledTenantIds.length) return;

      const staleBefore = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
      await this.prisma.newsArticle.updateMany({ where: { tenantId: { in: enabledTenantIds }, status: 'processing', processingStartedAt: { lte: staleBefore } }, data: { status: 'new', processingStartedAt: null } });
      await this.prisma.newsArticle.updateMany({ where: { tenantId: { in: enabledTenantIds }, status: 'publishing', processingStartedAt: { lte: staleBefore } }, data: { status: 'publish_failed', processingStartedAt: null, lastError: 'عملیات انتشار قبلی ناتمام مانده بود؛ دوباره تلاش کنید' } });
      await this.prisma.newsArticle.updateMany({ where: { tenantId: { in: enabledTenantIds }, status: 'social_processing', processingStartedAt: { lte: staleBefore } }, data: { status: 'social_failed', processingStartedAt: null, lastError: 'ارسال قبلی به استودیوی اجتماعی ناتمام ماند؛ دوباره تلاش کنید' } });
      await this.prisma.newsArticle.deleteMany({ where: { tenantId: { in: enabledTenantIds }, status: 'rejected', purgeAfter: { lte: new Date() } } });

      const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId: { in: enabledTenantIds }, purpose: 'news-room', enabled: true }, orderBy: { lastFetchedAt: 'asc' } });
      for (const feed of feeds) {
        const settings = await this.settings.getRaw(feed.tenantId);
        const intervalMs = sourceInterval(feed.pollIntervalMinutes, Number(settings.news_poll_interval_minutes || 240)) * 60_000;
        if (sourceBoolean(feed.autoPoll, settingEnabled(settings.news_auto_poll, true)) && (!feed.lastFetchedAt || Date.now() - feed.lastFetchedAt.getTime() >= intervalMs)) {
          await this.jobs.enqueue({
            tenantId: feed.tenantId,
            type: 'news.feed.fetch',
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
      this.logger.error(`Newsroom maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintenanceRunning = false;
    }
  }

  async queueAutomation(tenantId: string, limit = 25, providedSettings?: PublishingSettings) {
    const settings = providedSettings || await this.settings.getRaw(tenantId);
    const prepared = settingEnabled(settings.news_auto_prepare, true)
      ? await this.enqueuePending(tenantId, limit, true)
      : 0;
    const routeToSocial = settingEnabled(settings.news_auto_send_social);
    const sentToSocial = routeToSocial
      ? await this.enqueueReady(tenantId, 'news.send-social', limit, 'autoSendSocial')
      : 0;
    const published = !routeToSocial && settingEnabled(settings.news_auto_publish)
      ? await this.enqueueReady(tenantId, 'news.publish', limit, 'autoPublish')
      : 0;
    return { prepared, sentToSocial, published };
  }

  private async enqueuePending(tenantId: string, limit: number, requireSourceAutomation = false) {
    const settings = await this.settings.getRaw(tenantId);
    const fallback = settingEnabled(settings.news_auto_prepare, true);
    const rows = await this.prisma.newsArticle.findMany({ where: { tenantId, status: 'new', feed: { purpose: 'news-room' } }, orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }], take: Math.max(limit * 4, 100), select: { id: true, feed: { select: { autoPrepare: true } } } });
    let queued = 0;
    for (const row of rows.filter((item) => !requireSourceAutomation || sourceBoolean(item.feed?.autoPrepare, fallback)).slice(0, limit)) {
      const result = await this.jobs.enqueue({
        tenantId,
        type: 'news.prepare',
        payload: { articleId: row.id },
        dedupeKey: `news:${row.id}:prepare`,
        priority: 10,
      });
      if (result.created) queued += 1;
    }
    return queued;
  }

  private async enqueueReady(tenantId: string, type: 'news.publish' | 'news.send-social', limit: number, sourceSetting: 'autoPublish' | 'autoSendSocial') {
    const settings = await this.settings.getRaw(tenantId);
    const fallback = type === 'news.publish' ? settingEnabled(settings.news_auto_publish) : settingEnabled(settings.news_auto_send_social);
    const rows = await this.prisma.newsArticle.findMany({
      where: { tenantId, status: 'ready', feed: { purpose: 'news-room' } },
      orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(limit * 4, 100),
      select: { id: true, feed: { select: { autoPublish: true, autoSendSocial: true } } },
    });
    let queued = 0;
    for (const row of rows.filter((item) => sourceBoolean(item.feed?.[sourceSetting], fallback)).slice(0, limit)) {
      const result = await this.jobs.enqueue({
        tenantId,
        type,
        payload: { articleId: row.id },
        dedupeKey: `news:${row.id}:${type === 'news.publish' ? 'publish' : 'send-social'}`,
        priority: type === 'news.publish' ? 5 : 7,
        maxAttempts: 6,
      });
      if (result.created) queued += 1;
    }
    return queued;
  }

  private async findFeed(tenantId: string, id: string) {
    const feed = await this.prisma.newsFeed.findFirst({ where: { id, tenantId } });
    if (!feed) throw new NotFoundException('فید یافت نشد');
    return feed;
  }

  private async findArticle(tenantId: string, id: string) {
    const article = await this.prisma.newsArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('خبر یافت نشد');
    return article;
  }
}
