'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Save, TestTube2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/utils';

type Settings = Record<string, string>;

const SETTING_KEYS = ['source_fetch_bridge_url', 'source_fetch_bridge_secret', 'source_fetch_news_via_bridge'] as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      {children}
      {hint && <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

function editableSettings(values: Settings): Settings {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !key.endsWith('_configured')));
}

export function PlatformSourceFetchSettingsPanel() {
  const [values, setValues] = useState<Settings>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const hasLocalEdits = useRef(false);

  useEffect(() => {
    void apiFetch<Settings>('/platform/source-fetch-settings', { skipTenant: true })
      .then((data) => {
        if (!hasLocalEdits.current) setValues(data);
        setLoaded(true);
      })
      .catch((reason) => {
        setError(reason instanceof ApiError ? reason.message : 'دریافت تنظیمات انجام نشد');
        setLoaded(true);
      });
  }, []);

  const set = (key: string, value: string) => {
    hasLocalEdits.current = true;
    setValues((current) => ({ ...current, [key]: value }));
  };

  async function run(kind: string, operation: () => Promise<void>, success: string) {
    setBusy(kind);
    setError('');
    setMessage('');
    try {
      await operation();
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'عملیات انجام نشد');
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    await run('save', async () => {
      const body = Object.fromEntries(SETTING_KEYS.map((key) => [key, values[key] ?? '']));
      const saved = await apiFetch<Settings>('/platform/source-fetch-settings', {
        method: 'PUT',
        skipTenant: true,
        body: editableSettings(body),
      });
      hasLocalEdits.current = false;
      setValues((current) => {
        const merged = { ...current, ...saved };
        if (current.source_fetch_bridge_secret && !saved.source_fetch_bridge_secret) {
          merged.source_fetch_bridge_secret = current.source_fetch_bridge_secret;
        }
        return merged;
      });
    }, 'تنظیم دریافت منبع برای همه سازمان‌ها ذخیره شد.');
  }

  async function testSettings() {
    await run('test', async () => {
      const body = Object.fromEntries(SETTING_KEYS.map((key) => [key, values[key] ?? '']));
      const result = await apiFetch<{ ok: boolean; message: string }>('/platform/source-fetch-settings/test', {
        method: 'POST',
        skipTenant: true,
        body: editableSettings(body),
      });
      if (!result.ok) throw new ApiError(result.message || 'تست سرویس دریافت ناموفق بود', 400);
    }, 'اتصال سرویس دریافت با موفقیت تأیید شد.');
  }

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && (
        <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </div>
      )}

      {!loaded ? (
        <div className="grid min-h-40 place-items-center">
          <span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : (
        <Card className="space-y-6 p-5 sm:p-6">
          <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm leading-7 text-slate-700">
            <p className="font-semibold text-slate-900">انتخاب مسیر دریافت منابع</p>
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>بازشدن یک منبع روی <strong>رایانهٔ شما با فیلترشکن</strong> به معنی دسترسی <strong>سرور دسکا</strong> به آن منبع نیست.</li>
              <li><strong>منابع در دسترس سرور</strong> معمولاً به‌صورت مستقیم دریافت می‌شوند و به فعال‌کردن گزینهٔ زیر نیاز ندارند.</li>
              <li><strong>منابع مسدود یا خارج از دسترس سرور</strong> را از طریق <strong>سرویس دریافت</strong> بخوانید. آدرس سرویس را ثبت کنید و «دریافت منابع خبری از طریق سرویس واسط» را <strong>فعال</strong> کنید. این سرویس روی Cloudflare اجرا می‌شود.</li>
              <li><strong>تلگرام و X (توییتر)</strong> از طریق همین سرویس دریافت می‌شوند.</li>
            </ul>
            <p className="mt-3 text-xs text-slate-600">
              اگر پس از فعال‌کردن دریافت منابع خبری، پیام «فقط تلگرام و توییتر» نمایش داده شد، نسخهٔ Worker را در Cloudflare به‌روزرسانی کنید یا از پشتیبانی کمک بگیرید. برای این به‌روزرسانی نیازی به تغییر آدرس سرویس نیست.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900">دریافت منبع</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              آدرس و رمز سرویس واسط را برای دریافت از تلگرام، X و منابع خبری خارج از دسترس سرور تنظیم کنید.
            </p>
          </div>

          <div className="grid gap-4">
            <Field label="آدرس سرویس دریافت" hint="مثال: https://deska.account.workers.dev — بدون اسلش پایانی. برای تلگرام، توییتر و در صورت نیاز منابع خبری.">
              <input
                dir="ltr"
                className="rounded-xl border px-3 py-2.5"
                placeholder="https://deska.account.workers.dev"
                value={values.source_fetch_bridge_url || ''}
                onChange={(e) => set('source_fetch_bridge_url', e.target.value)}
              />
            </Field>
            <Field
              label="رمز سرویس دریافت"
              hint={values.source_fetch_bridge_secret_configured === 'true'
                ? 'رمز قبلی ثبت شده است؛ برای حفظ آن، این فیلد را خالی بگذارید.'
                : 'اگر روی سرویس رمز گذاشته‌اید، همان را اینجا وارد کنید.'}
            >
              <div className="relative">
                <KeyRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  className="w-full rounded-xl border py-2.5 pl-3 pr-10"
                  placeholder={values.source_fetch_bridge_secret_configured === 'true' ? 'رمز ثبت شده است' : 'اختیاری'}
                  value={values.source_fetch_bridge_secret || ''}
                  onChange={(e) => set('source_fetch_bridge_secret', e.target.value)}
                />
              </div>
            </Field>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600"
                checked={values.source_fetch_news_via_bridge === 'true'}
                onChange={(event) => set('source_fetch_news_via_bridge', event.target.checked ? 'true' : 'false')}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">دریافت منابع خبری از طریق سرویس واسط</span>
                <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
                  <strong>فعال:</strong> فیدها و وب‌سایت‌ها از طریق سرویس Cloudflare دریافت می‌شوند. <strong>غیرفعال:</strong> دریافت مستقیماً از سرور دسکا انجام می‌شود. اگر هیچ‌کدام پاسخ ندادند، بررسی کنید که آدرس منبع بدون ورود به حساب کاربری باز شود.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            <Button variant="outline" isLoading={busy === 'test'} onClick={() => void testSettings()}>
              <TestTube2 className="h-4 w-4" />
              بررسی اتصال
            </Button>
            <Button isLoading={busy === 'save'} onClick={() => void saveSettings()}>
              <Save className="h-4 w-4" />
              ذخیره تنظیمات
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
