import type { NewsArticleCardData } from '@/components/publishing/news-article-card';

export type NewsroomFilter = 'action' | 'processing' | 'archive' | 'rejected' | 'all';

export function isNewsSummaryPrepared(article: NewsArticleCardData): boolean {
  return Boolean(article.titleFa?.trim() && article.summaryFa?.trim());
}

/** خبرهایی که редактор می‌تواند روی آن‌ها اقدام کند (بررسی، انتشار، رفع خطا). */
export function isNewsReadyForAction(article: NewsArticleCardData): boolean {
  if (['rejected', 'published', 'social_sent', 'new', 'processing', 'failed'].includes(article.status)) {
    return false;
  }
  if (article.status === 'ready' && !isNewsSummaryPrepared(article)) return false;
  return true;
}

/** خبرهایی که هنوز در خط دریافت یا آماده‌سازی هستند. */
export function isNewsInProcessing(article: NewsArticleCardData): boolean {
  return ['new', 'processing', 'failed'].includes(article.status)
    || (article.status === 'ready' && !isNewsSummaryPrepared(article));
}

export function isNewsArchived(article: NewsArticleCardData): boolean {
  return ['published', 'social_sent'].includes(article.status);
}

export const NEWSROOM_FILTERS: Array<{
  key: NewsroomFilter;
  label: string;
  description: string;
  tone: string;
  matches: (article: NewsArticleCardData) => boolean;
}> = [
  {
    key: 'action',
    label: 'آماده اقدام',
    description: 'بررسی، انتشار در سایت، یا ارسال به استودیو',
    tone: 'text-emerald-700',
    matches: isNewsReadyForAction,
  },
  {
    key: 'processing',
    label: 'در پردازش',
    description: 'دریافت از منابع و آماده‌سازی خودکار',
    tone: 'text-blue-700',
    matches: isNewsInProcessing,
  },
  {
    key: 'archive',
    label: 'منتشر / استودیو',
    description: 'خبرهای منتشرشده یا ارسال‌شده به استودیوی اجتماعی',
    tone: 'text-indigo-700',
    matches: isNewsArchived,
  },
  {
    key: 'rejected',
    label: 'ردشده',
    description: 'خبرهای ردشده — پس از ۳ روز حذف می‌شوند',
    tone: 'text-red-700',
    matches: (article) => article.status === 'rejected',
  },
  {
    key: 'all',
    label: 'همه',
    description: 'تمام خبرهای میز خبر',
    tone: 'text-slate-900',
    matches: () => true,
  },
];

export function newsroomFilterMeta(filter: NewsroomFilter) {
  return NEWSROOM_FILTERS.find((item) => item.key === filter) ?? NEWSROOM_FILTERS[0];
}

export function resolveNewsDisplayStatus(article: NewsArticleCardData): {
  label: string;
  badge: 'default' | 'info' | 'success' | 'danger';
} {
  if (article.status === 'failed') {
    return { label: 'خطا در آماده‌سازی', badge: 'danger' };
  }
  if (isNewsInProcessing(article)) {
    return { label: 'در پردازش', badge: 'info' };
  }
  if (['publishing', 'social_processing'].includes(article.status)) {
    return { label: 'در حال انجام', badge: 'info' };
  }
  if (['publish_failed', 'social_failed'].includes(article.status)) {
    return { label: 'نیاز به اقدام', badge: 'danger' };
  }
  if (article.status === 'ready') {
    return { label: 'آماده اقدام', badge: 'success' };
  }
  if (article.status === 'published') {
    return { label: 'منتشر شده', badge: 'success' };
  }
  if (article.status === 'social_sent') {
    return { label: 'در استودیو', badge: 'success' };
  }
  if (article.status === 'rejected') {
    return { label: 'رد شده', badge: 'danger' };
  }
  return { label: 'نامشخص', badge: 'default' };
}
