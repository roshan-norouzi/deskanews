'use client';

import { useCallback, useEffect, useState } from 'react';
import { HeartPulse, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  IRAN_SOURCE_HELP,
  RIGHTS_MODES,
  SOURCE_TYPES,
  normalizeFeedUrlForSubmit,
  validateFeedUrl,
  sourceTypeLabel,
  type RightsMode,
  type SourceType,
} from '@/lib/feed-sources';

interface PlatformFeed {
  id: string;
  name: string;
  url: string;
  sourceType: SourceType;
  rightsMode: RightsMode;
  adapterConfig?: Record<string, unknown>;
  resolvedFeedUrl: string;
  includeWords: string[];
  excludeWords: string[];
  pollIntervalMinutes: number;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string;
}

interface FeedForm {
  name: string;
  url: string;
  sourceType: SourceType;
  rightsMode: RightsMode;
  maxItems: string;
  sitemapUrl: string;
  includeWords: string;
  excludeWords: string;
  pollIntervalMinutes: string;
  enabled: boolean;
}

const EMPTY_FORM: FeedForm = {
  name: '',
  url: '',
  sourceType: 'rss',
  rightsMode: 'quote_ok',
  maxItems: '',
  sitemapUrl: '',
  includeWords: '',
  excludeWords: '',
  pollIntervalMinutes: '240',
  enabled: true,
};

function wordsToString(words?: string[]) {
  return (words || []).join('، ');
}

function defaultRightsForSource(sourceType: SourceType): RightsMode {
  return sourceType === 'rss' ? 'quote_ok' : 'rewrite_required';
}

function buildAdapterConfig(form: FeedForm): Record<string, unknown> | undefined {
  const config: Record<string, unknown> = {};
  if (form.maxItems.trim()) config.maxItems = Number(form.maxItems);
  if (form.sitemapUrl.trim()) config.sitemapUrl = form.sitemapUrl.trim();
  return Object.keys(config).length ? config : undefined;
}

function validateForm(form: FeedForm) {
  if (form.name.trim().length < 2) return 'نام منبع باید حداقل ۲ نویسه باشد.';
  const interval = Number(form.pollIntervalMinutes);
  if (!Number.isInteger(interval) || interval < 5 || interval > 1440) return 'فاصله پایش باید بین ۵ تا ۱۴۴۰ دقیقه باشد.';
  const urlError = validateFeedUrl(form.url, form.sourceType);
  if (urlError) return urlError;
  if (form.maxItems.trim()) {
    const maxItems = Number(form.maxItems);
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 200) return 'حداکثر مطالب باید بین ۱ تا ۲۰۰ باشد.';
  }
  return '';
}

