'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ExternalLink, FileEdit, Globe2, ImagePlus, PanelsTopLeft, RefreshCw, RotateCcw, Save, Search, Send, Settings2, Sparkles, Star, Trash2, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, cn } from '@/lib/utils';
import { formatPersianDigits } from '@deska/shared';

type WordPressStatus = 'publish' | 'future' | 'draft' | 'pending' | 'private';
type Importance = 'important' | 'normal';
type ImportanceFilter = 'all' | Importance | 'unrated';

interface ImportanceEvaluation {
  importance: Importance;
  score: number;
  reason: string;
  newsValues: string[];
  source: 'ai' | 'manual' | 'wordpress';
  evaluatedAt: string;
}

interface WordPressPost {
  id: number;
  link: string;
  date: string;
  modified: string;
  slug: string;
  status: WordPressStatus;
  title: string;
  excerpt: string;
  content: string;
  author: number | null;
  featuredMediaId: number | null;
  featuredImageUrl: string;
  categories: number[];
  tags: number[];
  importanceEvaluation: ImportanceEvaluation | null;
}

interface PostsResponse {
  posts: WordPressPost[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface ImportanceAutomationStatus {
  enabled: boolean;
  automaticEnabled: boolean;
  intervalMinutes: number;
  lastSchedulerScanAt: string | null;
  evaluations: { ai: number; manual: number; important: number; normal: number; total: number };
  jobs: { queued: number; running: number; completed: number; dead: number; cancelled: number };
  latestAiEvaluation: null | { wordpressPostId: number; postTitle: string; importance: Importance; score: number; reason: string; evaluatedAt: string };
  latestJob: null | { id: string; status: string; attempts: number; maxAttempts: number; createdAt: string; startedAt: string | null; completedAt: string | null; lastError: string };
  latestFailedJob: null | { id: string; attempts: number; completedAt: string | null; lastError: string };
}

interface WordPressCategory { id: number; name: string; slug: string; parent: number }

const STATUS: Record<WordPressStatus, { label: string; badge: BadgeProps['variant'] }> = {
  publish: { label: 'منتشرشده', badge: 'success' },
  future: { label: 'زمان‌بندی‌شده', badge: 'info' },
  draft: { label: 'پیش‌نویس', badge: 'default' },
  pending: { label: 'در انتظار بازبینی', badge: 'warning' },
  private: { label: 'خصوصی', badge: 'danger' },
};

const NEWS_VALUES: Record<string, string> = {
  impact: 'اثرگذاری', timeliness: 'تازگی', proximity: 'مجاورت', prominence: 'شهرت', conflict: 'تعارض',
  novelty: 'تازگی و استثنا', magnitude: 'بزرگی', public_interest: 'منفعت عمومی', consequence: 'پیامد', continuity: 'تداوم',
};

const EMPTY_FORM = { title: '', slug: '', excerpt: '', content: '', status: 'draft' as WordPressStatus, categories: [] as number[] };
const MEDIA_PAGE_SIZE_KEY = 'deska_media_posts_per_page';
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

function plainText(value: string): string {
  return value.replace(/<[^>]*>/gu, ' ').replace(/&nbsp;/giu, ' ').replace(/&amp;/giu, '&').replace(/\s+/gu, ' ').trim();
}

function importanceLabel(evaluation: ImportanceEvaluation | null): string {
  if (!evaluation) return 'ارزیابی‌نشده';
  return evaluation.importance === 'important' ? 'خبر مهم' : 'خبر عادی';
}

function importanceSourceLabel(source: ImportanceEvaluation['source']): string {
  if (source === 'ai') return 'هوش مصنوعی';
  if (source === 'manual') return 'تصمیم سردبیر';
  return 'برچسب WordPress';
}

function importanceScoreLabel(evaluation: ImportanceEvaluation): string {
  return evaluation.source === 'ai'
    ? `امتیاز AI: ${formatPersianDigits(evaluation.score)} از ۱۰۰`
    : 'تصمیم دستی؛ امتیاز AI ندارد';
}

export default function MediaManagementPage() {
  const settingsApi = useApi<Record<string, string>>('/publishing/settings', { cache: 'no-store' });
  const mediaEnabled = settingsApi.data?.wp_media_management_enabled === 'true';
  const importanceEnabled = mediaEnabled && settingsApi.data?.wp_news_importance_enabled === 'true';
  const automaticImportanceEnabled = importanceEnabled && settingsApi.data?.wp_news_importance_auto_enabled === 'true';
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [status, setStatus] = useState('any');
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<WordPressPost | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [importanceBusy, setImportanceBusy] = useState<Set<number>>(() => new Set());
  const [localImportance, setLocalImportance] = useState<Record<number, ImportanceEvaluation | null>>({});
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);
  const listPath = useMemo(() => {
    if (!mediaEnabled) return null;
    const query = new URLSearchParams({ page: String(page), perPage: String(perPage), status });
    if (search) query.set('search', search);
    if (importanceFilter === 'important' || importanceFilter === 'normal') query.set('importance', importanceFilter);
    return `/publishing/media/posts?${query.toString()}`;
  }, [importanceFilter, mediaEnabled, page, perPage, search, status]);
  const postsApi = useApi<PostsResponse>(listPath);
  const categoriesApi = useApi<WordPressCategory[]>(mediaEnabled ? '/publishing/media/categories' : null);
  const importanceStatusApi = useApi<ImportanceAutomationStatus>(importanceEnabled ? '/publishing/media/importance/status' : null, { cache: 'no-store' });
  const posts = useMemo(() => (Array.isArray(postsApi.data?.posts) ? postsApi.data.posts : []).map((post) => (
    Object.prototype.hasOwnProperty.call(localImportance, post.id) ? { ...post, importanceEvaluation: localImportance[post.id] } : post
  )), [localImportance, postsApi.data?.posts]);
  const refetchPosts = postsApi.refetch;
  const refetchImportanceStatus = importanceStatusApi.refetch;
  const visiblePosts = useMemo(() => posts
    .filter((post) => importanceFilter !== 'unrated' || !post.importanceEvaluation),
  [importanceFilter, posts]);
  const categories = Array.isArray(categoriesApi.data) ? categoriesApi.data : [];
  const totalPages = Math.max(1, postsApi.data?.totalPages || 1);
  const pageNumbers = useMemo(() => Array.from(new Set([1, page - 2, page - 1, page, page + 1, page + 2, totalPages]))
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((left, right) => left - right), [page, totalPages]);

  useEffect(() => {
    const saved = Number.parseInt(window.localStorage.getItem(MEDIA_PAGE_SIZE_KEY) || '', 10);
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(saved)) setPerPage(saved);
  }, []);

