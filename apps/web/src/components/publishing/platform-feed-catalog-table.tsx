'use client';

import { HeartPulse, RefreshCw, Trash2 } from 'lucide-react';
import { sourceLanguageLabel } from '@deska/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FeedSourceLogoWithFallback } from '@/components/publishing/feed-source-logo';
import { feedSourceMeta } from '@/lib/feed-source-types';
import { cn } from '@/lib/utils';

export type PlatformFeedHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface PlatformFeedRow {
  id: string;
  name: string;
  url: string;
  sourceType: string;
  resolvedFeedUrl?: string;
  sourceLanguage?: string;
  logoUrl?: string;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string;
  healthStatus?: PlatformFeedHealthStatus;
  healthCheckedAt?: string | null;
  healthItemCount?: number;
  healthError?: string;
  healthFailSince?: string | null;
}

const HEALTH_META: Record<PlatformFeedHealthStatus, { label: string; className: string }> = {
  healthy: { label: 'سالم — ۵ مطلب آخر دریافت می‌شود', className: 'bg-emerald-500' },
  degraded: { label: 'مشکل موقت — تست سلامت اخیر ناموفق یا ناقص بود', className: 'bg-amber-400' },
  down: { label: 'قطع طولانی — مدت زیادی است منبع پاسخ نمی‌دهد', className: 'bg-red-500' },
  unknown: { label: 'هنوز تست سلامت انجام نشده', className: 'bg-slate-300' },
};

export function FeedHealthDot({ status, title }: { status?: PlatformFeedHealthStatus; title?: string }) {
  const meta = HEALTH_META[status || 'unknown'];
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white', meta.className)}
      title={title || meta.label}
      aria-label={title || meta.label}
    />
  );
}

interface PlatformFeedCatalogTableProps {
  feeds: PlatformFeedRow[];
  busy: string;
  onTest: (feed: PlatformFeedRow) => void;
  onFetch: (feed: PlatformFeedRow) => void;
  onEdit: (feed: PlatformFeedRow) => void;
  onDelete: (feed: PlatformFeedRow) => void;
  emptyMessage: string;
}

export function PlatformFeedCatalogTable({
  feeds,
  busy,
  onTest,
  onFetch,
  onEdit,
  onDelete,
  emptyMessage,
}: PlatformFeedCatalogTableProps) {
  if (!feeds.length) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center px-6 py-10 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-right text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-5 py-3 font-medium">منبع</th>
            <th className="px-5 py-3 font-medium">نوع</th>
            <th className="px-5 py-3 font-medium">زبان</th>
            <th className="px-5 py-3 font-medium">آخرین پایش</th>
            <th className="px-5 py-3 font-medium">وضعیت</th>
            <th className="px-5 py-3 font-medium">عملیات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {feeds.map((feed) => {
            const sourceMeta = feedSourceMeta(feed.sourceType);
            const SourceIcon = sourceMeta.icon;
            const healthStatus = (feed.healthStatus || 'unknown') as PlatformFeedHealthStatus;
            const healthTitle = feed.healthError
              ? `${HEALTH_META[healthStatus].label} — ${feed.healthError}`
              : feed.healthCheckedAt
                ? `${HEALTH_META[healthStatus].label} — ${new Date(feed.healthCheckedAt).toLocaleString('fa-IR')}`
                : HEALTH_META[healthStatus].label;
            return (
              <tr key={feed.id} className="hover:bg-slate-50/80">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <FeedSourceLogoWithFallback
                      name={feed.name}
                      logoUrl={feed.logoUrl}
                      sourceType={feed.sourceType}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold text-slate-900">
                        <FeedHealthDot status={healthStatus} title={healthTitle} />
                        <span>{feed.name}</span>
                      </div>
                      {feed.healthCheckedAt && (
                        <div className="mt-1 text-xs text-slate-500">
                          آخرین تست سلامت: {new Date(feed.healthCheckedAt).toLocaleString('fa-IR')}
                          {typeof feed.healthItemCount === 'number' ? ` · ${feed.healthItemCount} مطلب` : ''}
                        </div>
                      )}
                      {(healthStatus === 'degraded' || healthStatus === 'down') && feed.healthError ? (
                        <div className="mt-1 text-xs text-red-600">{feed.healthError}</div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center gap-1.5 text-slate-700">
                    <SourceIcon className="h-4 w-4" />
                    {sourceMeta.shortLabel}
                  </span>
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {sourceLanguageLabel(feed.sourceLanguage || 'auto')}
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleString('fa-IR') : 'هنوز پایش نشده'}
                </td>
                <td className="px-5 py-4">
                  <Badge variant={feed.enabled ? 'success' : 'default'}>
                    {feed.enabled ? 'فعال' : 'غیرفعال'}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="تست سلامت"
                      aria-label="تست سلامت"
                      isLoading={busy === `test-${feed.id}`}
                      onClick={() => onTest(feed)}
                    >
                      <HeartPulse className="h-4 w-4 text-emerald-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={busy === `fetch-${feed.id}`}
                      onClick={() => onFetch(feed)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(feed)}>ویرایش</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      isLoading={busy === `delete-${feed.id}`}
                      onClick={() => onDelete(feed)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