export default function PlatformFeedsPage() {
  const { isSuperAdmin } = useAuth();
  const [feeds, setFeeds] = useState<PlatformFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformFeed | null>(null);
  const [form, setForm] = useState<FeedForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<PlatformFeed[]>('/platform/feeds', { skipTenant: true });
      setFeeds(Array.isArray(result) ? result : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت منابع پیش‌فرض انجام نشد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(feed: PlatformFeed) {
    setEditing(feed);
    setForm({
      name: feed.name,
      url: feed.url,
      sourceType: feed.sourceType,
      rightsMode: feed.rightsMode || defaultRightsForSource(feed.sourceType),
      maxItems: feed.adapterConfig?.maxItems ? String(feed.adapterConfig.maxItems) : '',
      sitemapUrl: typeof feed.adapterConfig?.sitemapUrl === 'string' ? feed.adapterConfig.sitemapUrl : '',
      includeWords: wordsToString(feed.includeWords),
      excludeWords: wordsToString(feed.excludeWords),
      pollIntervalMinutes: String(feed.pollIntervalMinutes),
      enabled: feed.enabled,
    });
    setModalOpen(true);
  }

  async function saveFeed(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setNotice(validationError);
      return;
    }
    setBusy('save');
    setNotice('');
    try {
      const body = {
        name: form.name.trim(),
        url: normalizeFeedUrlForSubmit(form.url, form.sourceType),
        sourceType: form.sourceType,
        rightsMode: form.rightsMode,
        adapterConfig: buildAdapterConfig(form),
        includeWords: form.includeWords,
        excludeWords: form.excludeWords,
        pollIntervalMinutes: Number(form.pollIntervalMinutes),
        enabled: form.enabled,
      };
      await apiFetch(editing ? `/platform/feeds/${editing.id}` : '/platform/feeds', {
        method: editing ? 'PATCH' : 'POST',
        skipTenant: true,
        body,
      });
      setModalOpen(false);
      setNotice(editing ? 'منبع پیش‌فرض ویرایش شد.' : 'منبع پیش‌فرض اضافه شد.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'ذخیره انجام نشد');
    } finally {
      setBusy('');
    }
  }

  if (!isSuperAdmin) {
    return (
      <ProtectedLayout title="منابع پیش‌فرض">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">فقط مدیر کل به این بخش دسترسی دارد.</div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title="منابع پیش‌فرض">
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6" dir="rtl">
        <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-violet-950 via-slate-900 to-slate-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">منابع پیش‌فرض پلتفرم</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">این منابع در همه سازمان‌ها نمایش داده می‌شوند. مالک هر سازمان می‌تواند آن‌ها را روشن یا خاموش کند. پردازش و آماده‌سازی یک‌بار انجام می‌شود تا هزینه هوش مصنوعی تکراری نشود.</p>
            <p className="mt-3 max-w-2xl text-xs leading-6 text-slate-400">{IRAN_SOURCE_HELP}</p>
          </div>
          <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={openCreate}><Plus className="h-4 w-4" /> افزودن منبع پیش‌فرض</Button>
        </header>

        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Card className="overflow-hidden">
          {loading ? (
            <div className="grid min-h-56 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
          ) : feeds.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center text-sm text-slate-500">هنوز منبع پیش‌فرضی ثبت نشده است.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">منبع</th>
                    <th className="px-5 py-3 font-medium">نوع</th>
                    <th className="px-5 py-3 font-medium">حقوق محتوا</th>
                    <th className="px-5 py-3 font-medium">فیلتر کلمات</th>
                    <th className="px-5 py-3 font-medium">پایش</th>
                    <th className="px-5 py-3 font-medium">وضعیت</th>
                    <th className="px-5 py-3 font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeds.map((feed) => (
                    <tr key={feed.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{feed.name}</div>
                        <div className="mt-1 truncate text-xs text-slate-500" dir="ltr">{feed.url}</div>
                        {feed.resolvedFeedUrl && <div className="mt-1 truncate text-xs text-emerald-700" dir="ltr">فید: {feed.resolvedFeedUrl}</div>}
                        {feed.lastError && <div className="mt-1 text-xs text-red-600">{feed.lastError}</div>}
                      </td>
                      <td className="px-5 py-4">{sourceTypeLabel(feed.sourceType)}</td>
                      <td className="px-5 py-4 text-xs text-slate-600">{RIGHTS_MODES[feed.rightsMode || defaultRightsForSource(feed.sourceType)]?.label || '—'}</td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {feed.includeWords.length ? <div>شامل: {feed.includeWords.join('، ')}</div> : null}
                        {feed.excludeWords.length ? <div>بدون: {feed.excludeWords.join('، ')}</div> : null}
                        {!feed.includeWords.length && !feed.excludeWords.length ? '—' : null}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <div>هر {feed.pollIntervalMinutes} دقیقه</div>
                        <div className="mt-1 text-xs text-slate-400">{feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleString('fa-IR') : 'هنوز پایش نشده'}</div>
                      </td>
                      <td className="px-5 py-4"><Badge variant={feed.enabled ? 'success' : 'default'}>{feed.enabled ? 'فعال' : 'غیرفعال'}</Badge></td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" isLoading={busy === `test-${feed.id}`} onClick={async () => {
                            setBusy(`test-${feed.id}`);
                            try { await apiFetch(`/platform/feeds/${feed.id}/test`, { method: 'POST', skipTenant: true }); setNotice('تست منبع انجام شد.'); }
                            catch (reason) { setNotice(reason instanceof Error ? reason.message : 'تست انجام نشد'); }
                            finally { setBusy(''); }
                          }}><HeartPulse className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" isLoading={busy === `fetch-${feed.id}`} onClick={async () => {
                            setBusy(`fetch-${feed.id}`);
                            try { await apiFetch(`/platform/feeds/${feed.id}/fetch`, { method: 'POST', skipTenant: true }); setNotice('پایش انجام شد.'); await load(); }
                            catch (reason) { setNotice(reason instanceof Error ? reason.message : 'پایش انجام نشد'); }
                            finally { setBusy(''); }
                          }}><RefreshCw className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(feed)}>ویرایش</Button>
                          <Button size="sm" variant="ghost" className="text-red-600" isLoading={busy === `delete-${feed.id}`} onClick={async () => {
                            if (!window.confirm(`منبع «${feed.name}» حذف شود؟`)) return;
                            setBusy(`delete-${feed.id}`);
                            try { await apiFetch(`/platform/feeds/${feed.id}`, { method: 'DELETE', skipTenant: true }); await load(); }
                            catch (reason) { setNotice(reason instanceof Error ? reason.message : 'حذف انجام نشد'); }
                            finally { setBusy(''); }
                          }}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {modalOpen && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <form onSubmit={saveFeed} className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b px-6 py-5">
                <h2 className="text-xl font-bold">{editing ? 'ویرایش منبع پیش‌فرض' : 'افزودن منبع پیش‌فرض'}</h2>
                <button type="button" onClick={() => setModalOpen(false)}><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4 p-6">
                <Input label="نام" required value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">نوع منبع</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(Object.entries(SOURCE_TYPES) as [SourceType, (typeof SOURCE_TYPES)[SourceType]][]).map(([key, item]) => (
                      <label key={key} className={cn('cursor-pointer rounded-2xl border p-4', form.sourceType === key ? 'border-primary-500 bg-primary-50' : 'border-slate-200')}>
                        <input type="radio" className="sr-only" checked={form.sourceType === key} onChange={() => setForm((c) => ({ ...c, sourceType: key, rightsMode: defaultRightsForSource(key) }))} />
                        <item.icon className="h-5 w-5" />
                        <span className="mt-2 block text-sm font-semibold">{item.label.replace('آدرس ', '').replace('کانال ', '')}</span>
                        <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Input label={SOURCE_TYPES[form.sourceType].label} required dir="ltr" placeholder={SOURCE_TYPES[form.sourceType].placeholder} value={form.url} onChange={(e) => setForm((c) => ({ ...c, url: e.target.value }))} />
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">حقوق استفاده از محتوا</legend>
                  <select className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={form.rightsMode} onChange={(e) => setForm((c) => ({ ...c, rightsMode: e.target.value as RightsMode }))}>
                    {(Object.entries(RIGHTS_MODES) as [RightsMode, (typeof RIGHTS_MODES)[RightsMode]][]).map(([key, item]) => (
                      <option key={key} value={key}>{item.label} — {item.description}</option>
                    ))}
                  </select>
                </fieldset>
                {(form.sourceType === 'sitemap' || form.sourceType === 'telegram') && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="حداکثر مطالب (اختیاری)" dir="ltr" placeholder="50" value={form.maxItems} onChange={(e) => setForm((c) => ({ ...c, maxItems: e.target.value }))} />
                    {form.sourceType === 'sitemap' && <Input label="آدرس سایت‌مپ جایگزین (اختیاری)" dir="ltr" placeholder="https://example.com/news-sitemap.xml" value={form.sitemapUrl} onChange={(e) => setForm((c) => ({ ...c, sitemapUrl: e.target.value }))} />}
                  </div>
                )}
                <Input label="کلمات اجباری (با ویرگول)" placeholder="فقط خبرهایی که حداقل یکی از این کلمات را دارند" value={form.includeWords} onChange={(e) => setForm((c) => ({ ...c, includeWords: e.target.value }))} />
                <Input label="کلمات ممنوع (با ویرگول)" placeholder="خبرهایی که این کلمات را دارند نادیده گرفته می‌شوند" value={form.excludeWords} onChange={(e) => setForm((c) => ({ ...c, excludeWords: e.target.value }))} />
                <Input label="فاصله پایش (دقیقه)" dir="ltr" value={form.pollIntervalMinutes} onChange={(e) => setForm((c) => ({ ...c, pollIntervalMinutes: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((c) => ({ ...c, enabled: e.target.checked }))} /> فعال در سطح پلتفرم</label>
              </div>
              <div className="flex justify-end gap-2 border-t bg-slate-50 px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
                <Button type="submit" isLoading={busy === 'save'}>ذخیره</Button>
              </div>
            </form>
          </div>
        )}
      </main>
    </ProtectedLayout>
  );
}