  useEffect(() => {
    if (!automaticImportanceEnabled) return;
    const timer = window.setInterval(() => { void refetchPosts(); void refetchImportanceStatus(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [automaticImportanceEnabled, refetchImportanceStatus, refetchPosts]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function changePage(nextPage: number) {
    const boundedPage = Math.min(totalPages, Math.max(1, nextPage));
    if (boundedPage === page || postsApi.isLoading) return;
    setPage(boundedPage);
    setNotice(null);
    window.requestAnimationFrame(() => listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function changePageSize(value: number) {
    if (!(PAGE_SIZE_OPTIONS as readonly number[]).includes(value)) return;
    setPerPage(value);
    setPage(1);
    window.localStorage.setItem(MEDIA_PAGE_SIZE_KEY, String(value));
  }

  function loadEditor(post: WordPressPost) {
    setSelected(post);
    setForm({ title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content, status: post.status, categories: post.categories });
  }

  async function openEditor(id: number) {
    setBusy(`open-${id}`); setNotice(null);
    try { loadEditor(await apiFetch<WordPressPost>(`/publishing/media/posts/${id}`)); }
    catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'دریافت نوشته از WordPress انجام نشد.' }); }
    finally { setBusy(null); }
  }

  function payload(statusOverride?: WordPressStatus) {
    return { ...form, status: statusOverride ?? form.status };
  }

  async function save(publish = false) {
    if (!selected) return;
    if (!form.title.trim()) { setNotice({ type: 'error', text: 'عنوان نوشته نمی‌تواند خالی باشد.' }); return; }
    const key = publish ? 'publish' : 'save';
    setBusy(key); setNotice(null);
    try {
      const post = await apiFetch<WordPressPost>(`/publishing/media/posts/${selected.id}${publish ? '/publish' : ''}`, {
        method: publish ? 'POST' : 'PATCH', body: payload(publish ? 'publish' : undefined),
      });
      loadEditor({ ...post, importanceEvaluation: selected.importanceEvaluation });
      setNotice({ type: 'success', text: publish ? 'نوشته با موفقیت در WordPress منتشر شد.' : 'تغییرات نوشته در WordPress ذخیره شد.' });
      await postsApi.refetch();
    } catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'ذخیره نوشته در WordPress انجام نشد.' }); }
    finally { setBusy(null); }
  }

  async function replaceFeaturedImage(file?: File) {
    if (!selected || !file) return;
    setBusy('featured-image'); setNotice(null);
    try {
      const body = new FormData(); body.append('file', file);
      const post = await apiFetch<WordPressPost>(`/publishing/media/posts/${selected.id}/featured-image`, { method: 'POST', body });
      loadEditor({ ...post, importanceEvaluation: selected.importanceEvaluation });
      setNotice({ type: 'success', text: 'تصویر شاخص در WordPress جایگزین شد.' });
      await postsApi.refetch();
    } catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'تغییر تصویر شاخص انجام نشد.' }); }
    finally { setBusy(null); }
  }

  async function removeFeaturedImage() {
    if (!selected) return;
    setBusy('remove-featured-image'); setNotice(null);
    try {
      const post = await apiFetch<WordPressPost>(`/publishing/media/posts/${selected.id}/featured-image`, { method: 'DELETE' });
      loadEditor({ ...post, importanceEvaluation: selected.importanceEvaluation });
      setNotice({ type: 'success', text: 'تصویر شاخص نوشته حذف شد.' });
      await postsApi.refetch();
    } catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'حذف تصویر شاخص انجام نشد.' }); }
    finally { setBusy(null); }
  }

  async function queueImportanceEvaluations() {
    setBusy('queue-importance'); setNotice(null);
    try {
      const result = await apiFetch<{ queued: number }>('/publishing/media/importance/queue', { method: 'POST' });
      setNotice({ type: 'success', text: result.queued ? `${formatPersianDigits(result.queued)} خبر برای ارزیابی در صف قرار گرفت.` : 'همه خبرهای دریافت‌شده قبلاً ارزیابی شده‌اند.' });
      await importanceStatusApi.refetch();
    } catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'ایجاد صف ارزیابی انجام نشد.' }); }
    finally { setBusy(null); }
  }

  async function reevaluateAllImportance() {
    if (!window.confirm('همه خبرهای منتشرشده دوباره با هوش مصنوعی ارزیابی می‌شوند و ممکن است مصرف سرویس هوش مصنوعی افزایش یابد. تصمیم‌های دستی سردبیر حفظ خواهند شد. ادامه می‌دهید؟')) return;
    setBusy('reevaluate-all'); setNotice(null);
    try {
      const result = await apiFetch<{ started: boolean; alreadyRunning: boolean; message: string }>('/publishing/media/importance/reevaluate-all', { method: 'POST' });
      setNotice({ type: 'success', text: result.message });
      await importanceStatusApi.refetch();
    } catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'شروع بازارزیابی همه خبرها انجام نشد.' }); }
    finally { setBusy(null); }
  }

  async function evaluateOne(post: WordPressPost) {
    setBusy(`evaluate-${post.id}`); setNotice(null);
    try {
      const evaluation = await apiFetch<ImportanceEvaluation>(`/publishing/media/posts/${post.id}/importance/evaluate`, { method: 'POST' });
      setSelected((current) => current?.id === post.id ? { ...current, importanceEvaluation: evaluation } : current);
      setNotice({ type: 'success', text: 'اهمیت خبر ارزیابی و برچسب آن در WordPress ثبت شد.' });
      await Promise.all([postsApi.refetch(), importanceStatusApi.refetch()]);
    } catch (error) { setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'ارزیابی اهمیت خبر انجام نشد.' }); }
    finally { setBusy(null); }
  }

  async function overrideImportance(post: WordPressPost, importance: Importance) {
    if (importanceBusy.has(post.id)) return;
    const optimistic: ImportanceEvaluation = {
      importance,
      score: importance === 'important' ? 100 : 0,
      reason: 'تصمیم سردبیر در حال ذخیره است.',
      newsValues: [],
      source: 'manual',
      evaluatedAt: new Date().toISOString(),
    };
    setLocalImportance((current) => ({ ...current, [post.id]: optimistic }));
    setImportanceBusy((current) => new Set(current).add(post.id));
    setBusy(`importance-${post.id}`);
    setNotice(null);
    try {
      const evaluation = await apiFetch<ImportanceEvaluation>(`/publishing/media/posts/${post.id}/importance`, { method: 'PATCH', body: { importance } });
      setLocalImportance((current) => ({ ...current, [post.id]: evaluation }));
      setSelected((current) => current?.id === post.id ? { ...current, importanceEvaluation: evaluation } : current);
      setNotice({ type: 'success', text: importance === 'important' ? 'خبر مهم شد؛ استخراج دلایل اهمیت در صف قرار گرفت و پس از تحلیل در حافظه تحریریه ثبت می‌شود.' : 'خبر عادی شد و تصمیم سردبیر در حافظه ثبت شد.' });
      void importanceStatusApi.refetch();
      void postsApi.refetch().finally(() => setLocalImportance((current) => {
        const next = { ...current };
        delete next[post.id];
        return next;
      }));
    } catch (error) {
      setLocalImportance((current) => {
        const next = { ...current };
        delete next[post.id];
        return next;
      });
      setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'اصلاح برچسب اهمیت انجام نشد.' });
    }
    finally {
      setImportanceBusy((current) => { const next = new Set(current); next.delete(post.id); return next; });
      setBusy((current) => current === `importance-${post.id}` ? null : current);
    }
  }

  return (
    <ProtectedLayout title="مدیریت رسانه">
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
        <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-sky-950 p-6 text-white shadow-xl shadow-slate-900/10 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><PanelsTopLeft className="h-6 w-6" /></span><div><h1 className="text-2xl font-bold">مدیریت رسانه</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">مدیریت نوشته‌های سایت WordPress و تفکیک هوشمند خبرهای مهم.</p></div></div>
          <div className="flex flex-wrap gap-2"><Link href="/publishing/settings" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"><Settings2 className="h-4 w-4" /> تنظیمات</Link>{mediaEnabled && <Button className="bg-white text-slate-900 hover:bg-slate-100" isLoading={postsApi.isLoading} onClick={() => void postsApi.refetch()}><RefreshCw className="h-4 w-4" /> تازه‌سازی</Button>}{importanceEnabled && <Button className="bg-amber-400 text-amber-950 hover:bg-amber-300" isLoading={busy === 'queue-importance'} disabled={busy === 'reevaluate-all'} onClick={() => void queueImportanceEvaluations()}><Sparkles className="h-4 w-4" /> ارزیابی خبرهای جدید</Button>}{importanceEnabled && <Button className="border border-amber-300 bg-transparent text-amber-100 hover:bg-white/10" isLoading={busy === 'reevaluate-all'} disabled={busy === 'queue-importance'} onClick={() => void reevaluateAllImportance()}><RotateCcw className="h-4 w-4" /> بازارزیابی همه</Button>}</div>
        </header>

        {notice && <div role="status" className={cn('rounded-2xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}

        {settingsApi.isLoading && !settingsApi.data ? <div className="grid min-h-48 place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div> : !mediaEnabled ? <Card className="flex min-h-64 flex-col items-center justify-center border-dashed p-8 text-center"><Globe2 className="h-11 w-11 text-slate-300" /><h2 className="mt-4 text-lg font-bold text-slate-900">ارتباط با نوشته‌های WordPress غیرفعال است</h2><p className="mt-2 max-w-xl text-sm leading-7 text-slate-500">این بخش در حالت عادی به سایت مقصد متصل نمی‌شود. مالک سازمان می‌تواند آن را از تنظیمات WordPress فعال کند.</p><Link href="/publishing/settings" className="mt-5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">رفتن به تنظیمات انتشار</Link></Card> : <>
          {postsApi.error && <Card className="border-red-200 bg-red-50 p-5"><div className="flex items-start gap-3 text-red-800"><Globe2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">دریافت نوشته‌های WordPress انجام نشد</p><p className="mt-1 text-sm leading-6">{postsApi.error}</p><Link href="/publishing/settings" className="mt-3 inline-flex text-sm font-semibold underline">بررسی تنظیمات و تست اتصال</Link></div></div></Card>}

          {importanceEnabled && <Card className="p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex items-start gap-3"><span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', automaticImportanceEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}><Sparkles className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">وضعیت واقعی ارزیابی اهمیت</h2>{importanceStatusApi.isLoading && !importanceStatusApi.data ? <p className="mt-1 text-sm text-slate-500">در حال بررسی صف و نتایج ثبت‌شده...</p> : importanceStatusApi.error ? <p className="mt-1 text-sm text-red-700">{importanceStatusApi.error}</p> : importanceStatusApi.data && <><p className="mt-1 text-sm leading-6 text-slate-600">{automaticImportanceEnabled ? `ارزیابی خودکار روشن است و هر ${formatPersianDigits(importanceStatusApi.data.intervalMinutes)} دقیقه خبرهای تازه یا ویرایش‌شده را بررسی می‌کند.` : 'ارزیابی خودکار خاموش است؛ فقط ارزیابی دستی انجام می‌شود.'}</p><p className="mt-1 text-xs text-slate-500">{importanceStatusApi.data.latestAiEvaluation ? <>آخرین نتیجه واقعی AI: {new Date(importanceStatusApi.data.latestAiEvaluation.evaluatedAt).toLocaleString('fa-IR')} · امتیاز {formatPersianDigits(importanceStatusApi.data.latestAiEvaluation.score)} · {importanceStatusApi.data.latestAiEvaluation.importance === 'important' ? 'مهم' : 'عادی'}</> : 'هنوز هیچ نتیجه‌ای از هوش مصنوعی در پایگاه داده ثبت نشده است.'}</p></>}</div></div>{importanceStatusApi.data && <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4"><div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-800"><strong className="block text-base">{formatPersianDigits(importanceStatusApi.data.jobs.queued)}</strong>در صف</div><div className="rounded-xl bg-violet-50 px-3 py-2 text-violet-800"><strong className="block text-base">{formatPersianDigits(importanceStatusApi.data.jobs.running)}</strong>در حال اجرا</div><div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800"><strong className="block text-base">{formatPersianDigits(importanceStatusApi.data.evaluations.ai)}</strong>نتیجه AI</div><div className={cn('rounded-xl px-3 py-2', importanceStatusApi.data.jobs.dead ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-600')}><strong className="block text-base">{formatPersianDigits(importanceStatusApi.data.jobs.dead)}</strong>متوقف‌شده</div></div>}</div>{importanceStatusApi.data?.latestFailedJob?.lastError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-6 text-red-700">آخرین خطای ارزیابی: {importanceStatusApi.data.latestFailedJob.lastError} <Link href="/publishing/operations" className="font-bold underline">مشاهده مرکز عملیات</Link></div>}</Card>}

          <Card className="p-4"><form onSubmit={submitSearch} className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto]"><label className="grid gap-1.5 text-sm font-medium text-slate-700">وضعیت<select className="rounded-xl border px-3 py-2.5" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="any">همه وضعیت‌ها</option>{Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>{importanceEnabled ? <label className="grid gap-1.5 text-sm font-medium text-slate-700">اهمیت<select className="rounded-xl border px-3 py-2.5" value={importanceFilter} onChange={(event) => { setImportanceFilter(event.target.value as ImportanceFilter); setPage(1); }}><option value="all">همه خبرها</option><option value="important">خبرهای مهم</option><option value="normal">خبرهای عادی</option><option value="unrated">ارزیابی‌نشده در این صفحه</option></select></label> : <div />}<label className="grid gap-1.5 text-sm font-medium text-slate-700">جست‌وجوی نوشته<div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="w-full rounded-xl border py-2.5 pl-3 pr-10" placeholder="عنوان یا بخشی از متن..." value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div></label><Button className="self-end" type="submit"><Search className="h-4 w-4" /> جست‌وجو</Button></form></Card>

          <div ref={listTopRef} className="scroll-mt-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold text-slate-900">نوشته‌های سایت مقصد</h2><span className="mt-1 block text-sm text-slate-500">{formatPersianDigits(postsApi.data?.total || 0)} نوشته · جدیدترین زمان انتشار در ابتدا</span></div><label className="flex items-center gap-2 text-sm text-slate-600">تعداد در هر صفحه<select dir="ltr" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-800" value={perPage} onChange={(event) => changePageSize(Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{formatPersianDigits(value)}</option>)}</select></label></div>
          {postsApi.isLoading && !postsApi.data ? <div className="grid min-h-64 place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div> : !postsApi.error && visiblePosts.length === 0 ? <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><FileEdit className="h-10 w-10 text-slate-300" /><h3 className="mt-4 font-bold text-slate-900">نوشته‌ای پیدا نشد</h3><p className="mt-2 text-sm text-slate-500">فیلترها را تغییر دهید یا در سایت WordPress نوشته‌ای ایجاد کنید.</p></Card> : visiblePosts.length > 0 && <Card className="overflow-hidden"><div className="divide-y divide-slate-100">{visiblePosts.map((post) => {
            const meta = STATUS[post.status] ?? { label: post.status, badge: 'default' as const };
            const evaluation = post.importanceEvaluation;
            const isImportant = evaluation?.importance === 'important';
            return <article key={post.id} className={cn('grid gap-4 p-4 transition hover:bg-slate-50 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,340px)_auto] lg:items-center', isImportant && 'bg-amber-50/50')}>
              <div className="flex min-w-0 items-start gap-3">{importanceEnabled && <button type="button" aria-label={isImportant ? 'تبدیل به خبر عادی' : 'تبدیل به خبر مهم'} aria-pressed={isImportant} title={isImportant ? 'خبر مهم؛ برای عادی‌کردن کلیک کنید' : evaluation ? 'خبر عادی؛ برای مهم‌کردن کلیک کنید' : 'هنوز ارزیابی نشده؛ برای ثبت تصمیم مهم کلیک کنید'} disabled={post.status !== 'publish' || importanceBusy.has(post.id)} onClick={() => void overrideImportance(post, isImportant ? 'normal' : 'important')} className={cn('mt-5 grid h-10 w-10 shrink-0 place-items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40', isImportant ? 'border-amber-300 bg-amber-100 text-amber-600 shadow-sm' : evaluation ? 'border-slate-300 bg-white text-slate-400 hover:border-amber-200 hover:text-amber-500' : 'border-dashed border-slate-300 bg-slate-50 text-slate-300 hover:border-amber-200 hover:text-amber-500', importanceBusy.has(post.id) && 'animate-pulse')}><Star className={cn('h-5 w-5', isImportant && 'fill-current')} /></button>}{post.featuredImageUrl ? <img src={post.featuredImageUrl} alt="تصویر شاخص نوشته" className="h-20 w-24 shrink-0 rounded-xl border border-slate-100 object-cover" loading="lazy" /> : <span className="grid h-20 w-24 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-300"><ImagePlus className="h-6 w-6" /></span>}<div className="min-w-0"><button type="button" onClick={() => void openEditor(post.id)} className="block max-w-full text-right text-base font-bold leading-7 text-slate-900 hover:text-primary-700">{plainText(post.title) || 'بدون عنوان'}</button><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{plainText(post.excerpt) || 'بدون چکیده'}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant={meta.badge}>{meta.label}</Badge>{importanceEnabled && <Badge variant={isImportant ? 'warning' : evaluation ? 'default' : 'info'}>{isImportant && <Star className="ml-1 h-3.5 w-3.5 fill-current" />}{importanceLabel(evaluation)}</Badge>}</div></div></div>
              {importanceEnabled && <div className={cn('rounded-xl border px-3 py-2.5 text-xs leading-5', evaluation ? isImportant ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-700' : 'border-dashed border-blue-200 bg-blue-50/60 text-blue-800')}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{evaluation ? importanceScoreLabel(evaluation) : 'بدون امتیاز؛ ارزیابی نشده'}</strong>{evaluation && <span>{importanceSourceLabel(evaluation.source)}</span>}</div><p className="mt-1.5 line-clamp-3">{evaluation?.reason || (post.status === 'publish' ? 'این خبر هنوز توسط هوش مصنوعی یا سردبیر ارزیابی نشده است.' : 'فقط خبر منتشرشده قابل ارزیابی است.')}</p>{evaluation?.evaluatedAt && <p className="mt-1 text-[11px] opacity-70">زمان ارزیابی: {new Date(evaluation.evaluatedAt).toLocaleString('fa-IR')}</p>}</div>}
              <div className="flex flex-wrap gap-2 lg:justify-end"><Button size="sm" variant="outline" isLoading={busy === `open-${post.id}`} onClick={() => void openEditor(post.id)}><FileEdit className="h-4 w-4" /> ویرایش</Button>{importanceEnabled && post.status === 'publish' && <Button size="sm" variant="outline" isLoading={busy === `evaluate-${post.id}`} onClick={() => void evaluateOne(post)}><Sparkles className="h-4 w-4" /> {evaluation ? 'ارزیابی مجدد' : 'ارزیابی اکنون'}</Button>}{post.link && <a href={post.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><ExternalLink className="h-4 w-4" /> مشاهده</a>}</div>
            </article>;
          })}</div></Card>}

          {postsApi.data && totalPages > 1 && <nav aria-label="صفحه‌بندی نوشته‌ها" className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:justify-between"><span className="min-w-40 text-center text-sm text-slate-600">{postsApi.isLoading ? 'در حال دریافت صفحه...' : <>صفحه {formatPersianDigits(page)} از {formatPersianDigits(totalPages)}</>}</span><div className="flex flex-wrap items-center justify-center gap-1.5"><button type="button" className="rounded-lg border px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={page <= 1 || postsApi.isLoading} onClick={() => changePage(1)}>اولین</button><Button size="sm" variant="outline" disabled={page <= 1 || postsApi.isLoading} onClick={() => changePage(page - 1)}><ChevronRight className="h-4 w-4" /> قبلی</Button>{pageNumbers.map((pageNumber, index) => <span key={pageNumber} className="flex items-center gap-1.5">{index > 0 && pageNumber - pageNumbers[index - 1] > 1 && <span className="px-1 text-slate-400">…</span>}<button type="button" aria-current={pageNumber === page ? 'page' : undefined} disabled={postsApi.isLoading} onClick={() => changePage(pageNumber)} className={cn('grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-sm font-semibold transition disabled:opacity-50', pageNumber === page ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300 hover:bg-primary-50')}>{formatPersianDigits(pageNumber)}</button></span>)}<Button size="sm" variant="outline" disabled={page >= totalPages || postsApi.isLoading} onClick={() => changePage(page + 1)}>بعدی <ChevronLeft className="h-4 w-4" /></Button><button type="button" className="rounded-lg border px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={page >= totalPages || postsApi.isLoading} onClick={() => changePage(totalPages)}>آخرین</button></div></nav>}
        </>}

        {selected && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="ویرایش نوشته WordPress"><div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur"><div><h2 className="font-black text-slate-900">ویرایش نوشته #{formatPersianDigits(selected.id)}</h2><p className="mt-1 text-xs text-slate-500">تغییرات مستقیماً روی سایت WordPress ذخیره می‌شوند.</p></div><button type="button" aria-label="بستن" onClick={() => setSelected(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header><div className="grid gap-5 p-5 sm:p-6">
          {importanceEnabled && <section className={cn('rounded-2xl border p-4', selected.importanceEvaluation?.importance === 'important' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50')}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-bold text-slate-900"><Star className={cn('h-5 w-5', selected.importanceEvaluation?.importance === 'important' && 'fill-amber-500 text-amber-500')} /> ارزیابی اهمیت خبر</h3><p className="mt-1 text-sm text-slate-500">برچسب انتخابی هم در دسکا و هم به‌صورت Tag روی نوشته WordPress ذخیره می‌شود.</p></div>{selected.importanceEvaluation && <Badge variant={selected.importanceEvaluation.importance === 'important' ? 'warning' : 'default'}>{importanceLabel(selected.importanceEvaluation)} · {selected.importanceEvaluation.source === 'ai' ? formatPersianDigits(selected.importanceEvaluation.score) : 'دستی'}</Badge>}</div>{selected.importanceEvaluation ? <div className="mt-4 space-y-3"><p className="text-sm font-semibold text-slate-800">{importanceScoreLabel(selected.importanceEvaluation)}</p><p className="text-sm leading-7 text-slate-700">{selected.importanceEvaluation.reason}</p>{selected.importanceEvaluation.newsValues.length > 0 && <div className="flex flex-wrap gap-2">{selected.importanceEvaluation.newsValues.map((value) => <span key={value} className="rounded-lg bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200">{NEWS_VALUES[value] || value}</span>)}</div>}<p className="text-xs text-slate-500">منبع تصمیم: {importanceSourceLabel(selected.importanceEvaluation.source)} · زمان: {selected.importanceEvaluation.evaluatedAt ? new Date(selected.importanceEvaluation.evaluatedAt).toLocaleString('fa-IR') : 'نامشخص'}</p></div> : <p className="mt-4 text-sm text-slate-500">این خبر هنوز ارزیابی نشده و امتیازی برای آن ثبت نشده است.</p>}<div className="mt-4 flex flex-wrap gap-2">{selected.status === 'publish' && <Button variant="outline" isLoading={busy === `evaluate-${selected.id}`} onClick={() => void evaluateOne(selected)}><Sparkles className="h-4 w-4" /> {selected.importanceEvaluation ? 'ارزیابی مجدد با AI' : 'ارزیابی اکنون با AI'}</Button>}<Button className="bg-amber-500 text-amber-950 hover:bg-amber-400" isLoading={busy === `importance-${selected.id}`} disabled={selected.status !== 'publish'} onClick={() => void overrideImportance(selected, 'important')}><Star className="h-4 w-4" /> تعیین به‌عنوان خبر مهم</Button><Button variant="outline" isLoading={busy === `importance-${selected.id}`} disabled={selected.status !== 'publish'} onClick={() => void overrideImportance(selected, 'normal')}>تعیین به‌عنوان خبر عادی</Button></div></section>}
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[240px_1fr] md:items-center"><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{selected.featuredImageUrl ? <img src={selected.featuredImageUrl} alt="تصویر شاخص نوشته" className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center text-sm text-slate-400">بدون تصویر شاخص</div>}</div><div><h3 className="font-bold text-slate-900">تصویر شاخص</h3><p className="mt-1 text-sm leading-6 text-slate-500">فایل جدید در کتابخانه رسانه WordPress بارگذاری و به همین نوشته متصل می‌شود.</p><div className="mt-3 flex flex-wrap gap-2"><label className={cn('inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50', busy === 'featured-image' && 'pointer-events-none opacity-50')}><ImagePlus className="h-4 w-4" />{busy === 'featured-image' ? 'در حال بارگذاری...' : selected.featuredImageUrl ? 'تعویض تصویر' : 'افزودن تصویر'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void replaceFeaturedImage(file); }} /></label>{selected.featuredImageUrl && <Button variant="danger" isLoading={busy === 'remove-featured-image'} onClick={() => { if (window.confirm('تصویر شاخص این نوشته حذف شود؟')) void removeFeaturedImage(); }}><Trash2 className="h-4 w-4" /> حذف تصویر</Button>}</div></div></section>
          <div className="grid gap-4 md:grid-cols-[1fr_240px]"><label className="grid gap-1.5 text-sm font-medium text-slate-700">عنوان<input className="rounded-xl border px-3 py-2.5" value={form.title} maxLength={500} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">وضعیت<select className="rounded-xl border px-3 py-2.5" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as WordPressStatus })}>{Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label></div><label className="grid gap-1.5 text-sm font-medium text-slate-700">نامک<input dir="ltr" className="rounded-xl border px-3 py-2.5 text-left" value={form.slug} maxLength={200} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">چکیده<textarea className="min-h-28 rounded-xl border px-3 py-2.5 leading-7" value={form.excerpt} maxLength={20000} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">متن نوشته <span className="font-normal text-slate-400">(HTML مجاز است)</span><textarea dir="auto" className="min-h-[360px] rounded-xl border px-3 py-3 font-mono text-sm leading-7" value={form.content} maxLength={2000000} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label><fieldset className="rounded-2xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold text-slate-700">دسته‌بندی‌ها</legend>{categoriesApi.isLoading ? <p className="text-sm text-slate-500">در حال دریافت دسته‌بندی‌ها...</p> : categories.length === 0 ? <p className="text-sm text-slate-500">دسته‌بندی‌ای دریافت نشد.</p> : <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => <label key={category.id} className="flex items-center gap-2 rounded-xl p-2 text-sm hover:bg-slate-50"><input type="checkbox" className="h-4 w-4 accent-primary-600" checked={form.categories.includes(category.id)} onChange={(event) => setForm({ ...form, categories: event.target.checked ? [...form.categories, category.id] : form.categories.filter((id) => id !== category.id) })} />{category.name}</label>)}</div>}</fieldset>
        </div><footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur"><div>{selected.link && <a href={selected.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"><ExternalLink className="h-4 w-4" /> مشاهده در سایت</a>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" isLoading={busy === 'save'} onClick={() => void save(false)}><Save className="h-4 w-4" /> ذخیره تغییرات</Button><Button isLoading={busy === 'publish'} onClick={() => { if (window.confirm('این نوشته اکنون در WordPress منتشر شود؟')) void save(true); }}><Send className="h-4 w-4" /> انتشار</Button></div></footer></div></div>}
      </main>
    </ProtectedLayout>
  );
}
