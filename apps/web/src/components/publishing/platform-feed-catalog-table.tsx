'use client';

import { HeartPulse, RefreshCw, Trash2 } from 'lucide-react';
import { SOURCE_LANGUAGE_LABELS } from '@deska/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FeedSourceLogoWithFallback } from '@/components/publishing/feed-source-logo';
import { feedSourceMeta } from '@/lib/feed-source-types';

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
                      <div className="font-semibold text-slate-900">{feed.name}</div>
                      <div className="mt-1 truncate text-xs text-slate-500" dir="ltr">{feed.url}</div>
                  {feed.resolvedFeedUrl && (
                    <div className="mt-1 truncate text-xs text-emerald-700" dir="ltr">
                      فید: {feed.resolvedFeedUrl}
                    </div>
                  )}
                  {feed.lastError && <div className="mt-1 text-xs text-red-600">{feed.lastError}</div>}
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
                  {SOURCE_LANGUAGE_LABELS[(feed.sourceLanguage || 'auto') as keyof typeof SOURCE_LANGUAGE_LABELS]}
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
                      title="آزمایش منبع"
                      aria-label="آزمایش منبع"
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
