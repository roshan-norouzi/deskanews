'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, CalendarDays, CheckCircle2, Copy, ExternalLink, FileBarChart2, Plus, RefreshCw, RotateCcw, Rss, Search, Sparkles, Trash2, XCircle } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch } from '@/lib/utils';
import { formatPersianDigits } from '@deska/shared';

type Feed = { id: string; name: string; url: string; enabled: boolean; lastFetchedAt: string | null; lastError: string };
type Article = { id: string; originalTitle: string; originalUrl: string; canonicalUrl: string; originalSummary: string; sourceName: string; publishedAtSource: string | null; featuredImageUrl: string; status: string; feed: { id: string; name: string } | null };
type ReportItem = { id: string; articleId: string | null; originalTitle: string; originalUrl: string; englishTitle: string; sourceName: string; sourcePublishedAt: string | null; segment: string; sourceTier: string; bullets: unknown; status: string; lastError: string };
type ReportDecision = { articleId: string; decision: string };
type Report = { id: string; reportDate: string; status: string; archivedAt: string | null; items: ReportItem[]; decisions: ReportDecision[] };
type Overview = { feeds: Feed[]; reports: Report[]; articles: Article[]; addedArticles: Article[]; rejectedArticles: Article[]; activeReportId: string };
type Notice = { type: 'success' | 'error'; text: string } | null;
type ArticleFilter = 'active' | 'added' | 'rejected' | 'all';

function englishDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function reportDateLabel(value: string): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function bulletsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] || character);
}

function safeHttpUrl(value: string): string {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''; }
  catch { return ''; }
}

function outlookContent(report: Report): { html: string; text: string } {
  const date = englishDate(report.reportDate);
  const htmlItems = report.items.map((item) => {
    const title = escapeHtml(item.englishTitle || item.originalTitle);
    const url = safeHttpUrl(item.originalUrl);
    const headline = url ? `<a href="${escapeHtml(url)}" style="color:#1e40af;text-decoration:underline"><strong>${title}</strong></a>` : `<strong>${title}</strong>`;
    const metadata = [item.sourceName || 'Unknown source', englishDate(item.sourcePublishedAt), item.segment || 'Neutral', item.sourceTier || 'Tier 1'].map(escapeHtml).join(' | ');
    const bullets = bulletsOf(item.bullets).map((bullet) => `<li style="margin:0 0 6px 0">${escapeHtml(bullet)}</li>`).join('');
    return `<div style="margin:0 0 22px 0"><p style="margin:0 0 4px 0;font-size:16px">${headline}</p><p style="margin:0 0 8px 0;color:#475569">${metadata}</p><ul style="margin:0;padding-left:24px">${bullets}</ul></div>`;
  }).join('');
  const textItems = report.items.map((item) => {
    const headline = item.englishTitle || item.originalTitle;
    const metadata = `${item.sourceName || 'Unknown source'} | ${englishDate(item.sourcePublishedAt)} | ${item.segment || 'Neutral'} | ${item.sourceTier || 'Tier 1'}`;
    const bullets = bulletsOf(item.bullets).map((bullet) => `- ${bullet}`).join('\n');
    return `${headline}\n${item.originalUrl}\n${metadata}\n${bullets}`;
  }).join('\n\n');
  return {
    html: `<div dir="ltr" style="font-family:Arial,sans-serif;color:#0f172a"><h2 style="margin:0 0 4px 0">Daily News Report</h2><p style="margin:0 0 20px 0;color:#64748b">${escapeHtml(date)}</p>${htmlItems}</div>`,
    text: `Daily News Report\n${date}\n\n${textItems}`,
  };
}

