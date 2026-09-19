'use client';

import { Activity } from 'lucide-react';
import { USAGE_UNIT_LABEL, formatPersianDigits } from '@deska/shared';
import { cn } from '@/lib/utils';
import type { TenantUsageSummary } from '@/components/settings/organization-usage-panel';

interface OrganizationUsageMiniProps {
  usage: TenantUsageSummary | null;
  loading?: boolean;
  error?: boolean;
  className?: string;
}

export function OrganizationUsageMini({ usage, loading, error, className }: OrganizationUsageMiniProps) {
  if (loading) {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-2 w-full animate-pulse rounded-full bg-slate-100" />
        <div className="h-2 w-4/5 animate-pulse rounded-full bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('text-sm text-amber-700', className)}>
        دریافت مصرف انجام نشد
      </div>
    );
  }

  const total = usage?.totalCost ?? 0;
  const metrics = (usage?.metrics ?? []).filter((metric) => metric.quantity > 0).slice(0, 3);
  const maxQuantity = Math.max(...(usage?.metrics ?? []).map((metric) => metric.quantity), 1);

  if (!total) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-slate-500', className)}>
        <Activity className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span>هنوز مصرفی ثبت نشده</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">مصرف</span>
        <span className="text-sm font-bold text-slate-900">
          {formatPersianDigits(String(total))}
          <span className="mr-1 text-xs font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
        </span>
      </div>
      {metrics.length > 0 && (
        <ul className="space-y-1.5" aria-label="جزئیات مصرف">
          {metrics.map((metric) => (
            <li key={metric.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-slate-600">{metric.label}</span>
                <span className="shrink-0 font-medium text-slate-800">
                  {formatPersianDigits(String(metric.quantity))}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all"
                  style={{ width: `${Math.max(8, (metric.quantity / maxQuantity) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
