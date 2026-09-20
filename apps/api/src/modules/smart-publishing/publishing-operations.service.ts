import { Injectable } from '@nestjs/common';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { IntegrationHealthService } from '../../common/services/integration-health.service';
import { ContentWorkflowService, unifiedContentStage } from '../../common/services/content-workflow.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishingSettingsService } from './publishing-settings.service';

@Injectable()
export class PublishingOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: AutomationJobService,
    private readonly integrations: IntegrationHealthService,
    private readonly workflow: ContentWorkflowService,
    private readonly settings: PublishingSettingsService,
  ) {}

  async overview(tenantId: string) {
    const [queue, records, feeds, recentJobs, workflow, activity, audit, rawSettings] = await Promise.all([
      this.jobs.stats(tenantId),
      this.integrations.list(tenantId),
      this.prisma.newsFeed.findMany({
        where: { tenantId },
        orderBy: [{ purpose: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, purpose: true, url: true, enabled: true, lastFetchedAt: true, lastError: true },
      }),
      this.prisma.automationJob.findMany({
        where: { tenantId, status: { in: ['running', 'dead'] } },
        orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      this.workflow.list(tenantId, 30),
      this.prisma.activity.findMany({
        where: {
          tenantId,
          OR: [
            { entityType: { in: ['news-article', 'social-article'] } },
            { type: { startsWith: 'content.' } },
            { type: { startsWith: 'http.' }, entityType: { startsWith: 'publishing' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId, entityType: { startsWith: 'publishing' } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true, action: true, entityType: true, entityId: true, changes: true, createdAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      this.settings.getRaw(tenantId),
    ]);

    const known = new Map(records.map((item) => [item.key, item]));
    const configured = [
      { key: 'gapgpt', type: 'ai', name: 'GapGPT', configured: Boolean(rawSettings.gapgpt_base_url && rawSettings.gapgpt_api_key) },
      { key: 'wordpress', type: 'publishing', name: 'WordPress', configured: Boolean(rawSettings.wp_site_url && rawSettings.wp_username && rawSettings.wp_app_password) },
      { key: 'social:telegram', type: 'social', name: 'تلگرام', configured: Boolean(rawSettings.telegram_bot_token && rawSettings.telegram_chat_id) },
      { key: 'social:instagram', type: 'social', name: 'اینستاگرام', configured: Boolean(rawSettings.social_instagram_access_token && rawSettings.social_instagram_account_id) },
      { key: 'social:linkedin', type: 'social', name: 'لینکدین', configured: Boolean(rawSettings.social_linkedin_access_token && rawSettings.social_linkedin_author_urn) },
      { key: 'social:facebook', type: 'social', name: 'فیسبوک', configured: Boolean(rawSettings.social_facebook_page_access_token && rawSettings.social_facebook_page_id) },
    ].map((item) => known.get(item.key) ?? {
      id: item.key,
      tenantId,
      ...item,
      status: item.configured ? 'unknown' : 'unconfigured',
      consecutiveFailures: 0,
      latencyMs: null,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: '',
      metadata: {},
      createdAt: null,
      updatedAt: null,
    });

    const feedHealth = feeds.map((feed) => ({
      id: `feed:${feed.id}`,
      tenantId,
      key: `feed:${feed.id}`,
      type: 'feed',
      name: feed.name,
      configured: feed.enabled,
      status: !feed.enabled ? 'disabled' : feed.lastFetchedAt ? 'healthy' : 'unknown',
      consecutiveFailures: 0,
      latencyMs: null,
      lastCheckedAt: feed.lastFetchedAt,
      lastSuccessAt: feed.lastFetchedAt,
      lastFailureAt: null,
      lastError: '',
      metadata: { purpose: feed.purpose, url: feed.url },
      createdAt: null,
      updatedAt: feed.lastFetchedAt,
    }));

    return {
      queue,
      integrations: [...configured, ...feedHealth],
      recentJobs,
      workflow,
      activity,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  listJobs(tenantId: string, status?: string) {
    return this.jobs.list(tenantId, status);
  }

  retryJob(tenantId: string, id: string) {
    return this.jobs.retry(tenantId, id);
  }

  retryAllFailedJobs(tenantId: string) {
    return this.jobs.retryAllDead(tenantId);
  }

  cancelJob(tenantId: string, id: string) {
    return this.jobs.cancel(tenantId, id);
  }

  workflowHistory(tenantId: string) {
    return this.workflow.list(tenantId);
  }

  static stage(entityType: string, status: string) {
    return unifiedContentStage(entityType, status);
  }
}
