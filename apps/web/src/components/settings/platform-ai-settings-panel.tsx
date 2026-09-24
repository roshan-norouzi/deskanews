'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, KeyRound, Save, TestTube2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/utils';

type Settings = Record<string, string>;

const AI_KEYS = [
  'gapgpt_base_url',
  'gapgpt_api_key',
  'gapgpt_model',
  'gapgpt_model_news_summary',
  'gapgpt_model_news_translation',
  'gapgpt_model_social',
  'news_summary_prompt',
  'news_full_translation_prompt',
  'news_persian_rewrite_prompt',
  'news_persian_full_rewrite_prompt',
] as const;

function editableSettings(values: Settings): Settings {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !key.endsWith('_configured')));
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      {children}
      {hint && <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

export function PlatformAiSettingsPanel() {
  const [values, setValues] = useState<Settings>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [gapGptModels, setGapGptModels] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const hasLocalEdits = useRef(false);

  const availableGapGptModels = useMemo(
    () => Array.from(new Set([
      ...gapGptModels,
      values.gapgpt_model,
      values.gapgpt_model_news_summary,
      values.gapgpt_model_news_translation,
      values.gapgpt_model_social,
      'gpt-4o-mini',
    ].filter(Boolean))),
    [gapGptModels, values],
  );

  useEffect(() => {
    void apiFetch<Settings>('/platform/ai-settings', { skipTenant: true })
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

  async function loadGapGptModels() {
    setBusy('gapgpt-models');
    setError('');
    setMessage('');
    try {
      const response = await apiFetch<{ models?: string[] }>('/platform/ai-settings/gapgpt-models', {
        method: 'POST',
        skipTenant: true,
        body: editableSettings(Object.fromEntries(['gapgpt_base_url', 'gapgpt_api_key'].map((key) => [key, values[key] ?? '']))),
      });
      setGapGptModels(Array.isArray(response.models) ? response.models.filter(Boolean) : []);
      setMessage('فهرست مدل‌های GapGPT دریافت شد.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'دریافت فهرست مدل‌ها انجام نشد');
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    await run('save', async () => {
      const body = Object.fromEntries(AI_KEYS.map((key) => [key, values[key] ?? '']));
      const saved = await apiFetch<Settings>('/platform/ai-settings', {
        method: 'PUT',
        skipTenant: true,
        body: editableSettings(body),
      });
      hasLocalEdits.current = false;
      setValues((current) => {
        const merged = { ...current, ...saved };
        if (current.gapgpt_api_key && !saved.gapgpt_api_key) merged.gapgpt_api_key = current.gapgpt_api_key;
        return merged;
      });
    }, 'تنظیمات هوش مصنوعی برای همه سازمان‌ها ذخیره شد.');
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
        <div className="grid min-h-40 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
      ) : (
        <Card className="space-y-6 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">اتصال GapGPT</h2>
            <p className="mt-1 text-sm text-slate-500">کلید API فقط در سرور نگهداری می‌شود و به مرورگر برگردانده نمی‌شود.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="آدرس پایه API" hint="آدرسی که به مسیرهای models و chat/completions متصل می‌شود.">
              <input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="https://api.example.com/v1" value={values.gapgpt_base_url || ''} onChange={(e) => set('gapgpt_base_url', e.target.value)} />
            </Field>
            <Field label="کلید API" hint={values.gapgpt_api_key_configured === 'true' ? 'کلید قبلی ثبت شده است؛ برای حفظ آن، این فیلد را خالی بگذارید.' : 'کلید API حساب GapGPT را وارد کنید.'}>
              <div className="relative">
                <KeyRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="password" dir="ltr" autoComplete="new-password" className="w-full rounded-xl border py-2.5 pl-3 pr-10" placeholder={values.gapgpt_api_key_configured === 'true' ? 'کلید ثبت شده است' : 'API key'} value={values.gapgpt_api_key || ''} onChange={(e) => set('gapgpt_api_key', e.target.value)} />
              </div>
            </Field>
            <Field label="مدل پیش‌فرض" hint="برای فعالیت‌هایی که مدل اختصاصی ندارند.">
              <select dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.gapgpt_model || 'gpt-4o-mini'} onChange={(e) => set('gapgpt_model', e.target.value)}>{availableGapGptModels.map((model) => <option key={model} value={model}>{model}</option>)}</select>
            </Field>
            <Field label="مدل خلاصه‌سازی خبر" hint="برای آماده‌سازی عنوان و خلاصه در میز خبر.">
              <select dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.gapgpt_model_news_summary || values.gapgpt_model || 'gpt-4o-mini'} onChange={(e) => set('gapgpt_model_news_summary', e.target.value)}>{availableGapGptModels.map((model) => <option key={model} value={model}>{model}</option>)}</select>
            </Field>
            <Field label="مدل پردازش متن کامل خبر" hint="برای ترجمه یا بازنویسی هنگام انتشار.">
              <select dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.gapgpt_model_news_translation || values.gapgpt_model || 'gpt-4o-mini'} onChange={(e) => set('gapgpt_model_news_translation', e.target.value)}>{availableGapGptModels.map((model) => <option key={model} value={model}>{model}</option>)}</select>
            </Field>
            <Field label="مدل استودیوی اجتماعی" hint="برای تولید لید و خلاصه اجتماعی.">
              <select dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.gapgpt_model_social || values.gapgpt_model || 'gpt-4o-mini'} onChange={(e) => set('gapgpt_model_social', e.target.value)}>{availableGapGptModels.map((model) => <option key={model} value={model}>{model}</option>)}</select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" isLoading={busy === 'gapgpt-models'} onClick={() => void loadGapGptModels()}><Bot className="h-4 w-4" /> دریافت فهرست مدل‌ها</Button>
            <Button variant="outline" isLoading={busy === 'gapgpt'} onClick={() => run('gapgpt', () => apiFetch('/platform/ai-settings/test-gapgpt', { method: 'POST', skipTenant: true, body: editableSettings(Object.fromEntries(['gapgpt_base_url', 'gapgpt_api_key'].map((key) => [key, values[key] ?? '']))) }), 'اتصال GapGPT با موفقیت تأیید شد.')}><TestTube2 className="h-4 w-4" /> تست اتصال GapGPT</Button>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h2 className="text-lg font-bold text-slate-900">پرامپت‌های پردازش خبر</h2>
            <p className="mt-1 text-sm text-slate-500">این دستورها برای همه سازمان‌ها یکسان اعمال می‌شوند.</p>
            <div className="mt-5 grid gap-5">
              <Field label="پرامپت تیتر و خلاصهٔ خبر خارجی" hint="برای ترجمه و خلاصه‌سازی خبرهای غیرفارسی.">
                <textarea className="min-h-36 rounded-xl border px-3 py-3 leading-7" placeholder="لحن، دقت، واژگان و قواعد ترجمه..." value={values.news_summary_prompt || ''} onChange={(e) => set('news_summary_prompt', e.target.value)} />
              </Field>
              <Field label="پرامپت متن کامل خبر خارجی" hint="هنگام انتشار در سایت، متن کامل خبر غیرفارسی با این دستور ترجمه می‌شود.">
                <textarea className="min-h-36 rounded-xl border px-3 py-3 leading-7" placeholder="قواعد ترجمهٔ کامل..." value={values.news_full_translation_prompt || ''} onChange={(e) => set('news_full_translation_prompt', e.target.value)} />
              </Field>
              <Field label="پرامپت تیتر و خلاصهٔ خبر فارسی" hint="برای بازنویسی تیتر و خلاصه خبرهای فارسی.">
                <textarea className="min-h-36 rounded-xl border px-3 py-3 leading-7" placeholder="قواعد بازنویسی خبر فارسی..." value={values.news_persian_rewrite_prompt || ''} onChange={(e) => set('news_persian_rewrite_prompt', e.target.value)} />
              </Field>
              <Field label="پرامپت متن کامل خبر فارسی" hint="هنگام انتشار، متن کامل خبر فارسی با این دستور بازنویسی می‌شود.">
                <textarea className="min-h-36 rounded-xl border px-3 py-3 leading-7" placeholder="قواعد بازنویسی کامل متن فارسی..." value={values.news_persian_full_rewrite_prompt || ''} onChange={(e) => set('news_persian_full_rewrite_prompt', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-5">
            <Button isLoading={busy === 'save'} onClick={() => void saveSettings()}><Save className="h-4 w-4" /> ذخیره تنظیمات</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
