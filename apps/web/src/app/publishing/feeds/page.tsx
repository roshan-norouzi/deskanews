'use client';

import { useMemo, useState } from 'react';
import {
  Globe2,
  HeartPulse,
  Newspaper,
  Radio,
  RefreshCw,
  Rss,
  Search,
  Share2,
  Trash2,
  X,
  Pencil,
  Plus,
  Power,
} from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, cn } from '@/lib/utils';
import { useTenant } from '@/lib/tenant-context';

type FeedPurpose = 'news-room' | 'social-studio';
type SourceType = 'rss' | 'website';
type FeedScope = 'tenant' | 'platform';

interface Feed {
  id: string;
  scope?: FeedScope;
  name: string;
  url: string;
  sourceType?: SourceType;
  resolvedFeedUrl?: string;
  includeWords?: string[];
  excludeWords?: string[];
  pollIntervalMinutes?: number | null;
  autoPoll?: boolean | null;
  autoPrepare?: boolean | null;
  autoPublish?: boolean | null;
  autoSendSocial?: boolean | null;
  purpose: FeedPurpose;
  enabled: boolean;
  platformEnabled?: boolean;
  lastFetchedAt: string | null;
  lastError: string;
}

interface FeedForm {
  name: string;
  url: string;
  sourceType: SourceType;
  purpose: FeedPurpose;
  includeWords: string;
  excludeWords: string;
  pollIntervalMinutes: string;
  autoPoll: boolean;
  autoPrepare: boolean;
  autoPublish: boolean;
  autoSendSocial: boolean;
}

const EMPTY_FORM: FeedForm = { name: '', url: '', sourceType: 'rss', purpose: 'news-room', includeWords: '', excludeWords: '', pollIntervalMinutes: '240', autoPoll: true, autoPrepare: true, autoPublish: false, autoSendSocial: false };

const SOURCE_TYPES: Record<SourceType, { label: string; description: string; placeholder: string; icon: typeof Rss }> = {
  rss: { label: 'آدرس فید', description: 'RSS / Atom / JSON Feed', placeholder: 'https://example.com/feed.xml', icon: Rss },
  website: { label: 'آدرس سایت', description: 'سیستم فید استاندارد سایت را پیدا می‌کند', placeholder: 'https://example.com', icon: Globe2 },
};

interface HealthItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
  featuredImageUrl: string;
  category: string;
}

interface HealthResult {
  source: { name: string; url: string; sourceType: SourceType; resolvedFeedUrl?: string };
  items: HealthItem[];
}

