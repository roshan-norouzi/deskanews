'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, Newspaper, RefreshCw, Rss, Search, Send, Settings2, Share2, Trash2 } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, cn } from '@/lib/utils';
import { formatPersianDigits } from '@deska/shared';

type NewsStatus = 'new' | 'processing' | 'ready' | 'rejected' | 'publishing' | 'published' | 'failed' | 'publish_failed' | 'social_processing' | 'social_sent' | 'social_failed';

interface Feed { id: string; name: string; purpose: string; enabled: boolean }
interface Article {
  id: string;
  feedId: string | null;
  originalUrl: string;
  originalTitle: string;
  originalSummary: string;
  titleFa: string;
  summaryFa: string;
  sourceName: string;
  status: NewsStatus;
  publishedAtSource: string | null;
  rejectedAt: string | null;
  purgeAfter: string | null;
  publishedAt: string | null;
  wordpressPostUrl: string;
  featuredImageUrl: string | null;
  lastError: string;
}

const STATUS: Record<NewsStatus, { label: string; badge: BadgeProps['variant'] }> = {
  new: { label: 'در صف آماده‌سازی', badge: 'default' },
  processing: { label: 'در حال آماده‌سازی متناسب با زبان', badge: 'info' },
  ready: { label: 'آماده بررسی', badge: 'success' },
  rejected: { label: 'رد شده', badge: 'danger' },
  publishing: { label: 'در حال انتشار', badge: 'info' },
  published: { label: 'منتشر شده', badge: 'success' },
  failed: { label: 'خطای آماده‌سازی', badge: 'danger' },
  publish_failed: { label: 'خطای انتشار', badge: 'danger' },
  social_processing: { label: 'در حال ارسال به استودیو', badge: 'info' },
  social_sent: { label: 'ارسال‌شده به استودیوی اجتماعی', badge: 'success' },
  social_failed: { label: 'خطای ارسال به استودیو', badge: 'danger' },
};

type Filter = 'active' | 'queued' | NewsStatus | 'all';

