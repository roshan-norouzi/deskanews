'use client';

import { cn } from '@/lib/utils';
import {
  FEED_CATALOG_GROUPS,
  FEED_CATALOG_GROUP_ORDER,
  resolveCatalogGroup,
  type FeedCatalogGroup,
} from '@/lib/feed-source-types';

const NONE_TOPIC_KEY = '__none';

export function normalizeFeedTopicKey(topicLabel: string | undefined | null, labelOptions: readonly string[]) {
  const raw = String(topicLabel || '').trim();
  if (raw && labelOptions.includes(raw)) return raw;
  return NONE_TOPIC_KEY;
}

export function matchesFeedCatalogFilters(
  feed: {
    sourceType?: string;
    catalogGroup?: string;
    sourceLanguage?: string;
    topicLabel?: string | null;
  },
  selectedCatalogGroups: ReadonlySet<FeedCatalogGroup>,
  selectedTopics: ReadonlySet<string>,
  labelOptions: readonly string[],
) {
  const group = resolveCatalogGroup(feed.sourceType, feed.catalogGroup, feed.sourceLanguage);
  if (selectedCatalogGroups.size > 0 && !selectedCatalogGroups.has(group)) return false;

  if (selectedTopics.size > 0) {
    const topicKey = normalizeFeedTopicKey(feed.topicLabel, labelOptions);
    if (!selectedTopics.has(topicKey)) return false;
  }

  return true;
}

function toggleSetItem<T extends string>(current: ReadonlySet<T>, value: T, checked: boolean) {
  const next = new Set(current);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

interface FeedSourceFiltersProps {
  selectedCatalogGroups: ReadonlySet<FeedCatalogGroup>;
  onCatalogGroupsChange: (next: Set<FeedCatalogGroup>) => void;
  selectedTopics: ReadonlySet<string>;
  onTopicsChange: (next: Set<string>) => void;
  topicOptions: readonly string[];
  className?: string;
}

export function FeedSourceFilters({
  selectedCatalogGroups,
  onCatalogGroupsChange,
  selectedTopics,
  onTopicsChange,
  topicOptions,
  className,
}: FeedSourceFiltersProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-800">نوع رسانه</legend>
        <div className="flex flex-wrap gap-2">
          {FEED_CATALOG_GROUP_ORDER.map((group) => {
            const checked = selectedCatalogGroups.has(group);
            return (
              <label
                key={group}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  checked
                    ? 'border-primary-500 bg-primary-50 text-primary-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600"
                  checked={checked}
                  onChange={(event) => onCatalogGroupsChange(toggleSetItem(selectedCatalogGroups, group, event.target.checked))}
                />
                {FEED_CATALOG_GROUPS[group].label}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">هیچ تیکی = همه انواع رسانه</p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-800">موضوع فید</legend>
        <div className="flex flex-wrap gap-2">
          {topicOptions.map((label) => {
            const checked = selectedTopics.has(label);
            return (
              <label
                key={label}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  checked
                    ? 'border-primary-500 bg-primary-50 text-primary-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600"
                  checked={checked}
                  onChange={(event) => onTopicsChange(toggleSetItem(selectedTopics, label, event.target.checked))}
                />
                {label}
              </label>
            );
          })}
          <label
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
              selectedTopics.has(NONE_TOPIC_KEY)
                ? 'border-primary-500 bg-primary-50 text-primary-900'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
            )}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600"
              checked={selectedTopics.has(NONE_TOPIC_KEY)}
              onChange={(event) => onTopicsChange(toggleSetItem(selectedTopics, NONE_TOPIC_KEY, event.target.checked))}
            />
            بدون موضوع
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">هیچ تیکی = همه موضوع‌ها</p>
      </fieldset>
    </div>
  );
}

export { NONE_TOPIC_KEY as FEED_TOPIC_NONE_KEY };
