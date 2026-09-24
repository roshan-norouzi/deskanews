'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface FeedChannelDraft {
  url: string;
  topicLabel: string;
}

export function channelsForFeed<T extends { id: string; url: string; topicLabel?: string; sourceGroupId?: string }>(
  feed: T,
  all: T[],
): FeedChannelDraft[] {
  const groupId = feed.sourceGroupId || feed.id;
  const siblings = all.filter((item) => (item.sourceGroupId || item.id) === groupId);
  const rows = (siblings.length ? siblings : [feed]).map((item) => ({
    url: item.url,
    topicLabel: item.topicLabel || '',
  }));
  return rows.length ? rows : [{ url: feed.url, topicLabel: feed.topicLabel || '' }];
}

export function topicLabelsForSourceGroup<T extends { id: string; topicLabel?: string | null; sourceGroupId?: string | null }>(
  feed: T,
  all: readonly T[],
): string[] {
  const groupId = feed.sourceGroupId || feed.id;
  const labels = new Set<string>();
  for (const item of all) {
    if ((item.sourceGroupId || item.id) !== groupId) continue;
    const label = String(item.topicLabel || '').trim();
    if (label) labels.add(label);
  }
  return [...labels].sort((left, right) => left.localeCompare(right, 'fa'));
}

/** One catalog row per source group (multiple RSS URLs share sourceGroupId). */
export function groupCatalogFeedsBySource<T extends { id: string; name: string; sourceGroupId?: string | null; url?: string }>(
  feeds: readonly T[],
): T[] {
  const byGroup = new Map<string, T[]>();
  for (const feed of feeds) {
    const key = feed.sourceGroupId || feed.id;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(feed);
    else byGroup.set(key, [feed]);
  }
  const grouped: T[] = [];
  for (const members of byGroup.values()) {
    const anchor = members.find((item) => item.id === (item.sourceGroupId || item.id))
      ?? [...members].sort((left, right) => String(left.url || '').localeCompare(String(right.url || ''), 'en'))[0];
    grouped.push(anchor);
  }
  return grouped.sort((left, right) => left.name.localeCompare(right.name, 'fa'));
}

const HEALTH_RANK: Record<string, number> = { down: 0, degraded: 1, unknown: 2, healthy: 3 };

export function worstCatalogHealthStatus(
  members: Array<{ healthStatus?: string | null }>,
): 'healthy' | 'degraded' | 'down' | 'unknown' {
  let worst: 'healthy' | 'degraded' | 'down' | 'unknown' = 'healthy';
  for (const member of members) {
    const status = (member.healthStatus || 'unknown') as 'healthy' | 'degraded' | 'down' | 'unknown';
    if ((HEALTH_RANK[status] ?? 2) < (HEALTH_RANK[worst] ?? 3)) worst = status;
  }
  return worst;
}

export function FeedTopicLabelChips({ labels, className }: { labels: string[]; className?: string }) {
  if (!labels.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className || ''}`.trim()}>
      {labels.map((label) => (
        <span key={label} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {label}
        </span>
      ))}
    </span>
  );
}

export function FeedChannelFields({
  channels,
  labelOptions,
  urlLabel,
  urlPlaceholder,
  onChange,
}: {
  channels: FeedChannelDraft[];
  labelOptions: string[];
  urlLabel: string;
  urlPlaceholder: string;
  onChange: (channels: FeedChannelDraft[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-700">آدرس‌های RSS</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">هر آدرس لیبل موضوعی خودش را دارد. چند آدرس می‌توانند یک موضوع مشترک داشته باشند.</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...channels, { url: '', topicLabel: '' }])}>
          <Plus className="h-4 w-4" />
          افزودن RSS
        </Button>
      </div>
      {channels.map((channel, index) => (
        <div key={index} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
          <Input
            label={index === 0 ? urlLabel : `RSS ${index + 1}`}
            required={index === 0}
            dir="ltr"
            placeholder={urlPlaceholder}
            value={channel.url}
            onChange={(event) => onChange(channels.map((row, rowIndex) => rowIndex === index ? { ...row, url: event.target.value } : row))}
          />
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">لیبل موضوعی
            <select
              value={channel.topicLabel}
              onChange={(event) => onChange(channels.map((row, rowIndex) => rowIndex === index ? { ...row, topicLabel: event.target.value } : row))}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-primary-500"
            >
              <option value="">بدون لیبل</option>
              {labelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </label>
          {channels.length > 1 ? (
            <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" aria-label="حذف RSS" onClick={() => onChange(channels.filter((_, rowIndex) => rowIndex !== index))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : <span />}
        </div>
      ))}
    </div>
  );
}
