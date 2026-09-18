import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { DistributedLockService, SCHEDULER_LOCK_IDS } from '../../common/services/distributed-lock.service';
import { PublishingSettingsService } from './publishing-settings.service';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { automaticCoverTemplateId, settingEnabled, sourceBoolean, sourceInterval } from './publishing-settings.helpers';
import type { SocialNetwork } from './social-network-publisher.service';

const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable()
export class SocialAutomationService {
  private readonly logger = new Logger(SocialAutomationService.name);
  private maintenanceRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly jobs: AutomationJobService,
    private readonly locks: DistributedLockService,
  ) {}

  @Interval('smart-publishing-social-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      await this.locks.runExclusive(SCHEDULER_LOCK_IDS.socialMaintenance, async () => {
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
          const feedSettings = await this.settings.getRaw(feed.tenantId);
          const intervalMs = sourceInterval(feed.pollIntervalMinutes, Number(feedSettings.social_poll_interval_minutes || 240)) * 60_000;
          if (sourceBoolean(feed.autoPoll, settingEnabled(feedSettings.social_auto_poll, true)) && (!feed.lastFetchedAt || Date.now() - feed.lastFetchedAt.getTime() >= intervalMs)) {
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
      });
    } catch (error) {
      this.logger.error(`Social studio maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintenanceRunning = false;
    }
  }

  autoPublishNetworks(settings: PublishingSettings): SocialNetwork[] {
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
