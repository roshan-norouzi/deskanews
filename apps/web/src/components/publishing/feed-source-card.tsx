'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FeedSourceLogoWithFallback } from '@/components/publishing/feed-source-logo';
import { FeedTopicLabelChips } from '@/components/publishing/feed-channel-fields';
import { FeedSourceTitleLink } from '@/components/publishing/feed-source-title-link';

interface FeedSourceCardProps {
  name: string;
  url?: string;
  logoUrl?: string;
  sourceType?: string;
  enabled: boolean;
  /** Topic labels for this source group, shown after the name. */
  topicLabels?: string[];
  badge?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function feedTogglePowerClass(enabled: boolean) {
  return cn('h-4 w-4', enabled ? 'text-emerald-700' : 'text-red-400');
}

export function FeedSourceCard({
  name,
  url,
  logoUrl,
  sourceType,
  enabled,
  topicLabels = [],
  badge,
  footer,
  actions,
  className,
}: FeedSourceCardProps) {
  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-2xl border p-4 transition-all duration-200',
        enabled
          ? 'border-emerald-200 bg-emerald-50/80 shadow-sm ring-1 ring-emerald-100/80'
          : 'border-slate-100 bg-slate-50/70',
        className,
      )}
    >
      <div className={cn('flex min-h-0 flex-1 flex-col gap-2.5', !enabled && 'opacity-50 saturate-[0.45]')}>
        <div className="flex items-start gap-3">
          <FeedSourceLogoWithFallback
            name={name}
            logoUrl={logoUrl}
            sourceType={sourceType}
            enabled={enabled}
            size="md"
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            {badge ? <div className="mb-1.5">{badge}</div> : null}
            <h4
              className={cn(
                'flex flex-wrap items-center gap-1.5 break-words text-sm font-semibold leading-6',
                enabled ? 'text-slate-900' : 'text-slate-500',
              )}
              title={name}
            >
              <FeedSourceTitleLink name={name} url={url} sourceType={sourceType} />
              <FeedTopicLabelChips labels={topicLabels} />
            </h4>
            {url ? (
              <p className="mt-1.5 break-all text-[11px] leading-5 text-slate-400" dir="ltr" title={url}>
                {url}
              </p>
            ) : null}
          </div>
        </div>
        {footer}
      </div>
      {actions ? (
        <div className={cn('mt-3 flex items-center justify-end gap-0.5 border-t pt-2', enabled ? 'border-emerald-100/80' : 'border-slate-100')}>
          {actions}
        </div>
      ) : null}
    </article>
  );
}

interface FeedSourceCardGridProps {
  children: ReactNode;
  className?: string;
}

export function FeedSourceCardGrid({ children, className }: FeedSourceCardGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
