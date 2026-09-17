import { Injectable } from '@nestjs/common';
import { AutomationJobService } from '../../common/services/automation-job.service';
import { unifiedContentStage } from '../../common/services/content-workflow.service';
import { NotificationService } from '../../common/services/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

function countsByStatus(rows: Array<{ status: string; _count: { _all: number } }>) {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: AutomationJobService,
    private readonly notifications: NotificationService,
  ) {}

  async getStats(tenantId: string, userId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const [
      memberCount,
      newsroomGroups,
      socialGroups,
      publishedToday,
      socialPublishedToday,
      queue,
      unhealthyIntegrations,
      notificationSummary,
      recentActivity,
      newsItems,
      socialItems,
      deadJobs,
    ] = await Promise.all([
      this.prisma.tenantMember.count({ where: { tenantId, status: 'active' } }),
      this.prisma.newsArticle.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
      this.prisma.socialArticle.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
      this.prisma.newsArticle.count({ where: { tenantId, publishedAt: { gte: startOfDay } } }),
      this.prisma.socialArticle.count({
        where: { tenantId, OR: [
          { telegramSentAt: { gte: startOfDay } }, { instagramSentAt: { gte: startOfDay } },
          { linkedinSentAt: { gte: startOfDay } }, { facebookSentAt: { gte: startOfDay } },
        ] },
      }),
      this.jobs.stats(tenantId),
      this.prisma.integrationHealth.count({ where: { tenantId, status: { in: ['degraded', 'down'] } } }),
      this.notifications.summary(tenantId, userId),
      this.prisma.activity.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.newsArticle.findMany({
        where: { tenantId, status: { in: ['new', 'ready', 'failed', 'publish_failed', 'social_failed'] }, feed: { purpose: 'news-room' } },
        orderBy: { updatedAt: 'desc' }, take: 8,
        select: { id: true, originalTitle: true, titleFa: true, status: true, lastError: true, updatedAt: true, sourceName: true },
      }),
      this.prisma.socialArticle.findMany({
        where: { tenantId, status: { in: ['pending', 'ready', 'failed'] } },
        orderBy: { updatedAt: 'desc' }, take: 8,
        select: { id: true, title: true, status: true, lastError: true, updatedAt: true, author: true },
      }),
      this.prisma.automationJob.findMany({
        where: { tenantId, status: 'dead' }, orderBy: { updatedAt: 'desc' }, take: 5,
        select: { id: true, type: true, status: true, lastError: true, updatedAt: true, attempts: true },
      }),
    ]);

    const newsroom = countsByStatus(newsroomGroups);
    const social = countsByStatus(socialGroups);
    const workItems = [
      ...newsItems.map((item) => ({
        id: item.id, kind: 'news' as const, title: item.titleFa || item.originalTitle,
        subtitle: item.sourceName, status: item.status, stage: unifiedContentStage('news-article', item.status),
        error: item.lastError, updatedAt: item.updatedAt, href: '/publishing/news',
      })),
      ...socialItems.map((item) => ({
        id: item.id, kind: 'social' as const, title: item.title, subtitle: item.author || '',
        status: item.status, stage: unifiedContentStage('social-article', item.status),
        error: item.lastError, updatedAt: item.updatedAt, href: '/publishing/social',
      })),
      ...deadJobs.map((item) => ({
        id: item.id, kind: 'automation' as const, title: `فرایند متوقف‌شده: ${item.type}`,
        subtitle: `${item.attempts} تلاش`, status: item.status, stage: 'failed' as const,
        error: item.lastError, updatedAt: item.updatedAt, href: '/publishing/operations',
      })),
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 15);

    return {
      members: { active: memberCount },
      publishing: {
        newsroom: {
          inbox: newsroom.new ?? 0,
          preparing: (newsroom.processing ?? 0) + (newsroom.social_processing ?? 0),
          ready: newsroom.ready ?? 0,
          failed: (newsroom.failed ?? 0) + (newsroom.publish_failed ?? 0) + (newsroom.social_failed ?? 0),
          publishedToday,
        },
        social: {
          inbox: social.pending ?? 0,
          preparing: social.processing ?? 0,
          ready: social.ready ?? 0,
          failed: social.failed ?? 0,
          publishedToday: socialPublishedToday,
        },
        queue,
        unhealthyIntegrations,
      },
      notifications: { unread: notificationSummary.unreadCount },
      workItems,
      recentActivity,
      generatedAt: now.toISOString(),
    };
  }
}
