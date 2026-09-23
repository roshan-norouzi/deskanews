import type { Prisma } from '@prisma/client';

export type NewsroomArticleSnapshot = {
  status: string;
  titleFa: string;
  summaryFa: string;
  publishedAt: Date | null;
};

export type NewsroomDashboardStats = {
  action: number;
  processing: number;
  archive: number;
  rejected: number;
  preparing: number;
  failed: number;
  publishedToday: number;
  total: number;
};

export function newsroomArticleWhere(tenantId: string): Prisma.NewsArticleWhereInput {
  return {
    tenantId,
    OR: [
      { feed: { purpose: 'news-room' } },
      { platformFeedArticleId: { not: null } },
    ],
  };
}

export function orphanedNewsArticleWhere(tenantId?: string): Prisma.NewsArticleWhereInput {
  return {
    ...(tenantId ? { tenantId } : {}),
    feedId: null,
    platformFeedArticleId: null,
  };
}

function isNewsSummaryPrepared(article: Pick<NewsroomArticleSnapshot, 'titleFa' | 'summaryFa'>) {
  return Boolean(article.titleFa?.trim() && article.summaryFa?.trim());
}

export function isNewsReadyForAction(article: Pick<NewsroomArticleSnapshot, 'status' | 'titleFa' | 'summaryFa'>) {
  if (['rejected', 'published', 'social_sent', 'new', 'processing', 'failed'].includes(article.status)) {
    return false;
  }
  if (article.status === 'ready' && !isNewsSummaryPrepared(article)) return false;
  return true;
}

export function isNewsInProcessing(article: Pick<NewsroomArticleSnapshot, 'status' | 'titleFa' | 'summaryFa'>) {
  return ['new', 'processing', 'failed'].includes(article.status)
    || (article.status === 'ready' && !isNewsSummaryPrepared(article));
}

export function isNewsArchived(article: Pick<NewsroomArticleSnapshot, 'status'>) {
  return ['published', 'social_sent'].includes(article.status);
}

export type NewsroomStatusCounts = {
  total: number;
  rejected: number;
  archive: number;
  preparing: number;
  statusFailed: number;
  terminalFailed: number;
  readyPrepared: number;
  readyUnprepared: number;
  inbox: number;
  publishedToday: number;
};

export function newsroomStatsFromCounts(counts: NewsroomStatusCounts): NewsroomDashboardStats {
  return {
    action: counts.readyPrepared + counts.preparing + counts.terminalFailed,
    processing: counts.inbox + counts.readyUnprepared,
    archive: counts.archive,
    rejected: counts.rejected,
    preparing: counts.preparing,
    failed: counts.statusFailed + counts.terminalFailed,
    publishedToday: counts.publishedToday,
    total: counts.total,
  };
}

export function computeNewsroomDashboardStats(
  articles: NewsroomArticleSnapshot[],
  publishedToday: number,
): NewsroomDashboardStats {
  let action = 0;
  let processing = 0;
  let archive = 0;
  let rejected = 0;
  let preparing = 0;
  let failed = 0;

  for (const article of articles) {
    if (isNewsReadyForAction(article)) action += 1;
    if (isNewsInProcessing(article)) processing += 1;
    if (isNewsArchived(article)) archive += 1;
    if (article.status === 'rejected') rejected += 1;
    if (['publishing', 'social_processing'].includes(article.status)) preparing += 1;
    if (['failed', 'publish_failed', 'social_failed'].includes(article.status)) failed += 1;
  }

  return {
    action,
    processing,
    archive,
    rejected,
    preparing,
    failed,
    publishedToday,
    total: articles.length,
  };
}