export default function DailyReportPage() {
  const overviewApi = useApi<Overview>('/publishing/daily-reports/overview', { cache: 'no-store' });
  const [selectedReportId, setSelectedReportId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [statusFilter, setStatusFilter] = useState<ArticleFilter>('active');
  const [feedId, setFeedId] = useState('');
  const [query, setQuery] = useState('');
  const rawData = overviewApi.data;
  const data = useMemo(() => {
    if (!rawData) return undefined;
    const source = statusFilter === 'active'
      ? rawData.articles
      : statusFilter === 'added'
        ? rawData.addedArticles
        : statusFilter === 'rejected'
          ? rawData.rejectedArticles
          : [...rawData.articles, ...rawData.addedArticles, ...rawData.rejectedArticles];
    const normalizedQuery = query.trim().toLocaleLowerCase('fa');
    const articles = source.filter((article) => {
      const feedMatches = !feedId || article.feed?.id === feedId;
      const queryMatches = !normalizedQuery || `${article.originalTitle} ${article.sourceName} ${article.feed?.name || ''}`.toLocaleLowerCase('fa').includes(normalizedQuery);
      return feedMatches && queryMatches;
    });
    return { ...rawData, articles, rejectedArticles: [] };
  }, [feedId, query, rawData, statusFilter]);

  useEffect(() => {
    if (!selectedReportId && data?.activeReportId) setSelectedReportId(data.activeReportId);
    if (selectedReportId && data && !data.reports.some((report) => report.id === selectedReportId)) setSelectedReportId(data.activeReportId || data.reports[0]?.id || '');
  }, [data, selectedReportId]);

  const selectedReport = data?.reports.find((report) => report.id === selectedReportId) || data?.reports.find((report) => report.id === data.activeReportId) || data?.reports[0];
  const selectedArticleIds = useMemo(() => new Set([
    ...(selectedReport?.items.map((item) => item.articleId).filter(Boolean) || []),
    ...(rawData?.addedArticles.map((article) => article.id) || []),
  ]), [rawData?.addedArticles, selectedReport]);
  const rejectedArticleIds = useMemo(() => new Set(rawData?.rejectedArticles.map((article) => article.id) || []), [rawData?.rejectedArticles]);
  const isArchived = selectedReport?.status === 'archived';
  const canCopy = Boolean(selectedReport?.items.length && selectedReport.items.every((item) => item.status === 'ready'));

  async function run<T>(key: string, operation: () => Promise<T>, success: string): Promise<T | null> {
    setBusy(key); setNotice(null);
    try { const result = await operation(); setNotice({ type: 'success', text: success }); await overviewApi.refetch(); return result; }
    catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'عملیات انجام نشد.' }); return null; }
    finally { setBusy(null); }
  }

  async function createReport() {
    const reportDate = window.prompt('تاریخ گزارش را به میلادی و با قالب YYYY-MM-DD وارد کنید:', new Date().toISOString().slice(0, 10));
    if (!reportDate) return;
    const report = await run<{ id: string }>('create-report', () => apiFetch('/publishing/daily-reports', { method: 'POST', body: { reportDate } }), 'گزارش جدید ایجاد شد.');
    if (report?.id) setSelectedReportId(report.id);
  }

  async function editReport() {
    if (!selectedReport) return;
    const reportDate = window.prompt('تاریخ جدید گزارش را به میلادی و با قالب YYYY-MM-DD وارد کنید:', selectedReport.reportDate.slice(0, 10));
    if (!reportDate) return;
    await run(`edit-report-${selectedReport.id}`, () => apiFetch(`/publishing/daily-reports/${selectedReport.id}`, { method: 'PATCH', body: { reportDate } }), 'تاریخ گزارش ویرایش شد.');
  }

  async function deleteReport() {
    if (!selectedReport || !window.confirm(`گزارش ${reportDateLabel(selectedReport.reportDate)} و همه اقلام داخل آن برای همیشه حذف شوند؟`)) return;
    const deleted = await run(`delete-report-${selectedReport.id}`, () => apiFetch(`/publishing/daily-reports/${selectedReport.id}`, { method: 'DELETE' }), 'گزارش حذف شد.');
    if (deleted) setSelectedReportId('');
  }

  async function addArticle(articleId: string) {
    if (!selectedReport) { setNotice({ type: 'error', text: 'ابتدا یک گزارش ایجاد یا انتخاب کنید.' }); return; }
    if (isArchived) { setNotice({ type: 'error', text: 'گزارش آرشیوشده قابل تغییر نیست.' }); return; }
    await run(`add-${articleId}`, () => apiFetch(`/publishing/daily-reports/${selectedReport.id}/items`, { method: 'POST', body: { articleId } }), 'خبر به گزارش اضافه شد.');
  }

  async function rejectArticle(articleId: string) {
    if (!selectedReport || isArchived) return;
    await run(`reject-${articleId}`, () => apiFetch(`/publishing/daily-reports/${selectedReport.id}/articles/${articleId}/reject`, { method: 'POST' }), 'خبر برای این گزارش رد شد.');
  }

  async function restoreArticle(articleId: string) {
    if (!selectedReport || isArchived) return;
    await run(`restore-${articleId}`, () => apiFetch(`/publishing/daily-reports/${selectedReport.id}/articles/${articleId}/reject`, { method: 'DELETE' }), 'خبر به فهرست بررسی بازگردانده شد.');
  }

  async function copyForOutlook() {
    if (!selectedReport || !canCopy) return;
    setBusy('copy-outlook'); setNotice(null);
    try {
      const content = outlookContent(selectedReport);
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([content.html], { type: 'text/html' }),
          'text/plain': new Blob([content.text], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(content.text);
      }
      setNotice({ type: 'success', text: 'گزارش با قالب مناسب Outlook کپی شد؛ اکنون آن را در متن ایمیل Paste کنید.' });
    } catch {
      setNotice({ type: 'error', text: 'مرورگر اجازه کپی گزارش را نداد. دسترسی Clipboard را برای این سایت فعال کنید.' });
    } finally { setBusy(null); }
  }

  return <ProtectedLayout title="دیلی ریپورت"><main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
    <header className="flex flex-col gap-5 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-amber-950 p-6 text-white shadow-xl shadow-slate-900/10 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><FileBarChart2 className="h-6 w-6" /></span><div><h1 className="text-2xl font-bold">دیلی ریپورت</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">ایجاد و مدیریت گزارش‌های روزانه.</p></div></div><div className="flex flex-wrap gap-2"><Link href="/publishing/feeds" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm hover:bg-white/15"><Rss className="h-4 w-4" /> مدیریت فیدها</Link><Button className="bg-white text-slate-900 hover:bg-slate-100" isLoading={busy === 'sync'} onClick={() => void run('sync', () => apiFetch('/publishing/daily-reports/sync', { method: 'POST' }), 'خبرهای جدید فیدهای دیلی ریپورت دریافت شدند.')}><RefreshCw className="h-4 w-4" /> دریافت خبرها</Button><Button className="bg-amber-500 text-slate-950 hover:bg-amber-400" isLoading={busy === 'create-report'} onClick={() => void createReport()}><CalendarDays className="h-4 w-4" /> ایجاد گزارش</Button></div></header>
    {notice && <div role="status" className={`rounded-2xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>}
    {overviewApi.error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">دریافت اطلاعات دیلی ریپورت انجام نشد: {overviewApi.error}</div>}
    <section className="grid gap-3 sm:grid-cols-3"><Card className="p-4"><div className="text-2xl font-bold text-amber-700">{formatPersianDigits(data?.feeds.filter((feed) => feed.enabled).length || 0)}</div><div className="mt-1 text-sm text-slate-500">فید فعال گزارش</div></Card><Card className="p-4"><div className="text-2xl font-bold text-slate-900">{formatPersianDigits(data?.articles.length || 0)}</div><div className="mt-1 text-sm text-slate-500">خبر دریافت‌شده</div></Card><Card className="p-4"><div className="text-2xl font-bold text-emerald-700">{formatPersianDigits(data?.reports.length || 0)}</div><div className="mt-1 text-sm text-slate-500">گزارش تاریخ‌دار</div></Card></section>
    <Card className="p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-bold text-slate-900">گزارش‌های روزانه</h2><p className="mt-1 text-sm text-slate-500">گزارش‌ها فقط با اقدام شما ایجاد، ویرایش یا حذف می‌شوند.</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-end">{data?.reports.length ? <label className="grid min-w-64 gap-1 text-xs font-medium text-slate-500">انتخاب گزارش<select className="rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900" value={selectedReport?.id || ''} onChange={(event) => setSelectedReportId(event.target.value)}>{data.reports.map((report) => <option key={report.id} value={report.id}>{reportDateLabel(report.reportDate)} · {report.status === 'ready' ? 'آماده' : 'پیش‌نویس'}</option>)}</select></label> : null}<div className="flex gap-2">{selectedReport && <Button variant="outline" isLoading={busy === `edit-report-${selectedReport.id}`} onClick={() => void editReport()}><CalendarDays className="h-4 w-4" /> ویرایش تاریخ</Button>}{selectedReport && <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" isLoading={busy === `delete-report-${selectedReport.id}`} onClick={() => void deleteReport()}><Trash2 className="h-4 w-4" /> حذف گزارش</Button>}</div></div></div></Card>
    <Card className="p-4"><div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1.5 text-sm font-medium text-slate-700">وضعیت<select className="rounded-xl border px-3 py-2.5" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ArticleFilter)}><option value="active">جریان فعال</option><option value="added">افزوده شده</option><option value="rejected">رد شده</option><option value="all">همه خبرها</option></select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">فید<select className="rounded-xl border px-3 py-2.5" value={feedId} onChange={(event) => setFeedId(event.target.value)}><option value="">همه فیدهای دیلی ریپورت</option>{rawData?.feeds.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}{feed.enabled ? '' : ' (متوقف)'}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">جست‌وجو<div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="w-full rounded-xl border py-2.5 pl-3 pr-10" placeholder="عنوان یا نام رسانه..." value={query} onChange={(event) => setQuery(event.target.value)} /></div></label></div></Card>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">{statusFilter === 'added' ? 'خبرهای افزوده‌شده' : statusFilter === 'rejected' ? 'خبرهای ردشده' : statusFilter === 'all' ? 'همه خبرها' : 'جریان فعال'}</h2><p className="mt-1 text-sm text-slate-500">{statusFilter === 'added' ? 'این خبرها قبلاً به گزارش افزوده شده‌اند.' : statusFilter === 'rejected' ? 'خبرهای این وضعیت پس از ۳ روز به‌صورت خودکار حذف می‌شوند.' : 'برای خبرهای ۲۴ ساعت گذشته، افزودن یا ردکردن را انتخاب کنید.'}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{formatPersianDigits(data?.articles.length || 0)} خبر</span></div>
        {!data?.articles.length ? <Card className="grid min-h-44 place-items-center p-6 text-center text-sm text-slate-500"><div><Rss className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3">هنوز خبری از فیدهای دیلی ریپورت دریافت نشده است.</p></div></Card> : <div className="max-h-[70rem] space-y-3 overflow-auto pl-1">{data.articles.map((article) => { const added = selectedArticleIds.has(article.id); const rejected = rejectedArticleIds.has(article.id); return <article key={article.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${rejected ? 'border-slate-200 opacity-60' : added ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-slate-200'}`}><div className="flex gap-3">{article.featuredImageUrl && <img src={article.featuredImageUrl} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" loading="lazy" />}<div className="min-w-0 flex-1"><a href={article.originalUrl || article.canonicalUrl} target="_blank" rel="noreferrer" className="font-bold leading-7 text-slate-900 hover:text-blue-700">{article.originalTitle}</a><p className="mt-1 text-xs text-slate-500">{article.sourceName || article.feed?.name || 'منبع نامشخص'} · {article.publishedAtSource ? englishDate(article.publishedAtSource) : 'تاریخ نامشخص'}</p></div></div>{article.originalSummary && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{article.originalSummary}</p>}<div className="mt-3 flex flex-wrap justify-end gap-2">{rejected ? <Button size="sm" variant="outline" disabled={!selectedReport || isArchived} isLoading={busy === `restore-${article.id}`} onClick={() => void restoreArticle(article.id)}><RotateCcw className="h-4 w-4" /> بازگردانی</Button> : <><Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={added || !selectedReport || isArchived} isLoading={busy === `reject-${article.id}`} onClick={() => void rejectArticle(article.id)}><XCircle className="h-4 w-4" /> رد خبر</Button><Button size="sm" variant={added ? 'secondary' : 'outline'} disabled={added || !selectedReport || isArchived} isLoading={busy === `add-${article.id}`} onClick={() => void addArticle(article.id)}><Plus className="h-4 w-4" />{added ? 'افزوده شده' : 'افزودن به گزارش'}</Button></>}</div></article>; })}</div>}
      </section>
      <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">خروجی گزارش نهایی</h2><p className="mt-1 text-sm text-slate-500">{selectedReport ? `گزارش ${reportDateLabel(selectedReport.reportDate)}${isArchived ? ' · آرشیو شده' : ''}` : 'هنوز گزارشی انتخاب نشده است.'}</p></div>{selectedReport?.items.length ? <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!canCopy} isLoading={busy === 'copy-outlook'} onClick={() => void copyForOutlook()}><Copy className="h-4 w-4" /> کپی برای Outlook</Button>{!isArchived && <Button isLoading={busy === `prepare-all-${selectedReport.id}`} onClick={() => void run(`prepare-all-${selectedReport.id}`, () => apiFetch(`/publishing/daily-reports/${selectedReport.id}/prepare-all`, { method: 'POST' }), 'همه خبرهای گزارش آماده شدند.')}><Sparkles className="h-4 w-4" /> آماده‌سازی همه</Button>}</div> : null}</div>
        {!selectedReport ? <Card className="grid min-h-56 place-items-center p-6 text-center"><div><CalendarDays className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">گزارش فعال را باز کنید.</p></div></Card> : !selectedReport.items.length ? <Card className="grid min-h-56 place-items-center p-6 text-center"><div>{isArchived ? <Archive className="mx-auto h-8 w-8 text-slate-300" /> : <FileBarChart2 className="mx-auto h-8 w-8 text-slate-300" />}<p className="mt-3 text-sm text-slate-500">هنوز خبری به این گزارش اضافه نشده است.</p></div></Card> : <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" dir="ltr"><div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4"><div><h3 className="text-xl font-bold text-slate-950">Daily News Report</h3><p className="mt-1 text-sm text-slate-500">{englishDate(selectedReport.reportDate)}</p></div>{selectedReport.status === 'archived' ? <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"><Archive className="h-4 w-4" /> Archived</span> : selectedReport.status === 'ready' && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Ready</span>}</div><div className="space-y-7">{selectedReport.items.map((item) => { const bullets = bulletsOf(item.bullets); return <article key={item.id} className="border-b border-slate-100 pb-6 last:border-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><a href={item.originalUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-2 text-lg font-bold leading-7 text-blue-800 hover:underline">{item.englishTitle || item.originalTitle}<ExternalLink className="mt-1.5 h-4 w-4 shrink-0" /></a><p className="mt-1 text-sm font-medium text-slate-600">{item.sourceName || 'Unknown source'} | {englishDate(item.sourcePublishedAt)} | {item.segment || 'Neutral'} | {item.sourceTier || 'Tier 1'}</p></div>{!isArchived && <button type="button" title="Remove from report" className="rounded-lg p-2 text-red-600 hover:bg-red-50" disabled={busy === `remove-${item.id}`} onClick={() => void run(`remove-${item.id}`, () => apiFetch(`/publishing/daily-reports/${selectedReport.id}/items/${item.id}`, { method: 'DELETE' }), 'خبر از گزارش حذف شد.')}><Trash2 className="h-4 w-4" /></button>}</div>{item.status === 'ready' ? <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-800">{bullets.map((bullet, index) => <li key={`${item.id}-${index}`} className="flex gap-2"><span>-</span><span>{bullet}</span></li>)}</ul> : <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className={`text-sm ${item.status === 'failed' ? 'text-red-700' : 'text-slate-500'}`}>{item.status === 'processing' ? 'Preparing English report…' : item.status === 'failed' ? item.lastError || 'Preparation failed.' : 'This item has not been prepared yet.'}</p>{!isArchived && <Button className="mt-3" size="sm" variant="outline" isLoading={busy === `prepare-${item.id}`} onClick={() => void run(`prepare-${item.id}`, () => apiFetch(`/publishing/daily-reports/items/${item.id}/prepare`, { method: 'POST' }), 'خبر به قالب انگلیسی گزارش تبدیل شد.')}><Sparkles className="h-4 w-4" /> Prepare item</Button>}</div>}</article>; })}</div></div>}
      </section>
    </div>
  </main></ProtectedLayout>;
}
