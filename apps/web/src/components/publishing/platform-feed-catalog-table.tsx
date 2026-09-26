'use client';

import { useMemo } from 'react';
import { HeartPulse, RefreshCw, Trash2 } from 'lucide-react';
import { sourceLanguageLabel } from '@deska/shared';
import {
  FeedTopicLabelChips,
  groupCatalogFeedsBySource,
  topicLabelsForSourceGroup,
  worstCatalogHealthStatus,
} from '@/components/publishing/feed-channel-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SourceHealthBadge } from '@/components/ui/source-health-badge';
import { FeedSourceLogoWithFallback } from '@/components/publishing/feed-source-logo';
import { FeedSourceTitleLink } from '@/components/publishing/feed-source-title-link';
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
  topicLabel?: string;
  sourceGroupId?: string;
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
  degraded: { label: 'مشکل موقت — بررسی سلامت اخیر ناموفق یا ناقص بود', className: 'bg-amber-400' },
  down: { label: 'قطع طولانی — مدت زیادی است منبع پاسخ نمی‌دهد', className: 'bg-red-500' },
  unknown: { label: 'هنوز بررسی سلامت انجام نشده', className: 'bg-slate-300' },
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
  /** Full catalog list — used to collect all topic labels for grouped sources. */
  allFeeds?: PlatformFeedRow[];
  busy: string;
  onTest: (feed: PlatformFeedRow) => void;
  onFetch: (feed: PlatformFeedRow) => void;
  onEdit: (feed: PlatformFeedRow) => void;
  onDelete: (feed: PlatformFeedRow) => void;
  emptyMessage: string;
}

function groupMembers(feed: PlatformFeedRow, catalog: readonly PlatformFeedRow[]) {
  const groupId = feed.sourceGroupId || feed.id;
  return catalog.filter((item) => (item.sourceGroupId || item.id) === groupId);
}

function summarizeGroupRow(feed: PlatformFeedRow, catalog: readonly PlatformFeedRow[]) {
  const members = groupMembers(feed, catalog);
  const healthStatus = worstCatalogHealthStatus(members);
  const healthMember = members.find((item) => (item.healthStatus || 'unknown') === healthStatus) ?? feed;
  const lastFetchedAt = members.reduce<string | null>((latest, item) => {
    if (!item.lastFetchedAt) return latest;
    if (!latest) return item.lastFetchedAt;
    return new Date(item.lastFetchedAt) > new Date(latest) ? item.lastFetchedAt : latest;
  }, null);
  const enabled = members.every((item) => item.enabled);
  const topicLabels = topicLabelsForSourceGroup(feed, catalog);
  const healthTitle = healthMember.healthError
    ? `${HEALTH_META[healthStatus].label} — ${healthMember.healthError}`
    : healthMember.healthCheckedAt
      ? `${HEALTH_META[healthStatus].label} — ${new Date(healthMember.healthCheckedAt).toLocaleString('fa-IR')}`
      : HEALTH_META[healthStatus].label;
  return {
    members,
    healthStatus,
    healthMember,
    lastFetchedAt,
    enabled,
    topicLabels,
    healthTitle,
  };
}

function CatalogRowActions({
  feed,
  busy,
  onTest,
  onFetch,
  onEdit,
  onDelete,
  compact,
}: {
  feed: PlatformFeedRow;
  busy: string;
  onTest: (feed: PlatformFeedRow) => void;
  onFetch: (feed: PlatformFeedRow) => void;
  onEdit: (feed: PlatformFeedRow) => void;
  onDelete: (feed: PlatformFeedRow) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1', compact && 'justify-end')}>
      <Button
        size="sm"
        variant="ghost"
        title="بررسی سلامت"
        aria-label="بررسی سلامت"
        isLoading={busy === `test-${feed.id}`}
        onClick={() => onTest(feed)}
      >
        <HeartPulse className="h-4 w-4 text-emerald-600" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        title="دریافت مطالب"
        aria-label="دریافت مطالب"
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
  );
}