export default function NewsPage() {
  const feedsApi = useApi<Feed[]>('/publishing/feeds');
  const articlesApi = useApi<Article[]>('/publishing/news/articles');
  const { data: feedData } = feedsApi;
  const { data: articleData, execute: executeArticles } = articlesApi;
  const [status, setStatus] = useState<Filter>('active');
  const [feedId, setFeedId] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => { void executeArticles(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [executeArticles]);

  const feeds = useMemo(() => Array.isArray(feedData) ? feedData.filter((feed) => feed.purpose === 'news-room') : [], [feedData]);
  const articles = useMemo(() => Array.isArray(articleData) ? articleData : [], [articleData]);
  const rows = useMemo(() => articles.filter((article) => {
    const statusMatches = status === 'all'
      || (status === 'active' ? !['rejected', 'published', 'social_sent'].includes(article.status) : status === 'queued' ? ['new', 'processing', 'social_processing'].includes(article.status) : article.status === status);
    const feedMatches = !feedId || article.feedId === feedId;
    const normalized = query.trim().toLocaleLowerCase('fa');
    const queryMatches = !normalized || `${article.titleFa} ${article.originalTitle} ${article.sourceName}`.toLocaleLowerCase('fa').includes(normalized);
    return statusMatches && feedMatches && queryMatches;
  }), [articles, feedId, query, status]);

  async function run(key: string, operation: () => Promise<unknown>, success: string) {
    setBusy(key); setNotice(null);
    try { await operation(); setNotice({ type: 'success', text: success }); await articlesApi.refetch(); }
    catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'عملیات انجام نشد؛ دوباره تلاش کنید.' }); }
    finally { setBusy(null); }
  }

  async function syncNews() {
    await run('sync', () => apiFetch('/publishing/news/sync', { method: 'POST' }), 'فیدهای اتاق خبر پایش شدند؛ خبرهای جدید بر اساس تنظیمات اتوماسیون پردازش می‌شوند.');
  }

  const cards: Array<{ key: Filter; label: string; count: number; tone: string }> = [
    { key: 'active', label: 'جریان فعال', count: articles.filter((item) => !['rejected', 'published', 'social_sent'].includes(item.status)).length, tone: 'text-slate-900' },
    { key: 'ready', label: 'آماده بررسی', count: articles.filter((item) => item.status === 'ready').length, tone: 'text-emerald-700' },
    { key: 'queued', label: 'در حال پردازش', count: articles.filter((item) => ['new', 'processing'].includes(item.status)).length, tone: 'text-blue-700' },
    { key: 'rejected', label: 'ردشده‌ها', count: articles.filter((item) => item.status === 'rejected').length, tone: 'text-red-700' },
    { key: 'social_sent', label: 'ارسال به استودیو', count: articles.filter((item) => item.status === 'social_sent').length, tone: 'text-violet-700' },
    { key: 'published', label: 'منتشرشده‌ها', count: articles.filter((item) => item.status === 'published').length, tone: 'text-violet-700' },
  ];

  return (
    <ProtectedLayout title="اتاق خبر">
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
        <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl shadow-slate-900/10 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Newspaper className="h-6 w-6" /></span><div><h1 className="text-2xl font-bold">اتاق خبر</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">مدیریت خبرها و فرایند انتشار.</p></div></div>
          <div className="flex flex-wrap gap-2"><Link href="/publishing/feeds" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"><Rss className="h-4 w-4" /> مدیریت فیدها</Link><Link href="/publishing/settings" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"><Settings2 className="h-4 w-4" /> تنظیمات</Link><Button variant="ghost" className="border border-red-300/40 text-red-100 hover:bg-red-500/20" isLoading={busy === 'delete-all'} onClick={() => { if (window.confirm('همه خبرهای اتاق خبر برای همیشه حذف شوند؟ فیدها و تنظیمات باقی می‌مانند و در پایش بعدی خبرها دوباره دریافت می‌شوند.')) void run('delete-all', () => apiFetch('/publishing/news/articles', { method: 'DELETE' }), 'همه خبرهای اتاق خبر حذف شدند؛ در پایش بعدی دوباره دریافت می‌شوند.'); }}><Trash2 className="h-4 w-4" /> حذف همه مطالب</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" isLoading={busy === 'sync'} onClick={syncNews}><RefreshCw className="h-4 w-4" /> دریافت خبرهای جدید</Button></div>
        </header>

        {notice && <div role="status" className={cn('rounded-2xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}
        {articlesApi.error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">دریافت خبرها انجام نشد: {articlesApi.error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {cards.map((card) => <button type="button" key={card.key} onClick={() => setStatus(card.key)} className={cn('rounded-2xl border bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', status === card.key ? 'border-primary-400 ring-2 ring-primary-100' : 'border-slate-200')}><div className={cn('text-2xl font-bold', card.tone)}>{formatPersianDigits(card.count)}</div><div className="mt-1 text-sm text-slate-500">{card.label}</div></button>)}
        </section>

        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">وضعیت<select className="rounded-xl border px-3 py-2.5" value={status} onChange={(event) => setStatus(event.target.value as Filter)}><option value="active">جریان فعال</option><option value="queued">در صف یا در حال پردازش</option><option value="all">همه خبرها</option>{Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">فید<select className="rounded-xl border px-3 py-2.5" value={feedId} onChange={(event) => setFeedId(event.target.value)}><option value="">همه فیدهای اتاق خبر</option>{feeds.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}{feed.enabled ? '' : ' (متوقف)'}</option>)}</select></label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">جست‌وجو<div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="w-full rounded-xl border py-2.5 pl-3 pr-10" placeholder="عنوان یا نام رسانه..." value={query} onChange={(event) => setQuery(event.target.value)} /></div></label>
          </div>
        </Card>

        <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">{status === 'rejected' ? 'خبرهای ردشده' : status === 'published' ? 'خبرهای منتشرشده' : status === 'social_sent' ? 'خبرهای ارسال‌شده به استودیوی اجتماعی' : 'خبرها'}</h2><span className="text-sm text-slate-500">{rows.length} خبر</span></div>
        {articlesApi.isLoading && !articlesApi.data ? <div className="grid min-h-64 place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div> : rows.length === 0 ? <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Newspaper className="h-8 w-8" /></span><h3 className="mt-4 font-bold text-slate-900">خبری در این بخش نیست</h3><p className="mt-2 text-sm text-slate-500">فیدهای اتاق خبر را اضافه کنید یا «دریافت خبرهای جدید» را بزنید.</p></Card> : (
          <section className="grid gap-4 xl:grid-cols-2">
            {rows.map((article) => {
              const meta = STATUS[article.status] ?? { label: article.status, badge: 'default' as const };
              const canReject = !['rejected', 'publishing', 'published', 'social_processing', 'social_sent'].includes(article.status);
              const canSummarize = ['new', 'ready', 'failed'].includes(article.status);
              const canPublish = ['ready', 'publish_failed'].includes(article.status);
              const canSendToSocial = ['ready', 'publish_failed', 'social_failed'].includes(article.status);
              return <article key={article.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                {article.featuredImageUrl && <div className="mb-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-100"><img src={article.featuredImageUrl} alt="تصویر شاخص خبر" className="h-48 w-full object-cover" loading="lazy" /></div>}
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words text-lg font-bold leading-8 text-slate-900">{article.titleFa || article.originalTitle}</h3><p className="mt-2 text-xs text-slate-500">منبع: {article.sourceName || 'نامشخص'} · {article.publishedAtSource ? new Date(article.publishedAtSource).toLocaleString('fa-IR') : 'بدون تاریخ منبع'}</p></div><Badge variant={meta.badge}>{meta.label}</Badge></div>
                <p className="mt-4 flex-1 whitespace-pre-line leading-8 text-slate-700">{article.summaryFa || (article.status === 'processing' ? 'در حال تشخیص زبان و آماده‌سازی خبر...' : article.originalSummary || 'خلاصه‌ای برای این خبر ثبت نشده است.')}</p>
                {article.lastError && <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700"><AlertCircle className="mt-1 h-4 w-4 shrink-0" />{article.lastError}</div>}
                {article.status === 'rejected' && article.purgeAfter && <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><Clock3 className="h-4 w-4" />حذف خودکار در {new Date(article.purgeAfter).toLocaleString('fa-IR')}</div>}
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  <a className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50" href={article.originalUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> منبع اصلی</a>
                  {canSummarize && <Button size="sm" variant="outline" isLoading={busy === `summarize-${article.id}`} onClick={() => run(`summarize-${article.id}`, () => apiFetch(`/publishing/news/articles/${article.id}/summarize`, { method: 'POST' }), 'تیتر و خلاصهٔ خبر متناسب با زبان آن آماده شد.')}><RefreshCw className="h-4 w-4" />{article.status === 'ready' ? 'آماده‌سازی دوباره' : 'آماده‌سازی خبر'}</Button>}
                  {canSendToSocial && <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50" isLoading={busy === `social-${article.id}`} onClick={() => run(`social-${article.id}`, () => apiFetch(`/publishing/news/articles/${article.id}/send-to-social`, { method: 'POST' }), 'خبر با تیتر و خلاصه کوتاه در استودیوی اجتماعی آماده شد.')}><Share2 className="h-4 w-4" /> ارسال به استودیوی اجتماعی</Button>}
                  {canPublish && <Button size="sm" isLoading={busy === `publish-${article.id}`} onClick={() => { if (window.confirm('متن کامل خبر از منبع خوانده، بر اساس زبان ترجمه یا بازنویسی و در WordPress ارسال شود؟')) void run(`publish-${article.id}`, () => apiFetch(`/publishing/news/articles/${article.id}/publish`, { method: 'POST' }), 'خبر با موفقیت به WordPress ارسال شد.'); }}><Send className="h-4 w-4" />{article.status === 'publish_failed' ? 'تلاش دوباره برای انتشار' : 'انتشار در سایت'}</Button>}
                  {canReject && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" isLoading={busy === `reject-${article.id}`} onClick={() => { if (window.confirm('این خبر رد شود؟ خبر پس از ۳ روز برای همیشه حذف خواهد شد.')) void run(`reject-${article.id}`, () => apiFetch(`/publishing/news/articles/${article.id}/reject`, { method: 'POST' }), 'خبر به بخش ردشده‌ها منتقل شد.'); }}><Trash2 className="h-4 w-4" /> رد خبر</Button>}
                  {article.status === 'social_sent' && <Link className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100" href="/publishing/social"><CheckCircle2 className="h-4 w-4" /> مشاهده در استودیوی اجتماعی</Link>}
                  {article.wordpressPostUrl && <a className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700" href={article.wordpressPostUrl} target="_blank" rel="noreferrer"><CheckCircle2 className="h-4 w-4" /> مشاهده در سایت</a>}
                </div>
              </article>;
            })}
          </section>
        )}
      </main>
    </ProtectedLayout>
  );
}
