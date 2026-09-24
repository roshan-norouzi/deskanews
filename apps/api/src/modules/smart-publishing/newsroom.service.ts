import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { USAGE_METRIC_KEYS, detectSourceLanguageFromItems, inferFeedTopicLabel, normalizeFeedCatalogGroupForSource, normalizeFeedSourceType, normalizeSourceLanguage, resolveFeedLogoUrl, resolveNewsroomServiceAccess, shouldUsePersianRewrite } from '@deska/shared';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FEED_PURPOSES, type CreateFeedDto, type FeedPurpose, type ProbeFeedDto, type UpdateFeedDto, type UpdateTenantPlatformFeedDto, type SourceType } from './dto/feed.dto';
import { NEWS_STATUSES, type PublishNewsArticleDto, type UpdateNewsArticleDto } from './dto/news-article.dto';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { SourceReaderService } from './source-reader.service';
import { cleanExtractedArticleText } from './article-body-cleanup';
import { WordPressClient } from './wordpress.client';
import { parseWordPressCategories } from './wordpress-category';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { SchedulerRuntimeService } from '../../common/services/scheduler-runtime.service';
import { IntegrationHealthService } from '../../common/services/integration-health.service';
import { ContentWorkflowService } from '../../common/services/content-workflow.service';
import { entryFilterText, matchesWordFilters, parseWordList } from './feed-word-filter';
import { entryGuids, omitKnownStories } from './feed-dedupe';
import { buildLatestFeedPreviewItems } from './feed-preview';
import { PlatformFeedService } from './platform-feed.service';
import { UsageTrackingService } from '../../platform/usage/usage-tracking.service';
import { DestinationCategoryService } from './destination-category.service';
import { newsroomArticleWhere, orphanedNewsArticleWhere } from './newsroom-article-stats';
import { decodeArticleCursor, encodeArticleCursor } from '../../common/article-page';
import { resolvePublishHtml } from './news-publish-html';

const REJECT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

type MemberNewsroomAccess = {
  permissions: string[];
  newsroomServiceIds: string[];
};

function newsroomCategoryFilter(access?: MemberNewsroomAccess) {
  if (!access) return {};
  const resolved = resolveNewsroomServiceAccess(access.permissions, access.newsroomServiceIds);
  if (resolved === 'all') return {};
  if (resolved === 'none') return { destinationCategoryId: { in: [] as string[] } };
  return {
    OR: [
      { destinationCategory: { isGeneral: true } },
      { destinationCategoryId: { in: resolved } },
    ],
  };
}

function assertNewsroomArticleAccess(
  article: {
    destinationCategoryId: string | null;
    destinationCategory?: { isGeneral: boolean } | null;
  },
  access?: MemberNewsroomAccess,
) {
  if (!access) return;
  const resolved = resolveNewsroomServiceAccess(access.permissions, access.newsroomServiceIds);
  if (resolved === 'all') return;
  if (resolved === 'none') {
    throw new ForbiddenException('دسترسی به این سرویس میز خبر مجاز نیست');
  }
  if (article.destinationCategory?.isGeneral) return;
  if (!article.destinationCategoryId || !resolved.includes(article.destinationCategoryId)) {
    throw new ForbiddenException('دسترسی به این سرویس میز خبر مجاز نیست');
  }
}

function assertNewsroomCategoryAccess(categoryId: string | null, access?: MemberNewsroomAccess) {
  if (!access || !categoryId) return;
  assertNewsroomArticleAccess({ destinationCategoryId: categoryId }, access);
}

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
  return normalizeFeedSourceType(value);
}

function sourceBoolean(value: boolean | null | undefined, fallback: boolean): boolean {
  return value === null || value === undefined ? fallback : value;
}

function sourceInterval(value: number | null | undefined, fallback: number): number {
  return Number.isInteger(value) && value! >= 5 && value! <= 1440 ? value! : fallback;
}

type FeedAutomationInput = {
  settingsMode?: 'default' | 'custom';
  pollIntervalMinutes?: number;
  autoPoll?: boolean;
  autoPrepare?: boolean;
  autoPublish?: boolean;
  autoSendSocial?: boolean;
};

function resolveNewsFeedAutomationMode(purpose: FeedPurpose, data: FeedAutomationInput): 'default' | 'custom' {
  if (purpose !== 'news-room') return 'custom';
  if (data.settingsMode === 'default') return 'default';
  if (data.settingsMode === 'custom') return 'custom';
  const hasExplicitAutomation = data.pollIntervalMinutes !== undefined
    || data.autoPoll !== undefined
    || data.autoPrepare !== undefined
    || data.autoPublish !== undefined
    || data.autoSendSocial !== undefined;
  return hasExplicitAutomation ? 'custom' : 'default';
}

function resolveNewsFeedAutomationWrite(purpose: FeedPurpose, data: FeedAutomationInput) {
  const useOrganizationDefaults = resolveNewsFeedAutomationMode(purpose, data) === 'default';
  if (useOrganizationDefaults) {
    return {
      settingsMode: 'default' as const,
      pollIntervalMinutes: null,
      autoPoll: null,
      autoPrepare: null,
      autoPublish: null,
      autoSendSocial: null,
    };
  }
  return {
    settingsMode: 'custom' as const,
    pollIntervalMinutes: data.pollIntervalMinutes ?? 240,
    autoPoll: data.autoPoll ?? true,
    autoPrepare: data.autoPrepare ?? (purpose === 'news-room'),
    autoPublish: data.autoPublish ?? false,
    autoSendSocial: data.autoSendSocial ?? false,
  };
}

