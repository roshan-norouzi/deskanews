'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Archive, Check, Clock3, ExternalLink, Facebook, FileText, ImagePlus, Instagram, Linkedin, Pencil, RefreshCw, Rss, Send, Settings2, Share2, Trash2, UserRound, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, apiFetchBlob, cn, withBasePath } from '@/lib/utils';
import { parseTemplateLibrary, renderCoverToDataUrl, type CoverFont } from '@/components/publishing/cover-template-builder';
import { formatPersianDigits } from '@deska/shared';

type SocialStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'archived';
type Network = 'telegram' | 'instagram' | 'linkedin' | 'facebook';
type Notice = { type: 'success' | 'error'; text: string } | null;
type Settings = Record<string, string>;

interface Feed { id: string; name: string; url: string; enabled: boolean; lastFetchedAt: string | null; lastError: string }
interface Article {
  id: string; title: string; link: string; shortUrl: string | null; author: string | null; category: string | null;
  publishedAt: string | null; leadText: string | null; summaryText: string | null; captionText: string | null;
  readingTime: number | null; status: SocialStatus; lastError: string;
  feed: { id: string; name: string; enabled: boolean } | null; featuredImageUrl: string | null; generatedImageUrl: string | null; authorImageUrl: string | null;
}

const STATUS = {
  pending: { label: 'در صف آماده‌سازی', variant: 'default' as const },
  processing: { label: 'در حال استخراج', variant: 'info' as const },
  ready: { label: 'آماده انتشار', variant: 'success' as const },
  failed: { label: 'خطای آماده‌سازی', variant: 'danger' as const },
  archived: { label: 'آرشیوشده', variant: 'default' as const },
};
const NETWORKS: Array<{ id: Network; label: string; icon: typeof Send; color: string }> = [
  { id: 'telegram', label: 'تلگرام', icon: Send, color: 'bg-sky-600 hover:bg-sky-700' },
  { id: 'instagram', label: 'اینستاگرام', icon: Instagram, color: 'bg-pink-600 hover:bg-pink-700' },
  { id: 'linkedin', label: 'لینکدین', icon: Linkedin, color: 'bg-blue-700 hover:bg-blue-800' },
  { id: 'facebook', label: 'فیسبوک', icon: Facebook, color: 'bg-indigo-600 hover:bg-indigo-700' },
];

function isConfigured(settings: Settings, network: Network): boolean {
  if (network === 'telegram') return settings.telegram_bot_token_configured === 'true' && Boolean(settings.telegram_chat_id);
  if (network === 'instagram') return settings.social_instagram_access_token_configured === 'true' && Boolean(settings.social_instagram_account_id);
  if (network === 'linkedin') return settings.social_linkedin_access_token_configured === 'true' && Boolean(settings.social_linkedin_author_urn);
  return settings.social_facebook_page_access_token_configured === 'true' && Boolean(settings.social_facebook_page_id);
}