export function PlatformFeedCatalogTable({
  feeds,
  allFeeds,
  busy,
  onTest,
  onFetch,
  onEdit,
  onDelete,
  emptyMessage,
}: PlatformFeedCatalogTableProps) {
  const labelCatalog = allFeeds ?? feeds;
  const displayFeeds = useMemo(() => groupCatalogFeedsBySource(feeds), [feeds]);

  if (!displayFeeds.length) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center px-6 py-10 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-slate-100 md:hidden">
        {displayFeeds.map((feed) => {
          const sourceMeta = feedSourceMeta(feed.sourceType);
          const SourceIcon = sourceMeta.icon;
          const summary = summarizeGroupRow(feed, labelCatalog);
          return (
            <article key={feed.sourceGroupId || feed.id} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <FeedSourceLogoWithFallback
                  name={feed.name}
                  logoUrl={feed.logoUrl}
                  sourceType={feed.sourceType}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <FeedSourceTitleLink name={feed.name} url={feed.url} sourceType={feed.sourceType} className="text-base font-semibold text-slate-900" />
                    <FeedTopicLabelChips labels={summary.topicLabels} />
                    <SourceHealthBadge status={summary.healthStatus} title={summary.healthTitle} />
                  </div>
                  {summary.members.length > 1 ? (
                    <p className="mt-1 text-xs text-slate-500">{summary.members.length} فید RSS</p>
                  ) : null}
                  {summary.healthMember.healthCheckedAt ? (
                    <p className="mt-1 text-xs text-slate-500">
                      آخرین بررسی سلامت: {new Date(summary.healthMember.healthCheckedAt).toLocaleString('fa-IR')}
                    </p>
                  ) : null}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <dt className="text-slate-400">نوع</dt>
                  <dd className="mt-0.5 inline-flex items-center gap-1 font-medium text-slate-700">
                    <SourceIcon className="h-3.5 w-3.5" />
                    {sourceMeta.shortLabel}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <dt className="text-slate-400">زبان</dt>
                  <dd className="mt-0.5 font-medium text-slate-700">{sourceLanguageLabel(feed.sourceLanguage || 'auto')}</dd>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2">
                  <dt className="text-slate-400">آخرین پایش</dt>
                  <dd className="mt-0.5 font-medium text-slate-700">
                    {summary.lastFetchedAt ? new Date(summary.lastFetchedAt).toLocaleString('fa-IR') : 'هنوز پایش نشده'}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-between gap-2">
                <Badge variant={summary.enabled ? 'success' : 'default'}>
                  {summary.enabled ? 'فعال' : 'غیرفعال'}
                </Badge>
                <CatalogRowActions
                  feed={feed}
                  busy={busy}
                  onTest={onTest}
                  onFetch={onFetch}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  compact
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="ds-table min-w-[40rem]">
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
            {displayFeeds.map((feed) => {
              const sourceMeta = feedSourceMeta(feed.sourceType);
              const SourceIcon = sourceMeta.icon;
              const summary = summarizeGroupRow(feed, labelCatalog);
              return (
                <tr key={feed.sourceGroupId || feed.id} className="hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <FeedSourceLogoWithFallback
                        name={feed.name}
                        logoUrl={feed.logoUrl}
                        sourceType={feed.sourceType}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                          <FeedSourceTitleLink name={feed.name} url={feed.url} sourceType={feed.sourceType} />
                          <FeedTopicLabelChips labels={summary.topicLabels} />
                          <SourceHealthBadge status={summary.healthStatus} title={summary.healthTitle} />
                        </div>
                        {summary.members.length > 1 ? (
                          <p className="mt-1 text-xs text-slate-500">{summary.members.length} فید RSS با موضوع‌های مختلف</p>
                        ) : null}
                        {summary.healthMember.healthCheckedAt && (
                          <div className="mt-1 text-xs text-slate-500">
                            آخرین بررسی سلامت: {new Date(summary.healthMember.healthCheckedAt).toLocaleString('fa-IR')}
                            {typeof summary.healthMember.healthItemCount === 'number' ? ` · ${summary.healthMember.healthItemCount} مطلب` : ''}
                          </div>
                        )}
                        {(summary.healthStatus === 'degraded' || summary.healthStatus === 'down') && summary.healthMember.healthError ? (
                          <div className="mt-1 text-xs text-red-600">{summary.healthMember.healthError}</div>
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
                    {summary.lastFetchedAt ? new Date(summary.lastFetchedAt).toLocaleString('fa-IR') : 'هنوز پایش نشده'}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={summary.enabled ? 'success' : 'default'}>
                      {summary.enabled ? 'فعال' : 'غیرفعال'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <CatalogRowActions
                      feed={feed}
                      busy={busy}
                      onTest={onTest}
                      onFetch={onFetch}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