function newsFeedAutomationTouched(data: FeedAutomationInput) {
  return data.settingsMode !== undefined
    || data.pollIntervalMinutes !== undefined
    || data.autoPoll !== undefined
    || data.autoPrepare !== undefined
    || data.autoPublish !== undefined
    || data.autoSendSocial !== undefined;
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
  private socialPhotoBackfillRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly sourceReader: SourceReaderService,
    private readonly wordpress: WordPressClient,
    private readonly jobs: AutomationJobService,
    private readonly integrationHealth: IntegrationHealthService,
    private readonly workflow: ContentWorkflowService,
    private readonly platformFeeds: PlatformFeedService,
    private readonly usageTracking: UsageTrackingService,
    private readonly destinationCategories: DestinationCategoryService,
    private readonly scheduler: SchedulerRuntimeService,
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

  async feeds(tenantId: string, purpose?: FeedPurpose) {
    const tenantFeeds = await this.prisma.newsFeed.findMany({
      where: { tenantId, ...(purpose ? { purpose } : {}) },
      orderBy: [{ purpose: 'asc' }, { name: 'asc' }],
    });
    this.scheduleSocialPhotoBackfill(tenantFeeds);
    return tenantFeeds.map((feed) => ({
      ...feed,
      lastError: '',
      logoUrl: resolveFeedLogoUrl(feed.url, feed.logoUrl, feed.sourceType),
      scope: 'tenant' as const,
    }));
  }

  listPlatformFeeds(tenantId: string) {
    return this.platformFeeds.listForTenant(tenantId);
  }

  listSourceLanguages() {
    return this.platformFeeds.listSourceLanguageCatalog();
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
      await this.prisma.newsFeed.update({ where: { id: feed.id }, data: { logoUrl: photo } });
    }));
  }

  updatePlatformFeedSubscription(
    tenantId: string,
    platformFeedId: string,
    data: UpdateTenantPlatformFeedDto,
  ) {
    return this.platformFeeds.updateSubscriptionForTenant(tenantId, platformFeedId, data);
  }

  async togglePlatformFeed(tenantId: string, platformFeedId: string, enabled?: boolean) {
    return this.platformFeeds.toggleForTenant(tenantId, platformFeedId, enabled);
  }

  private feedChannels(data: { url?: string; topicLabel?: string; channels?: Array<{ url: string; topicLabel?: string }> }) {
    const raw = data.channels?.length
      ? data.channels
      : data.url ? [{ url: data.url, topicLabel: data.topicLabel }] : [];
    const seen = new Set<string>();
    const channels: Array<{ url: string; topicLabel: string }> = [];
    for (const channel of raw) {
      const url = normalizeFeedUrl(channel.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      channels.push({ url, topicLabel: (channel.topicLabel || '').trim() });
    }
    if (!channels.length) throw new BadRequestException('حداقل یک آدرس RSS لازم است.');
    return channels;
  }

  async addFeed(tenantId: string, data: CreateFeedDto) {
    const channels = this.feedChannels(data);
    const name = data.name.trim();
    const url = channels[0].url;
    data = { ...data, url, topicLabel: channels[0].topicLabel };
    const sourceType = normalizeSourceType(data.sourceType);
    const purpose = normalizePurpose(data.purpose);
    const duplicate = await this.prisma.newsFeed.findFirst({ where: { tenantId, url } });
    if (duplicate) throw new ConflictException('این فید قبلاً ثبت شده است');
    if (purpose === 'news-room') {
      const platformDuplicate = await this.prisma.platformFeed.findUnique({ where: { url } });
      if (platformDuplicate) {
        throw new ConflictException('این منبع به‌صورت پیش‌فرض پلتفرم موجود است؛ از بخش منابع پیش‌فرض آن را فعال کنید');
      }
    }

    let resolvedFeedUrl = '';
    if (sourceType === 'website') {
      resolvedFeedUrl = (await this.sourceReader.discoverFeedUrl(url).catch(() => null)) || '';
    }
    const catalogGroup = normalizeFeedCatalogGroupForSource(data.catalogGroup, sourceType, data.sourceLanguage ?? 'auto');
    const chosenLabel = await this.settings.chosenTopicLabel(data.topicLabel);
    const sourceLanguage = normalizeSourceLanguage(data.sourceLanguage);
    const profilePhoto = (sourceType === 'telegram' || sourceType === 'twitter')
      ? await this.sourceReader.resolveFeedProfilePhoto(url, sourceType).catch(() => '')
      : '';

    const automation = resolveNewsFeedAutomationWrite(purpose, data);
    const created = await this.prisma.newsFeed.create({ data: {
      tenantId,
      name,
      url,
      sourceType,
      catalogGroup,
      topicLabel: chosenLabel !== undefined && chosenLabel !== '' ? chosenLabel : inferFeedTopicLabel(name, url, catalogGroup),
      resolvedFeedUrl,
      logoUrl: profilePhoto,
      includeWords: parseWordList(data.includeWords),
      excludeWords: parseWordList(data.excludeWords),
      purpose,
      enabled: data.enabled ?? true,
      sourceLanguage,
      ...automation,
    } });
    if (sourceLanguage !== 'auto') {
      await this.settings.rememberSourceLanguages([sourceLanguage]).catch(() => undefined);
    }
    await this.syncNewsFeedChannels(tenantId, created.id, channels);
    return this.findFeed(tenantId, created.id);
  }

  async updateFeed(tenantId: string, id: string, data: UpdateFeedDto) {
    const feed = await this.findFeed(tenantId, id);
    const name = String(data.name ?? feed.name).trim();
    const url = normalizeFeedUrl(String(data.url ?? feed.url));
    const sourceType = normalizeSourceType(data.sourceType ?? feed.sourceType);
    const purpose = normalizePurpose(data.purpose, normalizePurpose(feed.purpose));
    const groupKey = feed.sourceGroupId || feed.id;
    const duplicate = await this.prisma.newsFeed.findFirst({ where: { tenantId, url, NOT: { id } } });
    if (duplicate && (duplicate.sourceGroupId || duplicate.id) !== groupKey) {
      throw new ConflictException('این آدرس قبلاً ثبت شده است');
    }
    const urlForRow = duplicate ? feed.url : url;
    if (purpose === 'news-room') {
      const platformDuplicate = await this.prisma.platformFeed.findFirst({ where: { url, NOT: { url: feed.url } } });
      if (platformDuplicate && platformDuplicate.url === url) {
        throw new ConflictException('این منبع به‌صورت پیش‌فرض پلتفرم موجود است');
      }
    }
    if (normalizePurpose(feed.purpose) !== purpose) {
      throw new BadRequestException('کاربرد منبع (میز خبر / استودیوی اجتماعی) پس از ایجاد قابل تغییر نیست');
    }

    let resolvedFeedUrl = feed.resolvedFeedUrl;
    if (sourceType === 'website' && (data.url || data.sourceType)) {
      resolvedFeedUrl = (await this.sourceReader.discoverFeedUrl(url).catch(() => null)) || '';
    } else if (sourceType !== 'website') {
      resolvedFeedUrl = '';
    }
    const catalogGroup = data.catalogGroup !== undefined
      ? normalizeFeedCatalogGroupForSource(data.catalogGroup, sourceType, data.sourceLanguage ?? feed.sourceLanguage ?? 'auto')
      : feed.catalogGroup;
    const chosenLabel = await this.settings.chosenTopicLabel(data.topicLabel);
    const sourceLanguage = data.sourceLanguage !== undefined
      ? normalizeSourceLanguage(data.sourceLanguage)
      : feed.sourceLanguage;
    const shouldRefreshProfilePhoto = (sourceType === 'telegram' || sourceType === 'twitter')
      && (!feed.logoUrl?.trim() || data.url || data.sourceType);
    const profilePhoto = shouldRefreshProfilePhoto
      ? await this.sourceReader.resolveFeedProfilePhoto(url, sourceType).catch(() => '')
      : feed.logoUrl;

    let automationPatch: ReturnType<typeof resolveNewsFeedAutomationWrite> | Record<string, never> = {};
    if (purpose === 'news-room') {
      if (data.settingsMode === 'default') {
        automationPatch = resolveNewsFeedAutomationWrite(purpose, { settingsMode: 'default' });
      } else if (data.settingsMode === 'custom' || newsFeedAutomationTouched(data)) {
        automationPatch = resolveNewsFeedAutomationWrite(purpose, {
          settingsMode: 'custom',
          pollIntervalMinutes: data.pollIntervalMinutes ?? feed.pollIntervalMinutes ?? 240,
          autoPoll: data.autoPoll ?? feed.autoPoll ?? true,
          autoPrepare: data.autoPrepare ?? feed.autoPrepare ?? true,
          autoPublish: data.autoPublish ?? feed.autoPublish ?? false,
          autoSendSocial: data.autoSendSocial ?? feed.autoSendSocial ?? false,
        });
      }
    }

    const updated = await this.prisma.newsFeed.update({ where: { id }, data: {
      name,
      url: urlForRow,
      sourceType,
      catalogGroup,
      ...(chosenLabel !== undefined ? { topicLabel: chosenLabel } : {}),
      resolvedFeedUrl,
      ...(shouldRefreshProfilePhoto && profilePhoto ? { logoUrl: profilePhoto } : {}),
      ...(data.includeWords !== undefined ? { includeWords: parseWordList(data.includeWords) } : {}),
      ...(data.excludeWords !== undefined ? { excludeWords: parseWordList(data.excludeWords) } : {}),
      purpose,
      ...(data.sourceLanguage !== undefined ? { sourceLanguage } : {}),
      ...automationPatch,
      ...(purpose === 'social-studio' && data.pollIntervalMinutes !== undefined ? { pollIntervalMinutes: data.pollIntervalMinutes } : {}),
      ...(purpose === 'social-studio' && data.autoPoll !== undefined ? { autoPoll: data.autoPoll } : {}),
      ...(purpose === 'social-studio' && data.autoPrepare !== undefined ? { autoPrepare: data.autoPrepare } : {}),
      ...(purpose === 'social-studio' && data.autoPublish !== undefined ? { autoPublish: data.autoPublish } : {}),
      ...(purpose === 'social-studio' && data.autoSendSocial !== undefined ? { autoSendSocial: data.autoSendSocial } : {}),
    } });
    if (data.sourceLanguage !== undefined && sourceLanguage !== 'auto') {
      await this.settings.rememberSourceLanguages([sourceLanguage]).catch(() => undefined);
    }
    if (data.channels?.length) {
      const survivorId = await this.syncNewsFeedChannels(tenantId, id, this.feedChannels({ url: updated.url, topicLabel: updated.topicLabel, channels: data.channels }));
      return this.findFeed(tenantId, survivorId);
    } else if (!updated.sourceGroupId) {
      await this.prisma.newsFeed.update({ where: { id }, data: { sourceGroupId: id } });
    }
    return this.findFeed(tenantId, id);
  }

  private async syncNewsFeedChannels(tenantId: string, anchorId: string, channels: Array<{ url: string; topicLabel: string }>) {
    const anchor = await this.findFeed(tenantId, anchorId);
    const groupId = anchor.sourceGroupId || anchor.id;
    const members = await this.prisma.newsFeed.findMany({ where: { tenantId, sourceGroupId: groupId, purpose: anchor.purpose } });
    const roster = members.some((member) => member.id === anchor.id) ? members : [anchor, ...members];
    const byUrl = new Map(roster.map((member) => [member.url, member]));
    const used = new Set<string>();
    for (const [index, channel] of channels.entries()) {
      const label = await this.settings.chosenTopicLabel(channel.topicLabel);
      const topicLabel = label !== undefined && label !== '' ? label : inferFeedTopicLabel(anchor.name, channel.url, anchor.catalogGroup);
      const existing = byUrl.get(channel.url);
      if (existing && !used.has(existing.id)) {
        await this.prisma.newsFeed.update({
          where: { id: existing.id },
          data: { name: anchor.name, topicLabel, sourceGroupId: groupId, sourceType: anchor.sourceType, catalogGroup: anchor.catalogGroup, sourceLanguage: anchor.sourceLanguage, enabled: anchor.enabled },
        });
        used.add(existing.id);
        continue;
      }
      if (index === 0 && !used.has(anchor.id)) {
        await this.prisma.newsFeed.update({
          where: { id: anchor.id },
          data: { url: channel.url, topicLabel, sourceGroupId: groupId },
        });
        used.add(anchor.id);
        continue;
      }
      const created = await this.prisma.newsFeed.create({
        data: {
          tenantId,
          name: anchor.name,
          url: channel.url,
          sourceType: anchor.sourceType,
          catalogGroup: anchor.catalogGroup,
          topicLabel,
          sourceGroupId: groupId,
          resolvedFeedUrl: '',
          logoUrl: anchor.logoUrl,
          includeWords: anchor.includeWords,
          excludeWords: anchor.excludeWords,
          pollIntervalMinutes: anchor.pollIntervalMinutes,
          autoPoll: anchor.autoPoll,
          autoPrepare: anchor.autoPrepare,
          autoPublish: anchor.autoPublish,
          autoSendSocial: anchor.autoSendSocial,
          settingsMode: anchor.settingsMode,
          purpose: anchor.purpose,
          sourceLanguage: anchor.sourceLanguage,
          enabled: anchor.enabled,
        },
      });
      used.add(created.id);
    }
    for (const member of roster) {
      if (!used.has(member.id)) await this.deleteFeed(tenantId, member.id);
    }
    if (used.has(anchor.id)) return anchor.id;
    const survivor = await this.prisma.newsFeed.findFirst({ where: { tenantId, sourceGroupId: groupId }, select: { id: true } });
    return survivor?.id || anchor.id;
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

  async articles(
    tenantId: string,
    filters: { status?: string; categoryId?: string; generalOnly?: boolean; access?: MemberNewsroomAccess; cursor?: string } = {},
  ) {
    await this.purgeRejected();
    const { status, categoryId, generalOnly, access, cursor } = filters;
    if (status && !NEWS_STATUSES.includes(status as (typeof NEWS_STATUSES)[number])) {
      throw new BadRequestException('وضعیت خبر معتبر نیست');
    }
    const serviceFilter = newsroomCategoryFilter(access);
    if (categoryId) {
      const resolved = access ? resolveNewsroomServiceAccess(access.permissions, access.newsroomServiceIds) : 'all';
      if (resolved !== 'all' && resolved !== 'none' && !resolved.includes(categoryId)) {
        throw new ForbiddenException('دسترسی به این سرویس میز خبر مجاز نیست');
      }
      if (resolved === 'none') return { items: [], nextCursor: null };
    }
    const decoded = decodeArticleCursor(cursor);
    const reader = this.prisma.reader ?? this.prisma;
    const rows = await reader.newsArticle.findMany({
      where: {
        ...newsroomArticleWhere(tenantId),
        ...serviceFilter,
        ...(status ? { status } : {}),
        ...(categoryId ? { destinationCategoryId: categoryId } : {}),
        ...(generalOnly ? { destinationCategory: { isGeneral: true } } : {}),
        ...(decoded ? {
          OR: [
            { publishedAtSource: { lt: decoded.stamp ?? new Date(0) } },
            { publishedAtSource: decoded.stamp, id: { lt: decoded.id } },
          ],
        } : {}),
      },
      omit: { originalContent: true },
      include: {
        feed: { select: { id: true, name: true, purpose: true, sourceLanguage: true } },
        platformFeedArticle: { select: { platformFeed: { select: { sourceLanguage: true } } } },
        destinationCategory: { select: { id: true, name: true, isGeneral: true } },
      },
      orderBy: [{ publishedAtSource: 'desc' }, { id: 'desc' }],
      take: 51,
    });
    const items = rows.slice(0, 50);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > 50 && last ? encodeArticleCursor(last.publishedAtSource, last.id) : null,
    };
  }

  async deleteAllArticles(tenantId: string) {
    const result = await this.prisma.newsArticle.deleteMany({
      where: { tenantId },
    });
    return { ok: true, deleted: result.count };
  }

  async updateArticle(
    tenantId: string,
    id: string,
    data: UpdateNewsArticleDto,
    userId?: string,
    access?: MemberNewsroomAccess,
  ) {
    const article = await this.findArticle(tenantId, id);
    assertNewsroomArticleAccess(article, access);
    if (['rejected', 'publishing', 'published', 'social_processing', 'social_sent'].includes(article.status)) {
      throw new BadRequestException('ویرایش خبر در وضعیت فعلی مجاز نیست');
    }
    if (data.destinationCategoryId !== undefined) {
      assertNewsroomCategoryAccess(data.destinationCategoryId, access);
      return this.destinationCategories.assignManualCategory(tenantId, id, data.destinationCategoryId, userId);
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
      include: {
        destinationCategory: { select: { id: true, name: true, isGeneral: true } },
      },
    });
    if (data.status && data.status !== article.status) {
      await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: data.status, action: 'status-updated', title: `وضعیت خبر «${updated.titleFa || updated.originalTitle}» تغییر کرد` });
    }
    return updated;
  }

  async updateFeaturedImage(tenantId: string, id: string, featuredImageUrl: string | null, access?: MemberNewsroomAccess) {
    const article = await this.findArticle(tenantId, id);
    assertNewsroomArticleAccess(article, access);
    if (['rejected', 'publishing', 'published', 'social_processing', 'social_sent'].includes(article.status)) {
      throw new BadRequestException('تغییر تصویر شاخص در وضعیت فعلی مجاز نیست');
    }
    const nextUrl = featuredImageUrl?.trim() || '';
    const updated = await this.prisma.newsArticle.update({
      where: { id },
      data: { featuredImageUrl: nextUrl },
      include: {
        destinationCategory: { select: { id: true, name: true, isGeneral: true } },
      },
    });
    return { article: updated, previousFeaturedImageUrl: article.featuredImageUrl || null };
  }

  async fetchFeed(tenantId: string, feedId: string) {
    const feed = await this.findFeed(tenantId, feedId);
    if (feed.purpose !== 'news-room') throw new BadRequestException('پایش این فید در بخش مربوط به آن انجام می‌شود');
    if (!feed.enabled) throw new BadRequestException('ابتدا فید را فعال کنید');
    const deferred = await this.deferHeavyWork(tenantId, 'news.feed.fetch', { feedId }, `feed:${feedId}:fetch`);
    if (deferred) return deferred;
    const startedAt = Date.now();
    try {
      const settings = await this.settings.getRaw(tenantId);
      const maxAgeMs = Number(settings.news_max_age_days || 10) * 24 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - maxAgeMs);
      const { entries, resolvedFeedUrl } = await this.sourceReader.readSourceWithMeta(feed.sourceType || 'rss', feed.url, {
        resolvedFeedUrl: feed.resolvedFeedUrl,
      });
      const matching = entries
        .filter((entry) => (!entry.publishedAt || entry.publishedAt >= cutoff)
          && matchesWordFilters(entryFilterText(entry), feed.includeWords, feed.excludeWords));
      const guids = entryGuids(matching);
      const urls = [...new Set(matching.map((entry) => entry.canonicalUrl))];
      const identityOr = [
        ...(urls.length ? [{ canonicalUrl: { in: urls } }] : []),
        ...(guids.length ? [{ guid: { in: guids } }] : []),
      ];
      const [byLink, bySource] = matching.length
        ? await Promise.all([
          identityOr.length
            ? this.prisma.newsArticle.findMany({
              where: { tenantId, OR: identityOr },
              select: { canonicalUrl: true, guid: true, originalTitle: true },
            })
            : Promise.resolve([]),
          this.prisma.newsArticle.findMany({
            where: { tenantId, sourceName: feed.name },
            select: { canonicalUrl: true, guid: true, originalTitle: true },
            orderBy: { createdAt: 'desc' },
            take: 400,
          }),
        ])
        : [[], []];
      const known = [...byLink, ...bySource];
      const filtered = omitKnownStories(matching, known);
      const result = filtered.length ? await this.prisma.newsArticle.createMany({
        skipDuplicates: true,
        data: filtered.map((entry) => ({
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
          status: 'new',
        })),
      }) : { count: 0 };
      if (result.count > 0) {
        await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_MONITORED, result.count);
        await this.destinationCategories.categorizeArticlesByCanonicalUrls(
          tenantId,
          filtered.map((entry) => entry.canonicalUrl),
        ).catch((error) => this.logger.warn(`Feed categorization failed: ${error instanceof Error ? error.message : 'unknown error'}`));
      }
      await this.prisma.newsFeed.update({
        where: { id: feedId },
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
        metadata: { purpose: feed.purpose, url: feed.url, discovered: filtered.length, created: result.count },
      }).catch((error) => this.logger.warn(`Feed health could not be recorded: ${error instanceof Error ? error.message : 'unknown error'}`));
      return { ok: true, discovered: filtered.length, created: result.count };
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

  async probeFeed(dto: ProbeFeedDto) {
    return this.sourceReader.runPreviewFetch(async () => {
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
        items,
      };
    });
  }

  async testFeed(tenantId: string, feedId: string) {
    const feed = await this.findFeed(tenantId, feedId);
    const startedAt = Date.now();
    try {
      const entries = await this.sourceReader.runPreviewFetch(() => this.sourceReader.readSource(feed.sourceType || 'rss', feed.url));
      const latest = buildLatestFeedPreviewItems(entries, feed.includeWords, feed.excludeWords);
      const detectedLanguage = detectSourceLanguageFromItems(latest);
      if ((!feed.sourceLanguage || feed.sourceLanguage === 'auto') && detectedLanguage !== 'auto') {
        await this.prisma.newsFeed.update({
          where: { id: feed.id },
          data: { sourceLanguage: detectedLanguage },
        });
      }
      if (detectedLanguage !== 'auto') {
        await this.settings.rememberSourceLanguages([detectedLanguage]).catch(() => undefined);
      }
      await this.integrationHealth.success({ tenantId, key: `feed:${feed.id}`, type: 'feed', name: feed.name, latencyMs: Date.now() - startedAt, metadata: { operation: 'health-test', sourceType: feed.sourceType || 'rss', items: latest.length, sourceLanguage: detectedLanguage } }).catch(() => undefined);
      return {
        ok: true,
        source: {
          id: feed.id,
          name: feed.name,
          url: feed.url,
          sourceType: feed.sourceType || 'rss',
          resolvedFeedUrl: feed.resolvedFeedUrl,
        },
        items: latest,
      };
    } catch (error) {
      await this.integrationHealth.failure({ tenantId, key: `feed:${feed.id}`, type: 'feed', name: feed.name, latencyMs: Date.now() - startedAt, metadata: { operation: 'health-test', sourceType: feed.sourceType || 'rss' }, error }).catch(() => undefined);
      throw error;
    }
  }

  async sync(tenantId: string) {
    const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId, purpose: 'news-room', enabled: true } });
    const enabledPlatformFeeds = await this.prisma.tenantPlatformFeed.count({
      where: { tenantId, enabled: true, platformFeed: { enabled: true } },
    });
    if (!feeds.length && !enabledPlatformFeeds) {
      throw new BadRequestException(
        'هیچ منبع فعالی برای میز خبر ثبت نشده است. از بخش «منابع پیش‌فرض» یا «منابع اختصاصی» حداقل یک منبع را فعال کنید.',
      );
    }

    const results: Array<{ feedId?: string; platformFeedId?: string; ok: boolean; created?: number; error?: string }> = [];
    for (const feed of feeds) {
      try {
        const result = await this.fetchFeed(tenantId, feed.id);
        results.push({ feedId: feed.id, ok: true, created: result.created });
      } catch (error) {
        results.push({ feedId: feed.id, ok: false, error: error instanceof Error ? error.message : 'خطای دریافت فید' });
      }
    }

    if (enabledPlatformFeeds) {
      const platformResults = await this.platformFeeds.syncTenantSubscriptions(tenantId, { refresh: true });
      results.push(...platformResults);
    }

    const automation = await this.queueAutomation(tenantId, 25);
    const queued = await this.prisma.newsArticle.count({ where: { tenantId, status: 'new' } });
    const failed = results.filter((item) => !item.ok);
    return {
      ok: failed.length === 0,
      feeds: results,
      queued,
      automation,
      message: failed.length
        ? `${failed.length} منبع دریافت نشد؛ جزئیات در صفحه منابع خبری ثبت شده است`
        : 'همه منابع فعال میز خبر با موفقیت پایش شدند',
    };
  }

  async summarize(tenantId: string, id: string, access?: MemberNewsroomAccess) {
    const article = await this.findArticle(tenantId, id);
    assertNewsroomArticleAccess(article, access);
    if (['rejected', 'publishing', 'published'].includes(article.status)) throw new BadRequestException('آماده‌سازی خبر در وضعیت فعلی مجاز نیست');
    const deferred = await this.deferHeavyWork(tenantId, 'news.prepare', { articleId: id }, `news:${id}:prepare`);
    if (deferred) return deferred;

    if (article.platformFeedArticleId) {
      const shared = await this.prisma.platformFeedArticle.findUnique({ where: { id: article.platformFeedArticleId } });
      if (shared?.prepStatus === 'ready') {
        const updated = await this.prisma.newsArticle.update({
          where: { id },
          data: {
            titleFa: shared.titleFa,
            summaryFa: shared.summaryFa,
            status: 'ready',
            processingStartedAt: null,
            lastError: '',
          },
        });
        await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'ready', action: 'prepared', title: `خبر «${updated.titleFa}» از منبع مشترک آماده شد` });
        await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_PREPARED, 1);
        return updated;
      }
      await this.platformFeeds.prepareSharedArticle(article.platformFeedArticleId, tenantId);
      const refreshed = await this.findArticle(tenantId, id);
      if (refreshed.status === 'ready') {
        await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'ready', action: 'prepared', title: `خبر «${refreshed.titleFa}» آماده شد` });
        await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_PREPARED, 1);
      }
      return refreshed;
    }

    const claimed = await this.prisma.newsArticle.updateMany({
      where: { id, tenantId, status: { in: ['new', 'ready', 'failed', 'publish_failed'] } },
      data: { status: 'processing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new ConflictException('این خبر هم‌اکنون در حال پردازش است');
    await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'processing', action: 'preparation-started', title: `آماده‌سازی خبر «${article.titleFa || article.originalTitle}» آغاز شد` });
    const startedAt = Date.now();
    try {
      const settings = await this.settings.getRaw(tenantId);
      const sourceLanguage = await this.resolveSourceLanguage(article);
      const [prepared, metadata] = await Promise.all([
        this.gapGpt.summarize(settings, {
          sourceName: article.sourceName,
          title: article.originalTitle,
          summary: article.originalSummary || article.originalContent || article.originalTitle,
          sourceLanguage,
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
      const summaryIsPersian = shouldUsePersianRewrite(sourceLanguage, `${article.originalTitle}\n${article.originalSummary || article.originalContent || ''}`);
      await this.usageTracking.record(tenantId, summaryIsPersian ? USAGE_METRIC_KEYS.NEWS_REWRITTEN : USAGE_METRIC_KEYS.NEWS_SUMMARIZED, 1);
      await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_PREPARED, 1);
      await this.recordWorkflow({ tenantId, id, fromStatus: 'processing', toStatus: 'ready', action: 'prepared', title: `خبر «${updated.titleFa}» آماده شد` });
      const current = await this.prisma.newsArticle.findUnique({
        where: { id },
        include: { destinationCategory: { select: { isGeneral: true } } },
      });
      if (current?.categorySource !== 'manual' && current?.destinationCategory?.isGeneral) {
        await this.destinationCategories.categorizeArticle(tenantId, id).catch((error) => {
          this.logger.warn(`Re-categorization after summarize failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        });
      }
      return this.findArticle(tenantId, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته GapGPT';
      await this.prisma.newsArticle.updateMany({ where: { id, tenantId, status: 'processing' }, data: { status: 'failed', processingStartedAt: null, lastError: message.slice(0, 1000) } });
      await this.integrationHealth.failure({ tenantId, key: 'gapgpt', type: 'ai', name: 'GapGPT', latencyMs: Date.now() - startedAt, metadata: { operation: 'news-summary' }, error }).catch((healthError) => this.logger.warn(`GapGPT failure health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
      await this.recordWorkflow({ tenantId, id, fromStatus: 'processing', toStatus: 'failed', action: 'preparation-failed', title: `آماده‌سازی خبر «${article.titleFa || article.originalTitle}» ناموفق بود`, metadata: { error: message.slice(0, 1000) } });
      throw new BadRequestException(`آماده‌سازی خبر انجام نشد: ${message}`);
    }
  }

  async reject(tenantId: string, id: string, access?: MemberNewsroomAccess) {
    const article = await this.findArticle(tenantId, id);
    assertNewsroomArticleAccess(article, access);
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

  async restoreRejected(tenantId: string, id: string, access?: MemberNewsroomAccess) {
    const article = await this.findArticle(tenantId, id);
    assertNewsroomArticleAccess(article, access);
    if (article.status !== 'rejected') throw new BadRequestException('فقط خبر ردشده قابل بازگردانی به میز خبر است');
    const nextStatus = article.titleFa?.trim() && article.summaryFa?.trim() ? 'ready' : 'new';
    const updated = await this.prisma.newsArticle.update({
      where: { id },
      data: {
        status: nextStatus,
        rejectedAt: null,
        purgeAfter: null,
        processingStartedAt: null,
        lastError: '',
      },
    });
    await this.recordWorkflow({
      tenantId,
      id,
      fromStatus: 'rejected',
      toStatus: nextStatus,
      action: 'restored-from-rejected',
      title: `خبر «${updated.titleFa || updated.originalTitle}» به میز خبر بازگردانده شد`,
    });
    return updated;
  }

  async translateFull(tenantId: string, id: string, access?: MemberNewsroomAccess) {
    const article = await this.findArticle(tenantId, id);
    assertNewsroomArticleAccess(article, access);
    if (!['ready', 'publish_failed'].includes(article.status)) {
      throw new BadRequestException('ترجمه کامل در وضعیت فعلی مجاز نیست');
    }
    const deferred = await this.deferHeavyWork(tenantId, 'news.translate', { articleId: id }, `news:${id}:translate`);
    if (deferred) {
      const claimed = await this.prisma.newsArticle.updateMany({
        where: { id, tenantId, status: { in: ['ready', 'publish_failed'] } },
        data: { status: 'processing', processingStartedAt: new Date(), lastError: '' },
      });
      if (claimed.count) {
        await this.recordWorkflow({
          tenantId,
          id,
          fromStatus: article.status,
          toStatus: 'processing',
          action: 'full-text-translation-queued',
          title: `استخراج و ترجمه متن کامل «${article.titleFa || article.originalTitle}» به صف پردازش رفت`,
        });
      }
      return deferred;
    }
    const claimed = await this.prisma.newsArticle.updateMany({
      where: { id, tenantId, status: { in: ['ready', 'publish_failed'] } },
      data: { status: 'processing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new ConflictException('این خبر هم‌اکنون در حال پردازش است');
    await this.recordWorkflow({
      tenantId,
      id,
      fromStatus: article.status,
      toStatus: 'processing',
      action: 'full-text-translation-started',
      title: `استخراج و ترجمه متن کامل «${article.titleFa || article.originalTitle}» آغاز شد`,
    });
    const startedAt = Date.now();
    try {
      const settings = await this.settings.getRaw(tenantId);
      const { originalContent, contentFa, featuredImageUrl, originalContentIsFull } = await this.extractAndTranslateFullText(tenantId, article, settings);
      const updated = await this.prisma.newsArticle.update({
        where: { id },
        data: {
          originalContent,
          originalContentIsFull,
          contentFa,
          featuredImageUrl,
          status: 'ready',
          processingStartedAt: null,
          lastError: '',
        },
      });
      await this.integrationHealth.success({
        tenantId,
        key: 'gapgpt',
        type: 'ai',
        name: 'GapGPT',
        latencyMs: Date.now() - startedAt,
        metadata: { operation: 'news-full-text' },
      }).catch((healthError) => this.logger.warn(`GapGPT health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
      await this.recordWorkflow({
        tenantId,
        id,
        fromStatus: 'processing',
        toStatus: 'ready',
        action: 'full-text-translated',
        title: `متن کامل «${updated.titleFa || updated.originalTitle}» آماده انتشار شد`,
      });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته ترجمه';
      await this.prisma.newsArticle.updateMany({
        where: { id, tenantId, status: 'processing' },
        data: { status: 'publish_failed', processingStartedAt: null, lastError: message.slice(0, 1000) },
      });
      await this.integrationHealth.failure({
        tenantId,
        key: 'gapgpt',
        type: 'ai',
        name: 'GapGPT',
        latencyMs: Date.now() - startedAt,
        metadata: { operation: 'news-full-text' },
        error,
      }).catch((healthError) => this.logger.warn(`GapGPT failure health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
      await this.recordWorkflow({
        tenantId,
        id,
        fromStatus: 'processing',
        toStatus: 'publish_failed',
        action: 'full-text-translation-failed',
        title: `ترجمه کامل «${article.titleFa || article.originalTitle}» ناموفق بود`,
        metadata: { error: message.slice(0, 1000) },
      });
      throw new BadRequestException(`ترجمه کامل انجام نشد: ${message}`);
    }
  }

  async publish(tenantId: string, id: string, input: PublishNewsArticleDto = {}, access?: MemberNewsroomAccess) {
    const article = await this.findArticle(tenantId, id);
    assertNewsroomArticleAccess(article, access);
    if (article.status === 'published' && article.wordpressPostUrl) return article;
    if (!['ready', 'publish_failed'].includes(article.status)) throw new BadRequestException('ابتدا خبر را آماده کنید و متن کامل را ترجمه کنید');

    const titleFa = (input.titleFa ?? article.titleFa).trim();
    const summaryFa = (input.summaryFa ?? article.summaryFa).trim();
    const rawBody = (input.contentHtml ?? input.contentFa ?? article.contentFa).trim();
    if (!rawBody) throw new BadRequestException('ابتدا «ترجمه کامل» را انجام دهید و متن را بررسی کنید');
    if (!titleFa || !summaryFa) throw new BadRequestException('تیتر و لید/خلاصه برای انتشار الزامی است');
    const contentFa = rawBody;
    const featuredImageUrl = input.featuredImageUrl !== undefined
      ? (input.featuredImageUrl || '').trim()
      : article.featuredImageUrl;
    if (this.defersHeavyWork()) {
      await this.prisma.newsArticle.update({
        where: { id },
        data: { titleFa, summaryFa, contentFa, featuredImageUrl },
      });
      return this.deferHeavyWork(tenantId, 'news.publish', { articleId: id }, `news:${id}:publish`);
    }

    const claimed = await this.prisma.newsArticle.updateMany({
      where: { id, tenantId, status: { in: ['ready', 'publish_failed'] } },
      data: { status: 'publishing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new ConflictException('انتشار این خبر هم‌اکنون در حال انجام است');
    await this.recordWorkflow({ tenantId, id, fromStatus: article.status, toStatus: 'publishing', action: 'publishing-started', title: `انتشار خبر «${titleFa || article.originalTitle}» آغاز شد` });

    try {
      const settings = await this.settings.getRaw(tenantId);
      this.wordpress.validateSettings(settings);
      const cachedCategories = parseWordPressCategories(settings.wp_categories);
      const categories = await this.wordpress.categories(settings).catch((error) => {
        this.logger.warn(`Refreshing WordPress categories failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        return cachedCategories;
      });

      await this.prisma.newsArticle.update({
        where: { id },
        data: { titleFa, summaryFa, contentFa, featuredImageUrl },
      });

      let categoryId = Number(settings.wp_category_id || 0);
      if (categories.length) {
        if (!categories.some((category) => category.id === categoryId)) categoryId = 0;
        try {
          categoryId = await this.gapGpt.chooseWordPressCategory(settings, {
            sourceName: article.sourceName,
            title: titleFa,
            summary: summaryFa,
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
          title: titleFa,
          excerpt: summaryFa,
          content: resolvePublishHtml(contentFa, article.sourceName, article.originalUrl || article.canonicalUrl, article.id),
          featuredImageUrl,
          categoryId: Number.isSafeInteger(categoryId) && categoryId > 0 ? categoryId : null,
        });
        await this.integrationHealth.success({ tenantId, key: 'destination', type: 'publishing', name: 'سایت مقصد', latencyMs: Date.now() - wordpressStartedAt, metadata: { operation: 'publish' } }).catch((healthError) => this.logger.warn(`Destination health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
      } catch (error) {
        await this.integrationHealth.failure({ tenantId, key: 'destination', type: 'publishing', name: 'سایت مقصد', latencyMs: Date.now() - wordpressStartedAt, metadata: { operation: 'publish' }, error }).catch((healthError) => this.logger.warn(`Destination failure health could not be recorded: ${healthError instanceof Error ? healthError.message : 'unknown error'}`));
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
      await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.NEWS_PUBLISHED, 1);
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته انتشار';
      await this.prisma.newsArticle.updateMany({ where: { id, tenantId, status: 'publishing' }, data: { status: 'publish_failed', processingStartedAt: null, lastError: message.slice(0, 1000) } });
      await this.recordWorkflow({ tenantId, id, fromStatus: 'publishing', toStatus: 'publish_failed', action: 'publishing-failed', title: `انتشار خبر «${titleFa || article.originalTitle}» ناموفق بود`, metadata: { error: message.slice(0, 1000) } });
      throw new BadRequestException(`انتشار خبر انجام نشد: ${message}`);
    }
  }

  private async extractAndTranslateFullText(
    tenantId: string,
    article: Awaited<ReturnType<NewsroomService['findArticle']>>,
    settings: PublishingSettings,
  ) {
    const source = await this.sourceReader.readArticleOrFallback(article.originalUrl || article.canonicalUrl, {
      text: article.originalContent || article.originalSummary || article.originalTitle,
      title: article.originalTitle,
      canonicalUrl: article.canonicalUrl,
      featuredImageUrl: article.featuredImageUrl,
      author: article.sourceName,
      fullTextAvailable: article.originalContentIsFull
        || looksLikeFullStoredFeedContent(article.originalContent, article.originalSummary),
    });
    const originalContent = cleanExtractedArticleText(source.text);
    const featuredImageUrl = source.featuredImageUrl || article.featuredImageUrl;
    if (!originalContent.trim()) throw new Error('متن کامل خبر از منبع دریافت نشد');
    if (source.contentSource === 'feed' && source.isFullText === false) {
      throw new Error(`فید «${article.sourceName || 'منبع'}» فقط چکیده خبر را ارائه می‌کند و صفحه خبر نیز متن کامل را به درخواست سرور تحویل نداد. برای جلوگیری از تولید خبر ناقص، انتشار متوقف شد؛ فید تمام‌متن، API رسمی یا دسترسی مجاز منبع لازم است`);
    }

    const sourceLanguage = await this.resolveSourceLanguage(article);
    const fullTextIsPersian = shouldUsePersianRewrite(sourceLanguage, `${article.originalTitle}\n${originalContent}`);
    const chunks = splitText(originalContent);
    const translated: string[] = [];
    for (let index = 0; index < chunks.length; index++) {
      translated.push(await this.gapGpt.translateFullText(settings, {
        sourceName: article.sourceName,
        title: article.originalTitle,
        text: chunks[index],
        part: index + 1,
        totalParts: chunks.length,
        sourceLanguage,
      }));
      await this.usageTracking.record(
        tenantId,
        fullTextIsPersian ? USAGE_METRIC_KEYS.NEWS_REWRITTEN : USAGE_METRIC_KEYS.NEWS_TRANSLATED,
        1,
      );
    }

    return {
      originalContent,
      originalContentIsFull: source.isFullText,
      contentFa: cleanExtractedArticleText(translated.join('\n\n')),
      featuredImageUrl,
    };
  }

  async purgeRejected(tenantId?: string) {
    return this.prisma.newsArticle.deleteMany({ where: { ...(tenantId ? { tenantId } : {}), status: 'rejected', purgeAfter: { lte: new Date() } } });
  }

  @Interval('smart-publishing-newsroom-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    await this.scheduler.runIntervalMaintenance('smart-publishing-newsroom-maintenance', async () => {
    this.maintenanceRunning = true;
    try {
      const activeTenants = await this.prisma.tenant.findMany({
        where: { isActive: true, status: 'active' },
        select: { id: true },
      });
      const enabledTenantIds = activeTenants.map((row) => row.id);
      if (!enabledTenantIds.length) return;

      const staleBefore = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
      await this.prisma.newsArticle.updateMany({ where: { tenantId: { in: enabledTenantIds }, status: 'processing', processingStartedAt: { lte: staleBefore } }, data: { status: 'new', processingStartedAt: null } });
      await this.prisma.newsArticle.updateMany({ where: { tenantId: { in: enabledTenantIds }, status: 'publishing', processingStartedAt: { lte: staleBefore } }, data: { status: 'publish_failed', processingStartedAt: null, lastError: 'عملیات انتشار قبلی ناتمام مانده بود؛ دوباره تلاش کنید' } });
      await this.prisma.newsArticle.updateMany({ where: { tenantId: { in: enabledTenantIds }, status: 'social_processing', processingStartedAt: { lte: staleBefore } }, data: { status: 'social_failed', processingStartedAt: null, lastError: 'ارسال قبلی به استودیوی اجتماعی ناتمام ماند؛ دوباره تلاش کنید' } });
      await this.prisma.newsArticle.deleteMany({ where: { tenantId: { in: enabledTenantIds }, status: 'rejected', purgeAfter: { lte: new Date() } } });
      await this.prisma.newsArticle.deleteMany({ where: { tenantId: { in: enabledTenantIds }, ...orphanedNewsArticleWhere() } });

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
    }).catch(() => undefined);
  }

  async queueAutomation(tenantId: string, limit = 25, providedSettings?: PublishingSettings) {
    const settings = providedSettings || await this.settings.getRaw(tenantId);
    const prepared = settingEnabled(settings.news_auto_prepare, true)
      ? await this.enqueuePending(tenantId, limit, true)
      : 0;
    const routeToSocial = settingEnabled(settings.news_auto_send_social);
    const sentToSocial = await this.enqueueReady(tenantId, 'news.send-social', limit, 'autoSendSocial');
    const published = routeToSocial
      ? 0
      : await this.enqueueReady(tenantId, 'news.publish', limit, 'autoPublish');
    return { prepared, sentToSocial, published };
  }

  private async enqueuePending(tenantId: string, limit: number, requireSourceAutomation = false) {
    const settings = await this.settings.getRaw(tenantId);
    const fallback = settingEnabled(settings.news_auto_prepare, true);
    const rows = await this.prisma.newsArticle.findMany({
      where: {
        tenantId,
        status: 'new',
        OR: [
          { feed: { purpose: 'news-room' } },
          { platformFeedArticleId: { not: null } },
        ],
      },
      orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(limit * 4, 100),
      select: {
        id: true,
        feed: { select: { autoPrepare: true } },
        platformFeedArticle: {
          select: {
            platformFeed: {
              select: {
                subscriptions: {
                  where: { tenantId },
                  select: { autoPrepare: true, enabled: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    let queued = 0;
    for (const row of rows.filter((item) => {
      if (!requireSourceAutomation) return true;
      const subscription = item.platformFeedArticle?.platformFeed.subscriptions[0];
      if (subscription) {
        if (!subscription.enabled) return false;
        return sourceBoolean(subscription.autoPrepare, fallback);
      }
      return sourceBoolean(item.feed?.autoPrepare, fallback);
    }).slice(0, limit)) {
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
      where: {
        tenantId,
        status: 'ready',
        OR: [
          { feed: { purpose: 'news-room' } },
          { platformFeedArticleId: { not: null } },
        ],
      },
      orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(limit * 4, 100),
      select: {
        id: true,
        feed: { select: { autoPublish: true, autoSendSocial: true } },
        platformFeedArticle: {
          select: {
            platformFeed: {
              select: {
                subscriptions: {
                  where: { tenantId },
                  select: { autoPublish: true, autoSendSocial: true, enabled: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    let queued = 0;
    for (const row of rows.filter((item) => {
      const subscription = item.platformFeedArticle?.platformFeed.subscriptions[0];
      if (subscription) {
        if (!subscription.enabled) return false;
        return sourceBoolean(subscription[sourceSetting], fallback);
      }
      return sourceBoolean(item.feed?.[sourceSetting], fallback);
    }).slice(0, limit)) {
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

  private async resolveSourceLanguage(article: { feedId?: string | null; platformFeedArticleId?: string | null }) {
    if (article.feedId) {
      const feed = await this.prisma.newsFeed.findUnique({ where: { id: article.feedId }, select: { sourceLanguage: true } });
      return feed?.sourceLanguage || 'auto';
    }
    if (article.platformFeedArticleId) {
      const shared = await this.prisma.platformFeedArticle.findUnique({
        where: { id: article.platformFeedArticleId },
        select: { platformFeed: { select: { sourceLanguage: true } } },
      });
      return shared?.platformFeed.sourceLanguage || 'auto';
    }
    return 'auto';
  }

  private defersHeavyWork(): boolean {
    const check = this.scheduler.runsHeavyWorkInline;
    return typeof check === 'function' && check.call(this.scheduler) === false;
  }

  private async deferHeavyWork(
    tenantId: string,
    type: 'news.feed.fetch' | 'news.prepare' | 'news.translate' | 'news.publish',
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
    return { queued: true as const, created: 0, jobId: queued.job.id };
  }

  private async findFeed(tenantId: string, id: string) {
    const feed = await this.prisma.newsFeed.findFirst({ where: { id, tenantId } });
    if (!feed) throw new NotFoundException('فید یافت نشد');
    return feed;
  }

  private async findArticle(tenantId: string, id: string) {
    const article = await this.prisma.newsArticle.findFirst({
      where: { id, tenantId },
      include: {
        destinationCategory: { select: { isGeneral: true } },
      },
    });
    if (!article) throw new NotFoundException('خبر یافت نشد');
    return article;
  }
}
