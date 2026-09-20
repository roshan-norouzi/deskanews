'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiFetch, cn } from '@/lib/utils';

type CatalogHealthSettings = {
  catalog_health_enabled: string;
  catalog_health_interval_hours: string;
  catalog_health_last_run_at: string;
};

type CatalogHealthRunStatus = {
  ok: true;
  running: boolean;
  checked: number;
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  errorMessage: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PlatformCatalogHealthSettingsPanel() {
  const [healthSettings, setHealthSettings] = useState<CatalogHealthSettings>({
    catalog_health_enabled: 'true',
    catalog_health_interval_hours: '6',
    catalog_health_last_run_at: '',
  });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void apiFetch<CatalogHealthSettings>('/platform/catalog-health-settings', { skipTenant: true })
      .then(async (settings) => {
        setHealthSettings(settings);
        const status = await apiFetch<CatalogHealthRunStatus>('/platform/catalog-health-run-status', { skipTenant: true });
        if (status.running) {
          setNotice({
            type: 'success',
            text: status.total
              ? `تست سلامت در حال اجراست (${status.checked}/${status.total}). برای مشاهده پیشرفت «اجرای فوری» را بزنید.`
              : 'تست سلامت در حال اجراست.',
          });
        }
        setLoaded(true);
      })
      .catch((reason) => {
        setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'دریافت تنظیمات انجام نشد' });
        setLoaded(true);
      });
  }, []);

  async function saveHealthSettings() {
    setBusy('health-settings');
    setNotice(null);
    try {
      const saved = await apiFetch<CatalogHealthSettings>('/platform/catalog-health-settings', {
        method: 'PUT',
        skipTenant: true,
        body: {
          catalog_health_enabled: healthSettings.catalog_health_enabled,
          catalog_health_interval_hours: healthSettings.catalog_health_interval_hours,
        },
      });
      setHealthSettings(saved);
      setNotice({ type: 'success', text: 'تنظیمات تست سلامت ذخیره شد.' });
    } catch (reason) {
      setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'ذخیره تنظیمات انجام نشد' });
    } finally {
      setBusy('');
    }
  }

  async function waitForCatalogHealthRun() {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      const status = await apiFetch<CatalogHealthRunStatus>('/platform/catalog-health-run-status', { skipTenant: true });
      if (status.running) {
        setNotice({
          type: 'success',
          text: status.total
            ? `در حال بررسی منابع… ${status.checked}/${status.total}`
            : 'در حال بررسی منابع…',
        });
        await sleep(2000);
        continue;
      }

      const refreshed = await apiFetch<CatalogHealthSettings>('/platform/catalog-health-settings', { skipTenant: true });
      setHealthSettings(refreshed);

      if (status.errorMessage) {
        throw new Error(status.errorMessage);
      }

      setNotice({
        type: 'success',
        text: `تست سلامت انجام شد: ${status.healthy} سالم، ${status.degraded} موقت، ${status.down} قطع.`,
      });
      return;
    }

    throw new Error('زمان انتظار برای پایان تست سلامت تمام شد؛ بعداً وضعیت را دوباره بررسی کنید.');
  }

  async function runHealthChecksNow() {
    setBusy('health-run');
    setNotice(null);
    try {
      const result = await apiFetch<{ started: boolean; running: boolean; total: number; checked: number }>('/platform/feeds/health-check', {
        method: 'POST',
        skipTenant: true,
      });
      if (result.running) {
        setNotice({
          type: 'success',
          text: result.started
            ? `تست سلامت برای ${result.total} منبع شروع شد.`
            : 'تست سلامت از قبل در حال اجراست.',
        });
      }
      await waitForCatalogHealthRun();
    } catch (reason) {
      setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'اجرای تست سلامت انجام نشد' });
    } finally {
      setBusy('');
    }
  }

  if (!loaded) {
    return (
      <div className="grid min-h-40 place-items-center">
        <span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          role="status"
          className={cn(
            'flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm',
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700',
          )}
        >
          {notice.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
          {notice.text}
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900">تست سلامت خودکار کاتالوگ</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              در بازه زمانی مشخص، هر منبع فعال بررسی می‌شود که ۵ مطلب آخر را دریافت کند. وضعیت با دایره رنگی کنار نام منبع در صفحه کاتالوگ نمایش داده می‌شود.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" isLoading={busy === 'health-run'} onClick={() => void runHealthChecksNow()}>
              اجرای فوری
            </Button>
            <Button size="sm" isLoading={busy === 'health-settings'} onClick={() => void saveHealthSettings()}>
              ذخیره تنظیمات
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            فاصله تست (ساعت)
            <input
              type="number"
              min={1}
              max={168}
              dir="ltr"
              className="rounded-xl border px-3 py-2.5"
              value={healthSettings.catalog_health_interval_hours}
              onChange={(e) => setHealthSettings((current) => ({ ...current, catalog_health_interval_hours: e.target.value }))}
            />
          </label>
          <label className="flex items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={healthSettings.catalog_health_enabled === 'true'}
              onChange={(e) => setHealthSettings((current) => ({
                ...current,
                catalog_health_enabled: e.target.checked ? 'true' : 'false',
              }))}
            />
            <span>تست خودکار فعال باشد</span>
          </label>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <div className="font-medium text-slate-800">آخرین اجرای خودکار</div>
            <div className="mt-1">
              {healthSettings.catalog_health_last_run_at
                ? new Date(healthSettings.catalog_health_last_run_at).toLocaleString('fa-IR')
                : 'هنوز اجرا نشده'}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> سالم</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> مشکل موقت</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> قطع طولانی</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
