'use client';

import { Activity } from 'lucide-react';
import { USAGE_UNIT_LABEL, formatPersianDigits } from '@deska/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';

export interface TenantUsageMetric {
  key: string;
  label: string;
  unitLabel: string;
  unitCost: number;
  quantity: number;
  totalCost: number;
}

export interface TenantUsageSummary {
  tenantId: string;
  metrics: TenantUsageMetric[];
  totalCost: number;
  availableTokens?: number;
  consumedDay?: number;
  consumedWeek?: number;
  consumedMonth?: number;
}

interface OrganizationUsagePanelProps {
  tenantId: string | null;
  title?: string;
  showCard?: boolean;
  /** Prefetched summary — skips API call when provided */
  summary?: TenantUsageSummary | null;
  summaryLoading?: boolean;
}

export function OrganizationUsagePanel({
  tenantId,
  title = 'مصرف میز خبر',
  showCard = true,
  summary,
  summaryLoading,
}: OrganizationUsagePanelProps) {
  const path = summary !== undefined || !tenantId ? null : `/tenants/${tenantId}/usage`;
  const { data: fetched, isLoading: fetchLoading, error } = useApi<TenantUsageSummary>(path, {
    skipTenant: true,
    headers: tenantId ? { 'X-Tenant-Id': tenantId } : undefined,
  });
  const data = summary !== undefined ? summary : fetched;
  const isLoading = summary !== undefined ? (summaryLoading ?? false) : fetchLoading;

  const content = (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
              <p className="text-sm text-slate-600">توکن باقی‌مانده</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {formatPersianDigits(String(data?.availableTokens ?? 0))}
                <span className="mr-2 text-sm font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm text-slate-600">مصرف امروز</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPersianDigits(String(data?.consumedDay ?? 0))}
                <span className="mr-2 text-sm font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm text-slate-600">مصرف این هفته</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPersianDigits(String(data?.consumedWeek ?? 0))}
                <span className="mr-2 text-sm font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm text-slate-600">مصرف این ماه</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatPersianDigits(String(data?.consumedMonth ?? 0))}
                <span className="mr-2 text-sm font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-3">
            <div>
              <p className="text-sm text-slate-600">مصرف کل ثبت‌شده</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatPersianDigits(String(data?.totalCost ?? 0))}
                <span className="mr-2 text-sm font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
              </p>
            </div>
            <Badge variant="info">بر اساس تعرفه‌های پلتفرم</Badge>
          </div>

          <div className="space-y-3 md:hidden">
            {(data?.metrics ?? []).length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                هنوز مصرفی ثبت نشده است
              </p>
            ) : (
              data?.metrics.map((metric) => (
                <div key={metric.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-900">{metric.label}</p>
                    <p className="shrink-0 text-sm font-bold text-slate-900">
                      {formatPersianDigits(String(metric.totalCost))} {USAGE_UNIT_LABEL}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatPersianDigits(String(metric.quantity))} {metric.unitLabel}
                    {' · '}
                    هر واحد {formatPersianDigits(String(metric.unitCost))} {USAGE_UNIT_LABEL}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">فرایند</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">تعداد</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">واحد</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">هزینه هر {USAGE_UNIT_LABEL}</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">جمع ({USAGE_UNIT_LABEL})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(data?.metrics ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      هنوز مصرفی ثبت نشده است
                    </td>
                  </tr>
                ) : (
                  data?.metrics.map((metric) => (
                    <tr key={metric.key}>
                      <td className="px-4 py-3 font-medium text-slate-900">{metric.label}</td>
                      <td className="px-4 py-3 text-slate-700">{formatPersianDigits(String(metric.quantity))}</td>
                      <td className="px-4 py-3 text-slate-700">{metric.unitLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{formatPersianDigits(String(metric.unitCost))}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatPersianDigits(String(metric.totalCost))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  if (!showCard) return content;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Activity className="h-5 w-5" />
        </div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
