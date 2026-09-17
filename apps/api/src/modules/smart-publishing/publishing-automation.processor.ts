import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { AutomationJob } from '@prisma/client';
import { hostname } from 'node:os';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { IntegrationHealthService } from '../../common/services/integration-health.service';
import { NotificationService } from '../../common/services/audit.service';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SocialCoverRendererService } from './social-cover-renderer.service';
import { SocialNetworkPublisherService, type SocialNetwork } from './social-network-publisher.service';
import { SocialStudioService } from './social-studio.service';
function payloadRecord(job: AutomationJob): Record<string, unknown> {
  return job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
    ? job.payload as Record<string, unknown>
    : {};
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = typeof payload[key] === 'string' ? payload[key].trim() : '';
  if (!value) throw new Error(`داده لازم برای کار خودکار موجود نیست: ${key}`);
  return value;
}

@Injectable()
export class PublishingAutomationProcessor {
  private readonly logger = new Logger(PublishingAutomationProcessor.name);
  private readonly workerId = `${hostname()}:${process.pid}`;
  private processing = false;
  private maintaining = false;

  constructor(
    private readonly jobs: AutomationJobService,
    private readonly newsroom: NewsroomService,
    private readonly socialStudio: SocialStudioService,
    private readonly settings: PublishingSettingsService,
    private readonly covers: SocialCoverRendererService,
    private readonly socialPublisher: SocialNetworkPublisherService,
    private readonly integrations: IntegrationHealthService,
    private readonly notifications: NotificationService,
  ) {}

  @Interval('publishing-durable-job-worker', 2_000)
  async processDueJobs() {
    if (this.processing) return;
    this.processing = true;
    try {
      const jobs = await this.jobs.claim(this.workerId, 4);
      // Two concurrent jobs materially reduce AI queue latency while keeping
      // outbound API and browser-rendering pressure bounded.
      for (let index = 0; index < jobs.length; index += 2) {
        await Promise.all(jobs.slice(index, index + 2).map((job) => this.processOne(job).catch((error) => {
          // One malformed job must not strand the rest of the claimed batch.
          this.logger.error(`Unexpected worker failure for ${job.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
        })));
      }
      if (jobs.length) {
        for (const tenantId of new Set(jobs.map((job) => job.tenantId))) {
          await this.integrations.success({
            tenantId,
            key: 'automation-worker',
            type: 'automation',
            name: 'موتور اتوماسیون',
            metadata: { workerId: this.workerId, processed: jobs.length },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Automation worker failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.processing = false;
    }
  }

  @Interval('publishing-durable-job-maintenance', 60_000)
  async maintenance() {
    if (this.maintaining) return;
    this.maintaining = true;
    try {
      await this.jobs.recoverStale();
      if (new Date().getMinutes() === 0) await this.jobs.prune(14);
    } catch (error) {
      this.logger.error(`Automation queue maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintaining = false;
    }
  }

  private async processOne(job: AutomationJob) {
    try {
      const result = await this.handle(job);
      const completed = await this.jobs.complete(job, result);
      if (!completed) {
        this.logger.warn(`Job ${job.id} finished after its worker lease was lost; its newer claim was left untouched.`);
        return;
      }
    } catch (error) {
      const status = await this.jobs.fail(job, error);
      const message = error instanceof Error ? error.message : String(error || 'خطای ناشناخته');
      this.logger.warn(`Job ${job.id} (${job.type}) ${status}: ${message}`);
      if (status === 'lost') return;
      if (status === 'dead') {
        if (job.type === 'social.cover') {
          const payload = payloadRecord(job);
          const articleId = typeof payload.articleId === 'string' ? payload.articleId.trim() : '';
          if (articleId) {
            await this.socialStudio.queueFeaturedImageFallback(job.tenantId, articleId).catch((fallbackError) => {
              this.logger.warn(`Featured-image fallback scheduling failed for ${job.id}: ${fallbackError instanceof Error ? fallbackError.message : 'unknown error'}`);
            });
          }
        }
        await this.notifications.notifyManagers({
          tenantId: job.tenantId,
          title: 'یک فرایند خودکار متوقف شد',
          message: `${this.jobLabel(job.type)} پس از ${job.attempts} تلاش متوقف شد: ${message}`,
          type: 'error',
          link: '/publishing/operations',
          dedupeKey: `automation-job-dead:${job.id}`,
        }).catch((notificationError) => this.logger.warn(`Dead-job notification failed for ${job.id}: ${notificationError instanceof Error ? notificationError.message : 'unknown error'}`));
      }
      return;
    }

    // Scheduling the next stage is recoverable by the minute maintenance scan.
    // It must not turn an already-completed job into a false failure.
    try {
      if (['news.feed.fetch', 'news.prepare'].includes(job.type)) {
        await this.newsroom.queueAutomation(job.tenantId, 25);
      }
      if (['news.send-social', 'social.feed.fetch', 'social.prepare', 'social.cover'].includes(job.type)) {
        await this.socialStudio.queueAutomation(job.tenantId, 25);
      }
    } catch (error) {
      this.logger.warn(`Next-stage scheduling failed after ${job.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private async handle(job: AutomationJob): Promise<unknown> {
    const payload = payloadRecord(job);
    switch (job.type) {
      case 'news.feed.fetch':
        return this.newsroom.fetchFeed(job.tenantId, requiredString(payload, 'feedId'));
      case 'news.prepare':
        return this.newsroom.summarize(job.tenantId, requiredString(payload, 'articleId'));
      case 'news.publish':
        return this.newsroom.publish(job.tenantId, requiredString(payload, 'articleId'));
      case 'news.send-social':
        return this.socialStudio.sendNewsToStudio(job.tenantId, requiredString(payload, 'articleId'));
      case 'social.feed.fetch':
        return this.socialStudio.fetchFeed(job.tenantId, requiredString(payload, 'feedId'));
      case 'social.prepare':
        return this.socialStudio.prepare(job.tenantId, requiredString(payload, 'articleId'));
      case 'social.cover': {
        const settings = await this.settings.getRaw(job.tenantId);
        return this.covers.generate(job.tenantId, requiredString(payload, 'articleId'), settings, requiredString(payload, 'templateId'));
      }
      case 'social.publish': {
        const networks = Array.isArray(payload.networks)
          ? payload.networks.filter((item): item is SocialNetwork => ['telegram', 'instagram', 'linkedin', 'facebook'].includes(String(item)))
          : [];
        if (!networks.length) throw new Error('هیچ شبکه اجتماعی معتبری برای انتشار انتخاب نشده است');
        const result = await this.socialPublisher.publishAutomatically(
          job.tenantId,
          requiredString(payload, 'articleId'),
          networks,
          payload.imageFallback === 'featured',
        );
        if (result.failed.length) throw new Error(result.failed.map((item) => `${item.network}: ${item.error}`).join('؛ '));
        return result;
      }
      default:
        throw new Error(`نوع کار خودکار پشتیبانی نمی‌شود: ${job.type}`);
    }
  }

  private jobLabel(type: string): string {
    const labels: Record<string, string> = {
      'news.feed.fetch': 'دریافت فید خبری',
      'news.prepare': 'آماده‌سازی خبر',
      'news.publish': 'انتشار خبر در سایت',
      'news.send-social': 'ارسال خبر به استودیوی اجتماعی',
      'social.feed.fetch': 'دریافت فید اجتماعی',
      'social.prepare': 'آماده‌سازی مطلب اجتماعی',
      'social.cover': 'تولید قالب تصویری',
      'social.publish': 'انتشار در شبکه اجتماعی',
    };
    return labels[type] || type;
  }
}
