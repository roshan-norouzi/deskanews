'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Save, TestTube2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/utils';

type Settings = Record<string, string>;

const SETTING_KEYS = ['source_fetch_bridge_url', 'source_fetch_bridge_secret'] as const;

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
    }, 'تنظیمات Worker Deska برای همه سازمان‌ها ذخیره شد.');
  }

  async function testSettings() {
    await run('test', async () => {
      const body = Object.fromEntries(SETTING_KEYS.map((key) => [key, values[key] ?? '']));
      const result = await apiFetch<{ ok: boolean; message: string }>('/platform/source-fetch-settings/test', {
        method: 'POST',
        skipTenant: true,
        body: editableSettings(body),
      });
      if (!result.ok) throw new ApiError(result.message || 'تست Worker ناموفق بود', 400);
    }, 'اتصال Worker Deska با موفقیت تأیید شد.');
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
          <div>
            <h2 className="text-lg font-bold text-slate-900">اتصال Cloudflare Worker «deska»</h2>
            <p className="mt-1 text-sm text-slate-500">
              پس از <code dir="ltr">pnpm worker:deploy</code> آدرس Worker را اینجا ثبت کنید. این Worker برای دریافت منابع (تلگرام، X، رسانه‌های بین‌المللی) و همچنین <strong>تست و انتشار تلگرام</strong> از استودیوی اجتماعی استفاده می‌شود؛ سازمان‌ها آدرس جداگانه‌ای وارد نمی‌کنند.
            </p>
          </div>

          <div className="grid gap-4">
            <Field label="آدرس Worker Deska" hint="مثال: https://deska.account.workers.dev — بدون اسلش پایانی">
              <input
                dir="ltr"
                className="rounded-xl border px-3 py-2.5"
                placeholder="https://deska.account.workers.dev"
                value={values.source_fetch_bridge_url || ''}
                onChange={(e) => set('source_fetch_bridge_url', e.target.value)}
              />
            </Field>
            <Field
              label="رمز مشترک Worker (BRIDGE_SECRET)"
              hint={values.source_fetch_bridge_secret_configured === 'true'
                ? 'رمز قبلی ثبت شده است؛ برای حفظ آن، این فیلد را خالی بگذارید.'
                : 'در صورت تنظیم BRIDGE_SECRET روی Worker، همان مقدار را اینجا وارد کنید.'}
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
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            <Button variant="outline" isLoading={busy === 'test'} onClick={() => void testSettings()}>
              <TestTube2 className="h-4 w-4" />
              تست اتصال Worker
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
