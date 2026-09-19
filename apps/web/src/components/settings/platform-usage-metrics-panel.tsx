'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { USAGE_UNIT_LABEL } from '@deska/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/utils';

type UsageMetricDefinition = {
  key: string;
  label: string;
  unitLabel: string;
  unitCost: number;
  enabled: boolean;
  sortOrder: number;
};

export function PlatformUsageMetricsPanel() {
  const [usageMetrics, setUsageMetrics] = useState<UsageMetricDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const metrics = await apiFetch<UsageMetricDefinition[]>('/platform/usage-metrics', { skipTenant: true });
      setUsageMetrics(metrics);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت تعرفه‌ها انجام نشد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveUsageMetrics = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const metrics = await apiFetch<UsageMetricDefinition[]>('/platform/usage-metrics', {
        method: 'PATCH',
        skipTenant: true,
        body: {
          metrics: usageMetrics.map((metric) => ({
            key: metric.key,
            unitCost: metric.unitCost,
            enabled: metric.enabled,
          })),
        },
      });
      setUsageMetrics(metrics);
      setMessage('تعرفه‌ها با موفقیت ذخیره شد.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ذخیره تعرفه مصرف انجام نشد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <Gauge className="h-5 w-5" />
        </span>
        <div>
          <CardTitle>تعرفه مصرف</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            فرایندهای مصرف در کد تعریف می‌شوند. فقط هزینه هر {USAGE_UNIT_LABEL} و وضعیت فعال/غیرفعال قابل تنظیم است.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
        {loading ? (
          <div className="py-12 text-center text-slate-500">در حال دریافت...</div>
        ) : (
          <>
            {usageMetrics.map((metric) => (
              <div key={metric.key} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{metric.label}</p>
                  <p className="mt-1 text-xs text-slate-500" dir="ltr">{metric.key}</p>
                  <p className="mt-1 text-xs text-slate-400">واحد محاسبه: {metric.unitLabel}</p>
                </div>
                <Input
                  label={`هزینه هر ${USAGE_UNIT_LABEL}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(metric.unitCost)}
                  onChange={(event) =>
                    setUsageMetrics((current) =>
                      current.map((item) =>
                        item.key === metric.key
                          ? { ...item, unitCost: Number(event.target.value) || 0 }
                          : item,
                      ),
                    )
                  }
                />
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={metric.enabled}
                    onChange={(event) =>
                      setUsageMetrics((current) =>
                        current.map((item) =>
                          item.key === metric.key ? { ...item, enabled: event.target.checked } : item,
                        ),
                      )
                    }
                  />
                  فعال
                </label>
              </div>
            ))}
            <Button onClick={() => void saveUsageMetrics()} isLoading={saving}>
              ذخیره تعرفه‌ها
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