const PURPOSES: Record<FeedPurpose, { label: string; description: string; icon: typeof Rss; color: string }> = {
  'news-room': {
    label: 'اتاق خبر',
    description: 'دریافت و آماده‌سازی خبرها',
    icon: Newspaper,
    color: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  'social-studio': {
    label: 'استودیوی اجتماعی',
    description: 'تولید محتوای شبکه‌های اجتماعی',
    icon: Share2,
    color: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
};

function validateForm(form: FeedForm) {
  if (form.name.trim().length < 2) return 'نام منبع باید حداقل ۲ نویسه باشد.';
  const interval = Number(form.pollIntervalMinutes);
  if (!Number.isInteger(interval) || interval < 5 || interval > 1440) return 'فاصله پایش باید بین ۵ تا ۱۴۴۰ دقیقه باشد.';
  try {
    const url = new URL(form.url.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    return 'آدرس منبع باید کامل و معتبر باشد؛ مانند https://example.com';
  }
  return '';
}

function wordsToString(words?: string[]) {
  return (words || []).join('، ');
}

export default function FeedsPage() {
  const { data, error: loadError, isLoading, refetch } = useApi<Feed[]>('/publishing/feeds');
  const { activeTenant } = useTenant();
  const isOwner = activeTenant?.memberRole === 'owner';
  const feeds = useMemo(() => Array.isArray(data) ? data : [], [data]);
  const [query, setQuery] = useState('');
  const [purpose, setPurpose] = useState<FeedPurpose | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Feed | null>(null);
  const [form, setForm] = useState<FeedForm>(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);

  const visibleFeeds = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fa');
    return feeds.filter((feed) => {
      const purposeMatches = purpose === 'all' || feed.purpose === purpose;
      const queryMatches = !normalized || `${feed.name} ${feed.url} ${(feed.includeWords || []).join(' ')}`.toLocaleLowerCase('fa').includes(normalized);
      return purposeMatches && queryMatches;
    });
  }, [feeds, purpose, query]);

  const counts = useMemo(() => Object.fromEntries(
    (Object.keys(PURPOSES) as FeedPurpose[]).map((key) => [key, feeds.filter((feed) => feed.purpose === key).length]),
  ) as Record<FeedPurpose, number>, [feeds]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNotice(null);
    setModalOpen(true);
  }

  function openEdit(feed: Feed) {
    if (feed.scope === 'platform') return;
    setEditing(feed);
    setForm({ name: feed.name, url: feed.url, sourceType: feed.sourceType || 'rss', purpose: feed.purpose, includeWords: wordsToString(feed.includeWords), excludeWords: wordsToString(feed.excludeWords), pollIntervalMinutes: String(feed.pollIntervalMinutes ?? 240), autoPoll: feed.autoPoll ?? true, autoPrepare: feed.autoPrepare ?? feed.purpose === 'news-room', autoPublish: feed.autoPublish ?? false, autoSendSocial: feed.autoSendSocial ?? false });
    setNotice(null);
    setModalOpen(true);
  }

  async function testSource(feed: Feed) {
    if (feed.scope === 'platform') return;
    await run(`test-${feed.id}`, async () => {
      const result = await apiFetch<HealthResult>(`/publishing/feeds/${feed.id}/test`, { method: 'POST' });
      setHealth(result);
      setHealthOpen(true);
    });
  }

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await operation();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'عملیات انجام نشد؛ دوباره تلاش کنید.' });
    } finally {
      setBusy(null);
    }
  }

  async function saveFeed(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }
    await run('save', async () => {
      await apiFetch(editing ? `/publishing/feeds/${editing.id}` : '/publishing/feeds', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          ...form,
          name: form.name.trim(),
          url: form.url.trim(),
          includeWords: form.includeWords,
          excludeWords: form.excludeWords,
          pollIntervalMinutes: Number(form.pollIntervalMinutes),
        },
      });
      setModalOpen(false);
      setNotice({ type: 'success', text: editing ? 'منبع با موفقیت ویرایش شد.' : 'منبع جدید با موفقیت اضافه شد.' });
      await refetch();
    });
  }

  return (
    <ProtectedLayout title="منابع محتوا">
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
        <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Rss className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-bold">مدیریت منابع محتوا</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">ثبت و مدیریت منابع محتوایی.</p>
            </div>
          </div>
          <Button className="shrink-0 bg-white text-slate-900 hover:bg-slate-100 focus:ring-white" onClick={openCreate}>
            <Plus className="h-4 w-4" /> افزودن منبع
          </Button>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {(Object.entries(PURPOSES) as [FeedPurpose, (typeof PURPOSES)[FeedPurpose]][]).map(([key, item]) => {
            const Icon = item.icon;
            return (
              <button key={key} type="button" onClick={() => setPurpose(purpose === key ? 'all' : key)} className={cn('flex items-center gap-4 rounded-2xl border bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', purpose === key ? 'border-primary-400 ring-2 ring-primary-100' : 'border-slate-200')}>
                <span className={cn('grid h-11 w-11 place-items-center rounded-xl ring-1', item.color)}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">{item.label}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.description}</span></span>
                <span className="text-2xl font-bold text-slate-900">{counts[key]}</span>
              </button>
            );
          })}
        </section>

        {notice && <div role="status" className={cn('rounded-xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}
        {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">دریافت فیدها انجام نشد: {loadError}</div>}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام یا آدرس منبع..." className="w-full rounded-xl border border-slate-300 py-2.5 pl-3 pr-10 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            </div>
              <div className="flex items-center gap-2 text-sm text-slate-500"><Radio className="h-4 w-4" /> {visibleFeeds.length} منبع</div>
          </div>

          {isLoading ? (
            <div className="grid min-h-56 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
          ) : visibleFeeds.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Rss className="h-8 w-8" /></span><h2 className="mt-4 font-semibold text-slate-900">منبعی پیدا نشد</h2><p className="mt-2 text-sm text-slate-500">اولین منبع را اضافه کنید یا فیلتر جست‌وجو را تغییر دهید.</p><Button className="mt-5" onClick={openCreate}><Plus className="h-4 w-4" /> افزودن منبع</Button></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1020px] text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">منبع</th><th className="px-5 py-3 font-medium">نوع</th><th className="px-5 py-3 font-medium">فیلتر کلمات</th><th className="px-5 py-3 font-medium">کاربرد</th><th className="px-5 py-3 font-medium">پایش</th><th className="px-5 py-3 font-medium">وضعیت</th><th className="px-5 py-3 font-medium">عملیات</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleFeeds.map((feed) => {
                    const meta = PURPOSES[feed.purpose] ?? PURPOSES['news-room'];
                    const sourceMeta = SOURCE_TYPES[feed.sourceType || 'rss'] || SOURCE_TYPES.rss;
                    const SourceIcon = sourceMeta.icon;
                    const PurposeIcon = meta.icon;
                    const isPlatform = feed.scope === 'platform';
                    return (
                      <tr key={`${feed.scope || 'tenant'}-${feed.id}`} className="transition hover:bg-slate-50/80">
                        <td className="px-5 py-4"><div className="flex items-center gap-2"><div className="font-semibold text-slate-900">{feed.name}</div>{isPlatform && <Badge variant="default">پیش‌فرض</Badge>}</div><div className="mt-1 max-w-md truncate text-xs text-slate-500" dir="ltr" title={feed.url}>{feed.url}</div>{feed.resolvedFeedUrl && <div className="mt-1 truncate text-xs text-emerald-700" dir="ltr">فید: {feed.resolvedFeedUrl}</div>}{feed.lastError && <div className="mt-1 text-xs text-red-600">{feed.lastError}</div>}{isPlatform && feed.platformEnabled === false && <div className="mt-1 text-xs text-amber-700">این منبع توسط مدیر کل غیرفعال شده است</div>}</td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700"><SourceIcon className="h-4 w-4" />{sourceMeta.label}</span></td>
                        <td className="px-5 py-4 text-xs text-slate-600">{feed.includeWords?.length ? <div>شامل: {feed.includeWords.join('، ')}</div> : null}{feed.excludeWords?.length ? <div>بدون: {feed.excludeWords.join('، ')}</div> : null}{!feed.includeWords?.length && !feed.excludeWords?.length ? '—' : null}</td>
                        <td className="px-5 py-4"><span className={cn('inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ring-1', meta.color)}><PurposeIcon className="h-4 w-4" />{meta.label}</span></td>
                        <td className="px-5 py-4 text-slate-600"><div>{feed.pollIntervalMinutes ? `هر ${feed.pollIntervalMinutes} دقیقه` : isPlatform ? 'مدیریت مرکزی' : 'طبق تنظیمات سازمان'}</div><div className="mt-1 text-xs text-slate-400">{feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleString('fa-IR') : 'هنوز پایش نشده'}</div></td>
                        <td className="px-5 py-4"><Badge variant={feed.enabled ? 'success' : 'default'}>{feed.enabled ? 'فعال' : 'متوقف'}</Badge></td>
                        <td className="px-5 py-4"><div className="flex items-center gap-1">{!isPlatform && <Button size="sm" variant="ghost" title="تست سلامت" isLoading={busy === `test-${feed.id}`} onClick={() => void testSource(feed)}><HeartPulse className="h-4 w-4 text-emerald-600" /></Button>}{!isPlatform && ['news-room', 'social-studio'].includes(feed.purpose) && <Button size="sm" variant="ghost" title="پایش دستی" isLoading={busy === `fetch-${feed.id}`} onClick={() => run(`fetch-${feed.id}`, async () => { const endpoint = feed.purpose === 'social-studio' ? `/publishing/social/feeds/${feed.id}/fetch` : `/publishing/feeds/${feed.id}/fetch`; await apiFetch(endpoint, { method: 'POST' }); setNotice({ type: 'success', text: `پایش «${feed.name}» انجام شد.` }); await refetch(); })}><RefreshCw className="h-4 w-4" /></Button>}{!isPlatform && <Button size="sm" variant="ghost" title="ویرایش" onClick={() => openEdit(feed)}><Pencil className="h-4 w-4" /></Button>}{isPlatform ? (isOwner ? <Button size="sm" variant="ghost" title={feed.enabled ? 'خاموش کردن' : 'روشن کردن'} disabled={feed.platformEnabled === false} onClick={() => run(`toggle-${feed.id}`, async () => { await apiFetch(`/publishing/platform-feeds/${feed.id}/toggle`, { method: 'POST', body: { enabled: !feed.enabled } }); await refetch(); })}><Power className={cn('h-4 w-4', feed.enabled ? 'text-emerald-600' : 'text-slate-400')} /></Button> : <span className="text-xs text-slate-400">فقط مالک</span>) : <Button size="sm" variant="ghost" title={feed.enabled ? 'توقف' : 'فعال‌سازی'} onClick={() => run(`toggle-${feed.id}`, async () => { await apiFetch(`/publishing/feeds/${feed.id}/toggle`, { method: 'POST' }); await refetch(); })}><Power className={cn('h-4 w-4', feed.enabled ? 'text-emerald-600' : 'text-slate-400')} /></Button>}{!isPlatform && <Button size="sm" variant="ghost" title="حذف" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { if (window.confirm(`منبع «${feed.name}» حذف شود؟`)) run(`delete-${feed.id}`, async () => { await apiFetch(`/publishing/feeds/${feed.id}`, { method: 'DELETE' }); setNotice({ type: 'success', text: 'منبع حذف شد.' }); await refetch(); }); }}><Trash2 className="h-4 w-4" /></Button>}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {modalOpen && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalOpen(false); }}>
            <form onSubmit={saveFeed} className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="text-xl font-bold text-slate-900">{editing ? 'ویرایش منبع' : 'افزودن منبع جدید'}</h2><p className="mt-1 text-sm text-slate-500">نوع منبع و محل استفاده از محتوای آن را مشخص کنید.</p></div><button type="button" aria-label="بستن" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={() => setModalOpen(false)}><X className="h-5 w-5" /></button></div>
              <div className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-2"><Input label="نام منبع" required placeholder="مثلاً خبرگزاری رسمی" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /><Input label={SOURCE_TYPES[form.sourceType].label} required dir="ltr" placeholder={SOURCE_TYPES[form.sourceType].placeholder} value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} /></div>
                <fieldset><legend className="mb-3 text-sm font-medium text-slate-700">نوع منبع</legend><div className="grid gap-3 sm:grid-cols-2">{(Object.entries(SOURCE_TYPES) as [SourceType, (typeof SOURCE_TYPES)[SourceType]][]).map(([key, item]) => { const Icon = item.icon; return <label key={key} className={cn('cursor-pointer rounded-2xl border p-4 transition', form.sourceType === key ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100' : 'border-slate-200 hover:border-slate-300')}><input type="radio" name="sourceType" value={key} checked={form.sourceType === key} onChange={() => setForm((current) => ({ ...current, sourceType: key }))} className="sr-only" /><Icon className={cn('h-5 w-5', form.sourceType === key ? 'text-primary-700' : 'text-slate-500')} /><span className="mt-3 block text-sm font-semibold text-slate-900">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span></label>; })}</div><p className="mt-3 text-xs leading-5 text-slate-500">برای آدرس سایت، سیستم تلاش می‌کند فید RSS/Atom/JSON مناسب را پیدا کند.</p></fieldset>
                <fieldset><legend className="mb-3 text-sm font-medium text-slate-700">این منبع برای کدام بخش استفاده می‌شود؟</legend><div className="grid gap-3 sm:grid-cols-3">{(Object.entries(PURPOSES) as [FeedPurpose, (typeof PURPOSES)[FeedPurpose]][]).map(([key, item]) => { const Icon = item.icon; return <label key={key} className={cn('cursor-pointer rounded-2xl border p-4 transition', form.purpose === key ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100' : 'border-slate-200 hover:border-slate-300')}><input type="radio" name="purpose" value={key} checked={form.purpose === key} onChange={() => setForm((current) => ({ ...current, purpose: key }))} className="sr-only" /><Icon className={cn('h-5 w-5', form.purpose === key ? 'text-primary-700' : 'text-slate-500')} /><span className="mt-3 block text-sm font-semibold text-slate-900">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span></label>; })}</div></fieldset>
                <div className="grid gap-4 sm:grid-cols-2"><Input label="کلمات اجباری (با ویرگول)" placeholder="فقط خبرهایی که حداقل یکی از این کلمات را دارند" value={form.includeWords} onChange={(event) => setForm((current) => ({ ...current, includeWords: event.target.value }))} /><Input label="کلمات ممنوع (با ویرگول)" placeholder="خبرهایی که این کلمات را دارند نادیده گرفته می‌شوند" value={form.excludeWords} onChange={(event) => setForm((current) => ({ ...current, excludeWords: event.target.value }))} /></div>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">فاصله پایش (دقیقه)<input type="number" min="5" max="1440" required dir="ltr" className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" value={form.pollIntervalMinutes} onChange={(event) => setForm((current) => ({ ...current, pollIntervalMinutes: event.target.value }))} /><span className="text-xs font-normal text-slate-500">بین ۵ دقیقه تا ۲۴ ساعت</span></label>
                <fieldset><legend className="mb-3 text-sm font-medium text-slate-700">اتوماسیون اختصاصی این منبع</legend><div className="grid gap-3 sm:grid-cols-2">{[
                  ['autoPoll', 'پایش خودکار', 'منبع طبق فاصله زمانی بالا به‌صورت خودکار بررسی شود.'],
                  ['autoPrepare', 'آماده‌سازی خودکار', 'مطالب جدید بدون دخالت کاربر آماده شوند.'],
                  ['autoPublish', 'انتشار خودکار', form.purpose === 'social-studio' ? 'مطالب آماده در شبکه‌های اجتماعی منتشر شوند.' : 'خبر آماده در سایت منتشر شود.'],
                  ['autoSendSocial', 'ارسال خودکار به استودیوی اجتماعی', 'خبر آماده برای انتشار در شبکه‌های اجتماعی ارسال شود.'],
                ].map(([key, label, description]) => { const field = key as keyof Pick<FeedForm, 'autoPoll' | 'autoPrepare' | 'autoPublish' | 'autoSendSocial'>; const disabled = form.purpose === 'social-studio' && field === 'autoSendSocial'; return <label key={key} className={cn('flex items-start gap-3 rounded-2xl border p-4', disabled ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'cursor-pointer border-slate-200 hover:border-primary-300')}><input type="checkbox" disabled={disabled} checked={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600" /><span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{disabled ? 'برای این کاربرد قابل استفاده نیست.' : description}</span></span></label>; })}</div><p className="mt-3 text-xs leading-5 text-slate-500">تنظیمات هر منبع بر تنظیمات عمومی سازمان اولویت دارد. منابع قدیمی که تنظیم اختصاصی ندارند، از تنظیمات عمومی استفاده می‌کنند.</p></fieldset>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4"><Button type="button" variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button><Button type="submit" isLoading={busy === 'save'}>{editing ? 'ذخیره تغییرات' : 'افزودن منبع'}</Button></div>
            </form>
          </div>
        )}
        {healthOpen && health && (
          <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setHealthOpen(false); }}>
            <section className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl" dir="rtl">
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><div className="flex items-center gap-2"><HeartPulse className="h-5 w-5 text-emerald-600" /><h2 className="text-xl font-bold text-slate-900">تست سلامت منبع</h2></div><p className="mt-1 text-sm text-slate-500">۵ مطلب آخر «{health.source.name}»</p><p className="mt-1 truncate text-xs text-slate-400" dir="ltr">{health.source.url}</p></div><button type="button" aria-label="بستن" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={() => setHealthOpen(false)}><X className="h-5 w-5" /></button></div>
              <div className="max-h-[62vh] space-y-3 overflow-y-auto p-6">{health.items.length ? health.items.map((item) => <article key={item.url} className="rounded-2xl border border-slate-200 p-4"><div className="flex gap-4">{item.featuredImageUrl && <img src={item.featuredImageUrl} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover" />}<div className="min-w-0 flex-1"><h3 className="font-semibold leading-6 text-slate-900">{item.title}</h3><p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">{item.summary || 'بدون خلاصه'}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">{item.publishedAt && <span>{new Date(item.publishedAt).toLocaleString('fa-IR')}</span>}<a href={item.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">مشاهده منبع</a></div></div></div></article>) : <div className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-800">منبع پاسخ داد اما مطلبی برای نمایش پیدا نشد.</div>}</div>
              <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-4"><Button type="button" onClick={() => setHealthOpen(false)}>بستن</Button></div>
            </section>
          </div>
        )}
      </main>
    </ProtectedLayout>
  );
}
