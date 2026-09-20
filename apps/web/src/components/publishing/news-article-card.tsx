'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Languages,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatJalaliDateTime } from '@/lib/date';
import { resolveNewsDisplayStatus } from '@/lib/newsroom-filters';
import { cn } from '@/lib/utils';

export type NewsStatus =
  | 'new'
  | 'processing'
  | 'ready'
  | 'rejected'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'publish_failed'
  | 'social_processing'
  | 'social_sent'
  | 'social_failed';

export interface NewsArticleCardData {
  id: string;
  feedId: string | null;
  originalUrl: string;
  originalTitle: string;
  originalSummary: string;
  titleFa: string;
  summaryFa: string;
  sourceName: string;
  status: NewsStatus;
  publishedAtSource: string | null;
  purgeAfter: string | null;
  wordpressPostUrl: string;
  featuredImageUrl: string | null;
  contentFa?: string;
  lastError: string;
  destinationCategory?: { id: string; name: string; isGeneral: boolean } | null;
}

interface DestinationCategoryOption {
  id: string;
  name: string;
  isGeneral: boolean;
}

export const NEWS_STATUS_META: Record<NewsStatus, { label: string; badge: BadgeProps['variant'] }> = {
  new: { label: 'در صف آماده‌سازی', badge: 'default' },
  processing: { label: 'در حال آماده‌سازی', badge: 'info' },
  ready: { label: 'آماده بررسی', badge: 'success' },
  rejected: { label: 'رد شده', badge: 'danger' },
  publishing: { label: 'در حال انتشار', badge: 'info' },
  published: { label: 'منتشر شده', badge: 'success' },
  failed: { label: 'خطای آماده‌سازی', badge: 'danger' },
  publish_failed: { label: 'خطای انتشار', badge: 'danger' },
  social_processing: { label: 'در حال ارسال به استودیو', badge: 'info' },
  social_sent: { label: 'در استودیو', badge: 'success' },
  social_failed: { label: 'خطای ارسال به استودیو', badge: 'danger' },
};

type CardAction = {
  key: string;
  label: string;
  icon: typeof Send;
  onClick: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean;
  className?: string;
};

interface NewsArticleCardProps {
  article: NewsArticleCardData;
  busyKey: string | null;
  categories?: DestinationCategoryOption[];
  onAssignCategory?: (articleId: string, destinationCategoryId: string | null) => void;
  onSummarize: (id: string) => void;
  onTranslateFull: (id: string) => void;
  onSendToSocial: (id: string) => void;
  onReject: (id: string) => void;
}

function isBusy(busyKey: string | null, articleId: string, action: string) {
  return busyKey === `${action}-${articleId}`;
}

function isProcessing(status: NewsStatus) {
  return ['processing', 'publishing', 'social_processing'].includes(status);
}

