'use client';

import { Badge } from '@/components/ui/badge';
import type { PlatformFeedHealthStatus } from '@/components/publishing/platform-feed-catalog-table';
import { cn } from '@/lib/utils';

const HEALTH_SHORT: Record<PlatformFeedHealthStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
  healthy: { label: 'سالم', variant: 'success' },
  degraded: { label: 'هشدار', variant: 'warning' },
  down: { label: 'خطا', variant: 'danger' },
  unknown: { label: 'نامشخص', variant: 'default' },
};

export function SourceHealthBadge({
  status,
  title,
  className,
}: {
  status?: PlatformFeedHealthStatus;
  title?: string;
  className?: string;
}) {
  const key = status || 'unknown';
  const meta = HEALTH_SHORT[key];
  return (
    <Badge variant={meta.variant} className={cn('gap-1.5', className)} title={title}>
      <span
        className={cn(
          'inline-block h-2 w-2 shrink-0 rounded-full',
          key === 'healthy' && 'bg-emerald-500',
          key === 'degraded' && 'bg-amber-400',
          key === 'down' && 'bg-red-500',
          key === 'unknown' && 'bg-slate-300',
        )}
        aria-hidden
      />
      {meta.label}
    </Badge>
  );
}
