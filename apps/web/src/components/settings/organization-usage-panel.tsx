'use client';

import { Activity } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
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
}

interface OrganizationUsagePanelProps {
  tenantId: string | null;
  title?: string;
  showCard?: boolean;
}

export function OrganizationUsagePanel({
  tenantId,
  title = 'مصرف سازمان',
  showCard = true,
}: OrganizationUsagePanelProps) {
  const path = tenantId ? `/tenants/${tenantId}/usage` : null;
  const { data, isLoading, error } = useApi<TenantUsageSummary>(path);

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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-3">
            <div>
              <p className="text-sm text-slate-600">مصرف کل سازمان</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatPersianDigits(String(data?.totalCost ?? 0))}
                <span className="mr-2 text-sm font-medium text-slate-500">توکن</span>
              </p>
            </div>
            <Badge variant="info">بر اساس تعرفه‌های پلتفرم</Badge>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">نوع مصرف</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">تعداد</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">واحد</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">هزینه واحد</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">جمع</th>
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
