'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FeedSourceLogoWithFallback } from '@/components/publishing/feed-source-logo';

interface FeedSourceCardProps {
  name: string;
  url?: string;
  logoUrl?: string;
  sourceType?: string;
  enabled: boolean;
  badge?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function FeedSourceCard({
  name,
  url,
  logoUrl,
  sourceType,
  enabled,
  badge,
  footer,
  actions,
  className,
}: FeedSourceCardProps) {
  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-2xl border p-3 transition-all duration-200',
        enabled
          ? 'border-slate-200 bg-white shadow-sm ring-1 ring-slate-100'
          : 'border-slate-100 bg-slate-50/70 opacity-50 saturate-[0.45]',
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <div className="flex items-start gap-2.5">
          <FeedSourceLogoWithFallback
            name={name}
            logoUrl={logoUrl}
            sourceType={sourceType}
            enabled={enabled}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5">
              <h4
                className={cn(
                  'line-clamp-2 text-sm font-semibold leading-5',
                  enabled ? 'text-slate-900' : 'text-slate-500',
                )}
                title={name}
              >
                {name}
              </h4>
              {badge}
            </div>
            {url ? (
              <p className="mt-1 truncate text-[10px] leading-4 text-slate-400" dir="ltr" title={url}>
                {url}
              </p>
            ) : null}
          </div>
        </div>
        {footer}
      </div>
      {actions ? (
        <div className="mt-3 flex items-center justify-end gap-0.5 border-t border-slate-100 pt-2">
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
        'grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