export function NewsArticleCard({
  article,
  busyKey,
  categories = [],
  onAssignCategory,
  onSummarize,
  onTranslateFull,
  onSendToSocial,
  onReject,
}: NewsArticleCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const meta = resolveNewsDisplayStatus(article);

  const canReject = !['rejected', 'publishing', 'published', 'social_processing', 'social_sent'].includes(article.status);
  const canSummarize = ['new', 'ready', 'failed'].includes(article.status);
  const canPublish = ['ready', 'publish_failed'].includes(article.status);
  const canSendToSocial = ['ready', 'publish_failed', 'social_failed'].includes(article.status);
  const processing = isProcessing(article.status);

  const title = article.titleFa || article.originalTitle;
  const summary = article.summaryFa
    || (article.status === 'processing'
      ? 'در حال تشخیص زبان و آماده‌سازی خبر...'
      : article.originalSummary || 'خلاصه‌ای برای این خبر ثبت نشده است.');

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const summarizeAction: CardAction | null = canSummarize ? {
    key: 'summarize',
    label: article.status === 'ready' ? 'آماده‌سازی دوباره' : 'آماده‌سازی خبر',
    icon: RefreshCw,
    onClick: () => onSummarize(article.id),
    loading: isBusy(busyKey, article.id, 'summarize'),
    variant: ['new', 'failed'].includes(article.status) ? 'primary' : 'outline',
  } : null;

  const translateAction: CardAction | null = canPublish ? {
    key: 'translate',
    label: article.contentFa?.trim()
      ? (article.status === 'publish_failed' ? 'ویرایش متن و انتشار' : 'مشاهده متن کامل')
      : (article.status === 'publish_failed' ? 'آماده‌سازی مجدد' : 'آماده‌سازی برای انتشار'),
    icon: Languages,
    onClick: () => onTranslateFull(article.id),
    loading: isBusy(busyKey, article.id, 'translate'),
    variant: ['ready', 'publish_failed'].includes(article.status) ? 'primary' : 'outline',
  } : null;

  const socialAction: CardAction | null = canSendToSocial ? {
    key: 'social',
    label: article.status === 'social_failed' ? 'ارسال دوباره به استودیو' : 'ارسال به استودیو',
    icon: Share2,
    onClick: () => onSendToSocial(article.id),
    loading: isBusy(busyKey, article.id, 'social'),
    variant: article.status === 'social_failed' ? 'primary' : 'outline',
    className: 'border-violet-200 text-violet-700 hover:bg-violet-50',
  } : null;

  const rejectAction: CardAction | null = canReject ? {
    key: 'reject',
    label: 'رد خبر',
    icon: Trash2,
    onClick: () => onReject(article.id),
    loading: isBusy(busyKey, article.id, 'reject'),
    variant: 'ghost',
    className: 'text-red-600 hover:bg-red-50 hover:text-red-700',
  } : null;

  const primaryKeys = new Set(
    [summarizeAction, translateAction, socialAction]
      .filter((action) => action?.variant === 'primary')
      .map((action) => action!.key),
  );

  const visibleActions = [summarizeAction, translateAction, socialAction, rejectAction]
    .filter((action): action is CardAction => Boolean(action));

  const menuActions = visibleActions.filter((action) => !primaryKeys.has(action.key) && action.key !== 'reject');
  const inlineActions = visibleActions.filter((action) => primaryKeys.has(action.key) || action.key === 'reject' || action.key === 'social');

  return (
    <article
      className={cn(
        'group relative rounded-2xl border bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md',
        processing && 'border-blue-100 bg-blue-50/20',
        article.lastError && !processing && 'border-red-100',
      )}
    >
      <div className="flex flex-col sm:flex-row">
        {article.featuredImageUrl ? (
          <div className="relative shrink-0 overflow-hidden sm:w-44 md:w-52 sm:rounded-r-2xl">
            <img
              src={article.featuredImageUrl}
              alt=""
              className="h-40 w-full object-cover sm:h-full sm:min-h-[11rem]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 to-transparent sm:bg-gradient-to-l" />
          </div>
        ) : (
          <div className="hidden shrink-0 bg-gradient-to-br from-slate-100 to-slate-50 sm:block sm:w-3 sm:rounded-r-2xl" aria-hidden />
        )}

        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                  {article.sourceName || 'منبع نامشخص'}
                </span>
                {article.destinationCategory ? (
                  <span className={cn(
                    'rounded-full px-2.5 py-1 font-medium',
                    article.destinationCategory.isGeneral
                      ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
                      : 'bg-violet-50 text-violet-800 ring-1 ring-violet-100',
                  )}>
                    {article.destinationCategory.name}
                  </span>
                ) : null}
                {categories.length > 0 && onAssignCategory ? (
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    value={article.destinationCategory?.id || ''}
                    disabled={isBusy(busyKey, article.id, 'category')}
                    onChange={(event) => onAssignCategory(article.id, event.target.value || null)}
                    aria-label="تغییر دسته‌بندی خبر"
                  >
                    <option value="">عمومی</option>
                    {categories.filter((category) => !category.isGeneral).map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                ) : null}
                <span className="text-slate-400">·</span>
                <time dateTime={article.publishedAtSource ?? undefined}>
                  {article.publishedAtSource
                    ? formatJalaliDateTime(article.publishedAtSource)
                    : 'بدون تاریخ منبع'}
                </time>
                <a
                  href={article.originalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  aria-label="مشاهده منبع اصلی"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">منبع</span>
                </a>
              </div>
              <h3 className="text-base font-bold leading-7 text-slate-900 sm:text-lg line-clamp-2">
                {title}
              </h3>
            </div>
            <Badge variant={meta.badge} className="shrink-0">
              {processing && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
              {meta.label}
            </Badge>
          </div>

          <p className="mt-3 line-clamp-3 flex-1 text-sm leading-7 text-slate-600">
            {summary}
          </p>

          {article.lastError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/80 px-3 py-2.5 text-sm leading-6 text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="line-clamp-3">{article.lastError}</p>
            </div>
          )}

          {article.status === 'rejected' && article.purgeAfter && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Clock3 className="h-4 w-4 shrink-0" aria-hidden />
              حذف خودکار در {formatJalaliDateTime(article.purgeAfter)}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            {processing ? (
              <p className="flex items-center gap-2 text-sm text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                لطفاً چند لحظه صبر کنید...
              </p>
            ) : (
              <>
                {article.status === 'social_sent' && (
                  <Link
                    href="/publishing/social"
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
                  >
                    <Share2 className="h-4 w-4" />
                    مشاهده در استودیو
                  </Link>
                )}
                {article.wordpressPostUrl && (
                  <a
                    href={article.wordpressPostUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    مشاهده در سایت
                  </a>
                )}
                {inlineActions.map((action) => (
                  <Button
                    key={action.key}
                    size="sm"
                    variant={action.variant === 'primary' ? 'primary' : action.variant === 'danger' ? 'danger' : action.variant === 'ghost' ? 'ghost' : 'outline'}
                    className={action.className}
                    isLoading={action.loading}
                    onClick={action.onClick}
                  >
                    <action.icon className="h-4 w-4" />
                    {action.label}
                  </Button>
                ))}
                {menuActions.length > 0 && (
                  <div className="relative ms-auto" ref={menuRef}>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="px-2.5"
                      aria-expanded={menuOpen}
                      aria-haspopup="menu"
                      aria-label="سایر اقدامات"
                      onClick={() => setMenuOpen((open) => !open)}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                    {menuOpen && (
                      <div
                        role="menu"
                        className="absolute bottom-full left-0 z-30 mb-2 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
                      >
                        {menuActions.map((action) => (
                          <button
                            key={action.key}
                            type="button"
                            role="menuitem"
                            disabled={action.loading}
                            onClick={() => { setMenuOpen(false); action.onClick(); }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-right text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            {action.loading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <action.icon className="h-4 w-4 shrink-0" />
                            )}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!inlineActions.length && article.status !== 'social_sent' && !article.wordpressPostUrl && (
                  <span className="text-sm text-slate-400">اقدامی در دسترس نیست</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