function displayImageUrl(url?: string | null): string {
  if (!url || /^(?:https?:|data:|blob:)/iu.test(url)) return url || '';
  const apiPath = url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : `/${url}`}`;
  return withBasePath(apiPath);
}

export default function SocialPage() {
  const feedsApi = useApi<Feed[]>('/publishing/social/feeds');
  const [showArchived, setShowArchived] = useState(false);
  const articlesApi = useApi<Article[]>(showArchived ? '/publishing/social/articles?status=archived' : '/publishing/social/articles');
  const settingsApi = useApi<Settings>('/publishing/settings', { cache: 'no-store' });
  const { data: feedData, execute: executeFeeds } = feedsApi;
  const { data: articleData, execute: executeArticles } = articlesApi;
  const feeds = useMemo(() => Array.isArray(feedData) ? feedData : [], [feedData]);
  const articles = useMemo(() => Array.isArray(articleData) ? articleData : [], [articleData]);
  const [filter, setFilter] = useState<'all' | SocialStatus>('all'); const [busy, setBusy] = useState<string | null>(null); const [notice, setNotice] = useState<Notice>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({}); const [leadDrafts, setLeadDrafts] = useState<Record<string, string>>({}); const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const serverCaptionsRef = useRef<Record<string, string>>({});
  const [editingTitle, setEditingTitle] = useState<string | null>(null); const [editingLead, setEditingLead] = useState<string | null>(null); const [publishArticle, setPublishArticle] = useState<Article | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({}); const [generationErrors, setGenerationErrors] = useState<Record<string, string>>({}); const [networkResults, setNetworkResults] = useState<Partial<Record<Network, string>>>({});
  const [selectedImageTemplateId, setSelectedImageTemplateId] = useState('');
  const imageTemplateLibrary = useMemo(() => parseTemplateLibrary(settingsApi.data?.social_image_templates, settingsApi.data?.social_image_template), [settingsApi.data?.social_image_template, settingsApi.data?.social_image_templates]);
  const selectedImageTemplate = imageTemplateLibrary.templates.find((item) => item.id === selectedImageTemplateId)
    || imageTemplateLibrary.templates.find((item) => item.id === imageTemplateLibrary.defaultTemplateId)
    || imageTemplateLibrary.templates[0];

  useEffect(() => { const timer = window.setInterval(() => { void executeArticles(); void executeFeeds(); }, 15_000); return () => window.clearInterval(timer); }, [executeArticles, executeFeeds]);
  useEffect(() => { setCaptions((current) => { const next = { ...current }; let changed = false; for (const article of articles) { const serverCaption = article.captionText || ''; const previousServerCaption = serverCaptionsRef.current[article.id]; if (!(article.id in next) || current[article.id] === previousServerCaption) { if (next[article.id] !== serverCaption) { next[article.id] = serverCaption; changed = true; } } serverCaptionsRef.current[article.id] = serverCaption; } return changed ? next : current; }); }, [articles]);
  const rows = useMemo(() => filter === 'all' ? articles : articles.filter((item) => item.status === filter), [articles, filter]);

  function toggleArchivedView() {
    setShowArchived((current) => !current);
    setFilter('all');
  }

  async function run<T>(key: string, operation: () => Promise<T>, success: string): Promise<T | undefined> { setBusy(key); setNotice(null); try { const result = await operation(); setNotice({ type: 'success', text: success }); await Promise.all([articlesApi.refetch(), feedsApi.refetch()]); return result; } catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'عملیات انجام نشد؛ دوباره تلاش کنید.' }); return undefined; } finally { setBusy(null); } }
  async function generateImage(article: Article) {
    const key = `generate-image-${article.id}`; setBusy(key); setNotice(null);
    try {
      const fonts = (() => { try { const parsed = JSON.parse(settingsApi.data?.social_font_library || '[]'); return Array.isArray(parsed) ? parsed as CoverFont[] : []; } catch { return []; } })();
      const image = await renderCoverToDataUrl(JSON.stringify(selectedImageTemplate.template), { title: article.title, link: article.link, shortUrl: article.shortUrl || undefined, author: article.author || undefined, category: article.category || undefined, summaryText: article.summaryText || undefined, featuredImageUrl: article.featuredImageUrl || undefined, authorImageUrl: article.authorImageUrl || undefined, feed: article.feed ? { name: article.feed.name } : undefined, leadText: article.leadText || undefined }, fonts);
      setGeneratedImages((current) => ({ ...current, [article.id]: image })); setGenerationErrors((current) => { const next = { ...current }; delete next[article.id]; return next; }); setNotice({ type: 'success', text: 'تصویر مطلب با موفقیت تولید شد.' });
    } catch (error) { const message = error instanceof Error ? error.message : 'تولید تصویر انجام نشد.'; setGenerationErrors((current) => ({ ...current, [article.id]: message })); setNotice({ type: 'error', text: message }); } finally { setBusy(null); }
  }
  async function blobToDataUrl(blob: Blob): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('تصویر شاخص قابل خواندن نیست.'));
      reader.onerror = () => reject(new Error('خواندن تصویر شاخص انجام نشد.'));
      reader.readAsDataURL(blob);
    });
  }
  async function normalizeFeaturedImage(blob: Blob): Promise<string> {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('فرمت تصویر شاخص در مرورگر قابل تبدیل نیست.'));
        element.src = objectUrl;
      });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('ابعاد تصویر شاخص معتبر نیست.');
      const maxSide = 3000;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(drawWidth, Math.ceil(drawHeight / 20));
      canvas.height = Math.max(drawHeight, Math.ceil(drawWidth / 20));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('تبدیل تصویر شاخص در مرورگر امکان‌پذیر نیست.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, Math.floor((canvas.width - drawWidth) / 2), Math.floor((canvas.height - drawHeight) / 2), drawWidth, drawHeight);
      const normalized = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('تبدیل تصویر شاخص انجام نشد.')),
        'image/jpeg',
        0.86,
      ));
      return blobToDataUrl(normalized);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  async function imageUrlToDataUrl(url: string, normalizeForPublishing = false): Promise<string> {
    if (url.startsWith('data:image/') && !normalizeForPublishing) return url;
    const blob = url.startsWith('data:image/')
      ? await fetch(url, { signal: AbortSignal.timeout(15_000) }).then((response) => response.blob())
      : /^https?:\/\//iu.test(url)
        ? await apiFetchBlob(`/publishing/proxy/image?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(15_000) })
        : await apiFetchBlob(url, { signal: AbortSignal.timeout(15_000), skipAuth: true, skipTenant: true });
    return normalizeForPublishing ? normalizeFeaturedImage(blob) : blobToDataUrl(blob);
  }
  async function publishImageDataUrl(article: Article): Promise<{ dataUrl: string; usedFeaturedFallback: boolean }> {
    const generatedSources = generationErrors[article.id]
      ? []
      : [generatedImages[article.id], article.generatedImageUrl].filter((value): value is string => Boolean(value));
    const sources = [...new Set([...generatedSources, article.featuredImageUrl].filter((value): value is string => Boolean(value)))];
    if (!sources.length) throw new Error('این مطلب تصویر شاخص ندارد؛ ابتدا تصویر شاخص اضافه کنید یا تصویر قالبی تولید کنید.');
    let lastError: unknown;
    for (const source of sources) {
      try {
        const featured = source === article.featuredImageUrl;
        return { dataUrl: await imageUrlToDataUrl(source, featured), usedFeaturedFallback: featured && (generatedSources.length > 0 || Boolean(generationErrors[article.id])) };
      } catch (error) { lastError = error; }
    }
    throw lastError instanceof Error ? lastError : new Error('تصویر مطلب قابل خواندن نیست.');
  }
  async function replaceFeaturedImage(article: Article, file?: File) {
    if (!file) return;
    const body = new FormData(); body.append('file', file);
    const updated = await run<Article>(`featured-image-${article.id}`, () => apiFetch<Article>(`/publishing/social/articles/${article.id}/featured-image`, { method: 'POST', body }), 'تصویر شاخص مطلب جایگزین شد.');
    if (!updated) return;
    setPublishArticle((current) => current?.id === updated.id ? { ...current, ...updated } : current);
    setGeneratedImages((current) => { const next = { ...current }; delete next[updated.id]; return next; });
    setGenerationErrors((current) => { const next = { ...current }; delete next[updated.id]; return next; });
  }
  async function removeFeaturedImage(article: Article) {
    const updated = await run<Article>(`remove-featured-image-${article.id}`, () => apiFetch<Article>(`/publishing/social/articles/${article.id}/featured-image`, { method: 'DELETE' }), 'تصویر شاخص مطلب حذف شد.');
    if (!updated) return;
    setPublishArticle((current) => current?.id === updated.id ? { ...current, ...updated } : current);
    setGeneratedImages((current) => { const next = { ...current }; delete next[updated.id]; return next; });
    setGenerationErrors((current) => { const next = { ...current }; delete next[updated.id]; return next; });
  }
  function selectImageTemplate(id: string) {
    setSelectedImageTemplateId(id);
    if (!publishArticle) return;
    setGeneratedImages((current) => { const next = { ...current }; delete next[publishArticle.id]; return next; });
    setGenerationErrors((current) => { const next = { ...current }; delete next[publishArticle.id]; return next; });
  }
  function openPublish(article: Article) { setPublishArticle(article); setNetworkResults({}); setSelectedImageTemplateId(imageTemplateLibrary.defaultTemplateId); setEditingTitle(null); setEditingLead(null); setTitleDrafts((current) => ({ ...current, [article.id]: article.title })); setLeadDrafts((current) => ({ ...current, [article.id]: article.leadText || '' })); }
  async function publishToNetwork(network: Network) {
    if (!publishArticle) return; const caption = (captions[publishArticle.id] ?? publishArticle.captionText ?? '').trim();
    if (!isConfigured(settingsApi.data || {}, network)) { setNotice({ type: 'error', text: `تنظیمات ${NETWORKS.find((item) => item.id === network)?.label} کامل نیست. از تب تنظیمات شبکه‌های اجتماعی استفاده کنید.` }); return; }
    const key = `publish-${network}-${publishArticle.id}`; setBusy(key); setNotice(null);
    try {
      const image = await publishImageDataUrl(publishArticle);
      const result = await apiFetch<{ message?: string }>(`/publishing/social/articles/${publishArticle.id}/publish/${network}`, { method: 'POST', body: { caption, imageDataUrl: image.dataUrl } }); setNetworkResults((current) => ({ ...current, [network]: result.message || 'با موفقیت منتشر شد.' })); setNotice({ type: 'success', text: image.usedFeaturedFallback ? `تولید یا دریافت تصویر قالبی انجام نشد؛ مطلب با تصویر شاخص در ${NETWORKS.find((item) => item.id === network)?.label} منتشر شد.` : `مطلب در ${NETWORKS.find((item) => item.id === network)?.label} منتشر شد.` });
    }
    catch (error) { setNotice({ type: 'error', text: error instanceof ApiError || error instanceof Error ? error.message : 'انتشار انجام نشد؛ تنظیمات و دسترسی شبکه را بررسی کنید.' }); } finally { setBusy(null); }
  }
  async function saveLead(article: Article) { const lead = (leadDrafts[article.id] ?? article.leadText ?? '').trim(); if (!lead) { setNotice({ type: 'error', text: 'لید نمی‌تواند خالی باشد.' }); return; } const updated = await run<Article>(`lead-${article.id}`, () => apiFetch<Article>(`/publishing/social/articles/${article.id}/lead`, { method: 'PATCH', body: { leadText: lead } }), 'لید مطلب با موفقیت اصلاح شد.'); if (updated) { setPublishArticle((current) => current?.id === updated.id ? { ...current, ...updated } : current); setCaptions((current) => ({ ...current, [updated.id]: updated.captionText || '' })); setEditingLead(null); } }
  async function saveTitle(article: Article) { const title = (titleDrafts[article.id] ?? article.title).trim(); if (!title) { setNotice({ type: 'error', text: 'تیتر نمی‌تواند خالی باشد.' }); return; } const updated = await run<Article>(`title-${article.id}`, () => apiFetch<Article>(`/publishing/social/articles/${article.id}/title`, { method: 'PATCH', body: { title } }), 'تیتر مطلب با موفقیت اصلاح شد.'); if (updated) { setPublishArticle((current) => current?.id === updated.id ? { ...current, ...updated } : current); setCaptions((current) => ({ ...current, [updated.id]: updated.captionText || '' })); setEditingTitle(null); } }

  return <ProtectedLayout title="استودیوی اجتماعی"><main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
    <PageHeader
      title="استودیوی اجتماعی"
      description="مدیریت محتوای شبکه‌های اجتماعی."
      icon={Share2}
      actions={
        <>
          <Link href="/publishing/social/feeds" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100"><Rss className="h-4 w-4" /> مدیریت منابع</Link>
          <Link href="/publishing/settings" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100"><Settings2 className="h-4 w-4" /> تنظیمات انتشار</Link>
          <Button variant="outline" onClick={toggleArchivedView}><Archive className="h-4 w-4" /> {showArchived ? 'بازگشت به مطالب فعال' : 'نمایش مطالب آرشیوشده'}</Button>
          <Button variant="danger" isLoading={busy === 'delete-all'} onClick={() => { if (window.confirm('همه مطالب استودیوی اجتماعی برای همیشه حذف شوند؟')) void run('delete-all', () => apiFetch('/publishing/social/articles', { method: 'DELETE' }), 'همه مطالب استودیوی اجتماعی حذف شدند.'); }}><Trash2 className="h-4 w-4" /> حذف همه مطالب</Button>
          <Button isLoading={busy === 'sync'} onClick={() => run('sync', () => apiFetch('/publishing/social/sync', { method: 'POST' }), 'منابع پایش شدند؛ مطالب جدید در صف آماده‌سازی قرار گرفتند.')}><RefreshCw className="h-4 w-4" /> پایش منابع</Button>
        </>
      }
    />
    {notice && <div role="status" className={cn('rounded-2xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}
    {(feedsApi.error || articlesApi.error) && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">دریافت اطلاعات استودیو انجام نشد: {feedsApi.error || articlesApi.error}</div>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><button type="button" onClick={() => setFilter('all')} className={cn('rounded-2xl border bg-white p-4 text-right shadow-sm', filter === 'all' ? 'border-violet-400 ring-2 ring-violet-100' : 'border-slate-200')}><div className="text-2xl font-bold text-slate-900">{formatPersianDigits(feeds.filter((feed) => feed.enabled).length)}</div><div className="mt-1 text-sm text-slate-500">فید فعال</div></button>{(showArchived ? ['archived'] : ['pending', 'processing', 'ready', 'failed']) .map((status) => <button type="button" key={status} onClick={() => setFilter(status as SocialStatus)} className={cn('rounded-2xl border bg-white p-4 text-right shadow-sm', filter === status ? 'border-violet-400 ring-2 ring-violet-100' : 'border-slate-200')}><div className="text-2xl font-bold text-violet-700">{formatPersianDigits(articles.filter((item) => item.status === status).length)}</div><div className="mt-1 text-sm text-slate-500">{STATUS[status as SocialStatus].label}</div></button>)}</section>
    {feeds.length === 0 && <Card className="flex min-h-48 flex-col items-center justify-center p-8 text-center"><Rss className="h-9 w-9 text-slate-300" /><h2 className="mt-4 font-bold text-slate-900">فید اجتماعی ثبت نشده است</h2><p className="mt-2 text-sm text-slate-500">منابع استودیوی اجتماعی مستقل از اتاق خبر هستند.</p><Link href="/publishing/social/feeds" className="mt-5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">افزودن منبع</Link></Card>}
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">{showArchived ? 'مطالب آرشیوشده' : 'مطالب اجتماعی'}</h2><span className="text-sm text-slate-500">{formatPersianDigits(rows.length)} مورد</span></div>{articlesApi.isLoading && !articlesApi.data ? <div className="grid min-h-64 place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" /></div> : rows.length === 0 ? <Card className="flex min-h-48 flex-col items-center justify-center p-8 text-center"><Share2 className="h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">مطلبی در این وضعیت وجود ندارد.</p></Card> : <div className="grid gap-5 xl:grid-cols-2">{rows.map((article) => { const meta = STATUS[article.status]; return <article key={article.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{article.featuredImageUrl && <div className="mb-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-100"><img src={displayImageUrl(article.featuredImageUrl)} alt="تصویر شاخص مطلب" className="h-44 w-full object-cover" loading="lazy" /></div>}<div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-lg font-bold leading-8 text-slate-900">{article.title}</h3><p className="mt-1 text-xs text-slate-500">عنوان اصلی · {article.feed?.name || 'منبع نامشخص'}</p></div><Badge variant={meta.variant}>{meta.label}</Badge></div><div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3"><span className="flex items-center gap-2">{article.authorImageUrl ? <img src={article.authorImageUrl} alt={`تصویر نویسنده ${article.author || ''}`} className="h-7 w-7 rounded-full object-cover ring-1 ring-violet-200" loading="lazy" /> : <UserRound className="h-4 w-4 text-violet-500" />}{article.author || 'نویسنده نامشخص'}</span><span className="flex items-center gap-2"><FileText className="h-4 w-4 text-violet-500" />{article.category || 'بدون دسته‌بندی'}</span><span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-violet-500" />{article.readingTime ? `${formatPersianDigits(article.readingTime)} دقیقه مطالعه` : 'زمان مطالعه نامشخص'}</span></div>{(article.leadText || article.status === 'ready' || article.status === 'archived') && <div className="mt-4 rounded-xl bg-violet-50 p-4 text-sm font-medium leading-7 text-violet-950">{article.leadText || 'لید هنوز تولید نشده است.'}</div>}{article.lastError && <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{article.lastError}</div>}<div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><a href={article.shortUrl || article.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"><ExternalLink className="h-4 w-4" /> لینک مطلب</a>{['pending', 'failed', 'ready', 'archived'].includes(article.status) && <Button size="sm" variant="outline" isLoading={busy === `prepare-${article.id}`} onClick={() => run(`prepare-${article.id}`, () => apiFetch(`/publishing/social/articles/${article.id}/prepare`, { method: 'POST' }), 'اطلاعات مطلب و کپشن آماده شد.')}><RefreshCw className="h-4 w-4" /> آماده‌سازی</Button>}{article.status !== 'processing' && <Button size="sm" onClick={() => openPublish(article)}><Send className="h-4 w-4" /> انتشار در شبکه‌ها</Button>}{article.status !== 'processing' && article.status !== 'archived' && <Button size="sm" variant="ghost" className="text-amber-700 hover:bg-amber-50 hover:text-amber-800" isLoading={busy === `archive-${article.id}`} onClick={() => { if (window.confirm('این مطلب آرشیو شود؟ پس از آرشیو دیگر در فهرست مطالب اجتماعی نمایش داده نمی‌شود.')) void run(`archive-${article.id}`, () => apiFetch(`/publishing/social/articles/${article.id}/archive`, { method: 'POST' }), 'مطلب آرشیو شد و از فهرست مطالب اجتماعی کنار رفت.'); }}><Archive className="h-4 w-4" /> آرشیو مطلب</Button>}</div></article>; })}</div>}</section>
    {publishArticle && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setPublishArticle(null); }}><div role="dialog" aria-modal="true" aria-labelledby="social-publish-title" className="flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl lg:max-w-[min(70vw,56rem)]"><div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><h2 id="social-publish-title" className="text-xl font-bold text-slate-900">انتشار در شبکه‌های اجتماعی</h2><button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setPublishArticle(null)} aria-label="بستن"><X className="h-5 w-5" /></button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-5 sm:p-6"><div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">{editingTitle === publishArticle.id ? <div><label className="grid gap-2 text-sm font-medium text-slate-700">تیتر مطلب<textarea autoFocus rows={2} dir="rtl" className="min-h-20 rounded-xl border border-violet-200 bg-white p-3 leading-7 text-slate-900" value={titleDrafts[publishArticle.id] ?? publishArticle.title} onChange={(event) => setTitleDrafts((current) => ({ ...current, [publishArticle.id]: event.target.value }))} /></label><div className="mt-2 flex gap-2"><Button size="sm" isLoading={busy === `title-${publishArticle.id}`} onClick={() => void saveTitle(publishArticle)}><Check className="h-4 w-4" /> ذخیره تیتر</Button><Button size="sm" variant="outline" onClick={() => setEditingTitle(null)}>انصراف</Button></div></div> : <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="text-xs text-slate-500">تیتر مطلب</p><h3 className="mt-1 text-lg font-bold leading-8 text-slate-900">{publishArticle.title}</h3></div><button type="button" title="ویرایش تیتر" aria-label="ویرایش تیتر" className="rounded-lg p-2 text-violet-700 hover:bg-violet-100" onClick={() => setEditingTitle(publishArticle.id)}><Pencil className="h-4 w-4" /></button></div>}{editingLead === publishArticle.id ? <div className="border-t border-slate-200 pt-3"><label className="grid gap-2 text-sm font-medium text-slate-700">لید مطلب<textarea autoFocus rows={3} dir="rtl" className="min-h-24 rounded-xl border border-violet-200 bg-white p-3 leading-7 text-slate-800" value={leadDrafts[publishArticle.id] ?? publishArticle.leadText ?? ''} onChange={(event) => setLeadDrafts((current) => ({ ...current, [publishArticle.id]: event.target.value }))} /></label><div className="mt-2 flex gap-2"><Button size="sm" isLoading={busy === `lead-${publishArticle.id}`} onClick={() => void saveLead(publishArticle)}><Check className="h-4 w-4" /> ذخیره لید</Button><Button size="sm" variant="outline" onClick={() => setEditingLead(null)}>انصراف</Button></div></div> : <div className="flex items-start gap-2 border-t border-slate-200 pt-3"><div className="min-w-0 flex-1"><p className="text-xs text-slate-500">لید مطلب</p><p className="mt-1 text-sm leading-7 text-slate-700">{publishArticle.leadText || 'لید هنوز تولید نشده است.'}</p></div><button type="button" title="ویرایش لید" aria-label="ویرایش لید" className="rounded-lg p-2 text-violet-700 hover:bg-violet-100" onClick={() => setEditingLead(publishArticle.id)}><Pencil className="h-4 w-4" /></button></div>}</div><div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div><label className="mb-3 grid gap-1.5 text-sm font-medium text-slate-700">قالب تصویر<select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal" value={selectedImageTemplate?.id || ''} onChange={(event) => selectImageTemplate(event.target.value)}>{imageTemplateLibrary.templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === imageTemplateLibrary.defaultTemplateId ? ' (پیش‌فرض)' : ''}</option>)}</select></label><div className="overflow-hidden rounded-2xl border bg-slate-100">{generatedImages[publishArticle.id] ? <img src={generatedImages[publishArticle.id]} alt="تصویر تولیدشده مطلب" className="aspect-square w-full object-contain" /> : publishArticle.generatedImageUrl ? <img src={displayImageUrl(publishArticle.generatedImageUrl)} alt="تصویر تولیدشده مطلب" className="aspect-square w-full object-contain" /> : publishArticle.featuredImageUrl ? <img src={displayImageUrl(publishArticle.featuredImageUrl)} alt="تصویر شاخص مطلب" className="aspect-square w-full object-contain" /> : <div className="grid aspect-square place-items-center p-6 text-center text-sm text-slate-500">این مطلب تصویر شاخص ندارد.</div>}</div><div className="mt-3 flex flex-wrap gap-2"><label className={cn('inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50', busy === `featured-image-${publishArticle.id}` && 'pointer-events-none opacity-50')}><ImagePlus className="h-4 w-4" />{busy === `featured-image-${publishArticle.id}` ? 'در حال بارگذاری...' : publishArticle.featuredImageUrl ? 'تعویض تصویر شاخص' : 'افزودن تصویر شاخص'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void replaceFeaturedImage(publishArticle, file); }} /></label>{publishArticle.featuredImageUrl && <Button variant="danger" isLoading={busy === `remove-featured-image-${publishArticle.id}`} onClick={() => { if (window.confirm('تصویر شاخص این مطلب حذف شود؟')) void removeFeaturedImage(publishArticle); }}><Trash2 className="h-4 w-4" /> حذف تصویر</Button>}</div><Button className="mt-3 w-full" variant="outline" isLoading={busy === `generate-image-${publishArticle.id}`} onClick={() => void generateImage(publishArticle)}><ImagePlus className="h-4 w-4" /> تولید با قالب «{selectedImageTemplate?.name}»</Button>{generationErrors[publishArticle.id] && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-center text-xs leading-6 text-red-700">{generationErrors[publishArticle.id]}</p>}<p className="mt-2 text-center text-xs text-slate-500">تصویر شاخص به‌صورت پیش‌فرض ارسال می‌شود؛ تولید تصویر قالبی اختیاری است.</p></div><div><label className="grid gap-2 text-sm font-medium text-slate-700">کپشن نهایی<textarea className="min-h-64 w-full rounded-xl border border-slate-300 p-3 font-normal leading-7" value={captions[publishArticle.id] ?? publishArticle.captionText ?? ''} onChange={(event) => setCaptions((current) => ({ ...current, [publishArticle.id]: event.target.value }))} /></label><p className="mt-2 text-xs leading-5 text-slate-500">کپشن آماده‌شده و تصویر انتخاب‌شده به شبکه موردنظر ارسال می‌شود.</p></div></div><div className="mt-6 border-t border-slate-100 pt-5"><h4 className="font-bold text-slate-900">انتشار در شبکه موردنظر</h4><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{NETWORKS.map(({ id, label, icon: Icon, color }) => <div key={id} className="rounded-2xl border border-slate-200 p-3"><Button className={`w-full justify-center text-white ${color}`} isLoading={busy === `publish-${id}-${publishArticle.id}`} disabled={Boolean(busy && busy.startsWith('publish-') && busy !== `publish-${id}-${publishArticle.id}`)} onClick={() => void publishToNetwork(id)}><Icon className="h-4 w-4" /> انتشار در {label}</Button><p className="mt-2 text-center text-xs text-slate-500">{isConfigured(settingsApi.data || {}, id) ? 'تنظیم شده' : 'نیازمند تنظیمات'}</p>{networkResults[id] && <p className="mt-2 text-center text-xs font-medium text-emerald-700">{networkResults[id]}</p>}</div>)}</div></div></div><div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><Button variant="outline" onClick={() => setPublishArticle(null)}>بستن</Button></div></div></div>}
  </main></ProtectedLayout>;
}
