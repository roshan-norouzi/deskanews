import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { DistributedLockService, SCHEDULER_LOCK_IDS } from '../../common/services/distributed-lock.service';
import { PublishingSettingsService } from './publishing-settings.service';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { settingEnabled, sourceBoolean, sourceInterval } from './publishing-settings.helpers';

const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable()
export class NewsroomAutomationService {
  private readonly logger = new Logger(NewsroomAutomationService.name);
  private maintenanceRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly jobs: AutomationJobService,
    private readonly locks: DistributedLockService,
  ) {}

  @Interval('smart-publishing-newsroom-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      await this.locks.runExclusive(SCHEDULER_LOCK_IDS.newsroomMaintenance, async () => {
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

        const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId: { in: enabledTenantIds }, purpose: 'news-room', enabled: true }, orderBy: { lastFetchedAt: 'asc' } });
        for (const feed of feeds) {
          const feedSettings = await this.settings.getRaw(feed.tenantId);
          const intervalMs = sourceInterval(feed.pollIntervalMinutes, Number(feedSettings.news_poll_interval_minutes || 240)) * 60_000;
          if (sourceBoolean(feed.autoPoll, settingEnabled(feedSettings.news_auto_poll, true)) && (!feed.lastFetchedAt || Date.now() - feed.lastFetchedAt.getTime() >= intervalMs)) {
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
      });
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

  async purgeRejected(tenantId?: string) {
    return this.prisma.newsArticle.deleteMany({
      where: { ...(tenantId ? { tenantId } : {}), status: 'rejected', purgeAfter: { lte: new Date() } },
    });
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
      select: { id: true, platformFeedArticleId: true, feed: { select: { autoPrepare: true } } },
    });
    let queued = 0;
    for (const row of rows.filter((item) => !requireSourceAutomation || item.platformFeedArticleId || sourceBoolean(item.feed?.autoPrepare, fallback)).slice(0, limit)) {
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
}
