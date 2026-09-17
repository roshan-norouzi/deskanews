'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Play, RefreshCw, RotateCcw, ServerCog, XCircle } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/utils';
import { formatJalaliDateTime } from '@/lib/date';

interface QueueStats { queued: number; running: number; completed: number; dead: number; cancelled: number }
interface IntegrationItem {
  id: string; key: string; type: string; name: string; status: string; configured: boolean;
  consecutiveFailures: number; latencyMs: number | null; lastCheckedAt: string | null;
  lastSuccessAt: string | null; lastError: string; metadata?: Record<string, unknown>;
}
interface JobItem { id: string; type: string; status: string; attempts: number; maxAttempts: number; lastError: string; createdAt: string; updatedAt: string }
interface WorkflowItem { id: string; action: string; entityType: string; stage: string; toStatus: string; createdAt: string }
interface ActivityItem { id: string; title: string; createdAt: string; type: string }
interface AuditItem { id: string; action: string; entityType: string; entityId: string; createdAt: string; changes?: { outcome?: string; method?: string; path?: string }; user?: { name: string; email: string } | null }
interface OperationsOverview { queue: QueueStats; integrations: IntegrationItem[]; recentJobs: JobItem[]; workflow: WorkflowItem[]; activity: ActivityItem[]; audit: AuditItem[]; generatedAt: string }

const JOB_LABELS: Record<string, string> = {
  'news.feed.fetch': 'دریافت فید خبری', 'news.prepare': 'آماده‌سازی خبر', 'news.publish': 'انتشار خبر در سایت',
  'news.send-social': 'ارسال خبر به استودیوی اجتماعی', 'social.feed.fetch': 'دریافت فید اجتماعی',
  'social.prepare': 'آماده‌سازی مطلب اجتماعی', 'social.cover': 'تولید تصویر', 'social.publish': 'انتشار اجتماعی',
  'wordpress.importance.evaluate': 'ارزیابی اهمیت خبر WordPress', 'wordpress.importance.reevaluate-all': 'بازارزیابی همه خبرهای WordPress',
  'wordpress.importance.learn': 'استخراج دلایل تصمیم سردبیر',
};

const HEALTH_LABELS: Record<string, string> = { healthy: 'سالم', degraded: 'دارای اختلال', down: 'قطع', unknown: 'آزمایش‌نشده', unconfigured: 'پیکربندی‌نشده', disabled: 'غیرفعال' };
function healthVariant(status: string): BadgeProps['variant'] {
  if (status === 'healthy') return 'success';
  if (status === 'degraded' || status === 'unknown') return 'warning';
  if (status === 'down') return 'danger';
  return 'default';
}

export default function PublishingOperationsPage() {
  const { data, isLoading, error, refetch } = useApi<OperationsOverview>('/publishing/operations');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => void refetch(), 15_000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  const retry = async (jobId: string) => {
    setBusy(jobId); setActionError(null); setActionMessage(null);
    try { await apiFetch(`/publishing/operations/jobs/${jobId}/retry`, { method: 'POST' }); await refetch(); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'تلاش مجدد انجام نشد'); }
    finally { setBusy(null); }
  };

  const retryAll = async () => {
    const count = data?.queue.dead || 0;
    if (!count) return;
    if (!window.confirm(`همه ${formatPersianDigits(count)} فرایند متوقف‌شده دوباره در صف قرار بگیرند؟ بعضی فرایندها ممکن است شامل انتشار در سرویس‌های بیرونی باشند.`)) return;
    setBusy('retry-all'); setActionError(null); setActionMessage(null);
    try {
      const result = await apiFetch<{ retried: number }>('/publishing/operations/jobs/retry-all', { method: 'POST' });
      setActionMessage(result.retried
        ? `${formatPersianDigits(result.retried)} فرایند برای تلاش مجدد در صف قرار گرفت.`
        : 'فرایند متوقف‌شده‌ای برای تلاش مجدد وجود نداشت.');
      await refetch();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تلاش مجدد گروهی انجام نشد'); }
    finally { setBusy(null); }
  };

  if (isLoading && !data) return <ProtectedLayout title="مرکز عملیات"><div className="flex justify-center py-24"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div></ProtectedLayout>;

  return <ProtectedLayout title="مرکز عملیات">
    <main className="mx-auto max-w-7xl space-y-6" dir="rtl">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl sm:flex-row sm:items-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><ServerCog className="h-6 w-6" /></span>
        <div className="flex-1"><h1 className="text-2xl font-bold">مرکز عملیات نشر</h1><p className="mt-2 text-sm text-slate-300">صف فرایندها، سلامت اتصال‌ها و تاریخچه گردش محتوا</p>{data?.generatedAt && <p className="mt-1 text-xs text-slate-400">آخرین بروزرسانی: {formatJalaliDateTime(data.generatedAt)}</p>}</div>
        <Button variant="outline" onClick={() => void refetch()}><RefreshCw className="h-4 w-4" /> بروزرسانی</Button>
      </header>

      {(error || actionError) && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError || error}</div>}
      {actionMessage && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{actionMessage}</div>}

      {data && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <QueueCard label="در صف" value={data.queue.queued} icon={<Clock3 className="h-5 w-5" />} tone="text-blue-700 bg-blue-50" />
          <QueueCard label="در حال اجرا" value={data.queue.running} icon={<Play className="h-5 w-5" />} tone="text-violet-700 bg-violet-50" />
          <QueueCard label="تکمیل‌شده" value={data.queue.completed} icon={<CheckCircle2 className="h-5 w-5" />} tone="text-emerald-700 bg-emerald-50" />
          <QueueCard label="متوقف‌شده" value={data.queue.dead} icon={<XCircle className="h-5 w-5" />} tone="text-red-700 bg-red-50" />
          <QueueCard label="لغوشده" value={data.queue.cancelled} icon={<AlertTriangle className="h-5 w-5" />} tone="text-slate-700 bg-slate-100" />
        </section>

        <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">سلامت اتصال‌ها</h2><p className="mt-1 text-xs text-slate-500">نتیجه واقعی دریافت فیدها و آزمایش اتصال سرویس‌ها</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-right text-xs text-slate-500"><tr><th className="px-5 py-3">اتصال</th><th className="px-5 py-3">نوع</th><th className="px-5 py-3">وضعیت</th><th className="px-5 py-3">آخرین بررسی</th><th className="px-5 py-3">زمان پاسخ</th><th className="px-5 py-3">جزئیات</th></tr></thead><tbody className="divide-y divide-slate-100">{data.integrations.map((item) => <tr key={item.key}><td className="px-5 py-4 font-medium text-slate-900">{item.name}</td><td className="px-5 py-4 text-slate-500">{item.type}</td><td className="px-5 py-4"><Badge variant={healthVariant(item.status)}>{HEALTH_LABELS[item.status] || item.status}</Badge></td><td className="px-5 py-4 text-slate-500">{item.lastCheckedAt ? formatJalaliDateTime(item.lastCheckedAt) : 'هنوز بررسی نشده'}</td><td className="px-5 py-4 text-slate-500">{item.latencyMs == null ? '—' : `${formatPersianDigits(item.latencyMs)} میلی‌ثانیه`}</td><td className="max-w-sm px-5 py-4 text-xs leading-5 text-red-700">{item.lastError || '—'}</td></tr>)}</tbody></table></div></Card>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">فرایندهای نیازمند رسیدگی</h2><p className="mt-1 text-xs text-slate-500">فرایندهای متوقف‌شده را تکی یا یکجا دوباره در صف قرار دهید.</p></div>{data.queue.dead > 0 && <Button size="sm" variant="outline" isLoading={busy === 'retry-all'} disabled={Boolean(busy && busy !== 'retry-all')} onClick={() => void retryAll()}><RotateCcw className="h-4 w-4" /> تلاش مجدد همه ({formatPersianDigits(data.queue.dead)})</Button>}</div>{data.recentJobs.length ? <div className="divide-y divide-slate-100">{data.recentJobs.map((job) => <article key={job.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${job.status === 'dead' ? 'bg-red-50 text-red-700' : 'bg-violet-50 text-violet-700'}`}>{job.status === 'dead' ? <XCircle className="h-4 w-4" /> : <RefreshCw className="h-4 w-4 animate-spin" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{JOB_LABELS[job.type] || job.type}</p><Badge variant={job.status === 'dead' ? 'danger' : 'info'}>{job.status === 'dead' ? 'متوقف‌شده' : 'در حال اجرا'}</Badge></div><p className="mt-1 text-xs text-slate-500">تلاش {formatPersianDigits(job.attempts)} از {formatPersianDigits(job.maxAttempts)} · {formatJalaliDateTime(job.updatedAt)}</p>{job.lastError && <p className="mt-2 text-xs leading-5 text-red-700">{job.lastError}</p>}</div>{job.status === 'dead' && <Button size="sm" variant="outline" isLoading={busy === job.id} disabled={busy === 'retry-all'} onClick={() => void retry(job.id)}><RotateCcw className="h-4 w-4" /> تلاش مجدد</Button>}</article>)}</div> : <div className="grid place-items-center px-5 py-14 text-center"><CheckCircle2 className="h-10 w-10 text-emerald-500" /><p className="mt-3 text-sm text-slate-600">فرایند متوقف‌شده‌ای وجود ندارد.</p></div>}</Card>
          <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><Activity className="h-5 w-5 text-primary-700" /><h2 className="font-bold text-slate-900">گردش محتوای اخیر</h2></div>{data.workflow.length ? <div className="divide-y divide-slate-100">{data.workflow.slice(0, 12).map((item) => <div key={item.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-800">{item.action.replaceAll('-', ' ')}</p><Badge variant={item.stage === 'failed' ? 'danger' : item.stage === 'published' || item.stage === 'routed' ? 'success' : 'default'}>{item.toStatus}</Badge></div><p className="mt-1 text-xs text-slate-400">{formatJalaliDateTime(item.createdAt)}</p></div>)}</div> : <p className="px-5 py-12 text-center text-sm text-slate-500">هنوز گردش محتوایی ثبت نشده است.</p>}</Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">ثبت رویدادهای مدیریتی</h2><p className="mt-1 text-xs text-slate-500">عملیات تغییردهنده همراه با نتیجه و عامل اجرا</p></div>{data.audit.length ? <div className="divide-y divide-slate-100">{data.audit.slice(0, 12).map((item) => <div key={item.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-medium text-slate-800">{item.changes?.method || item.action} {item.changes?.path || item.entityType}</p><Badge variant={item.changes?.outcome === 'failure' ? 'danger' : 'success'}>{item.changes?.outcome === 'failure' ? 'ناموفق' : 'موفق'}</Badge></div><p className="mt-1 text-xs text-slate-400">{item.user?.name || item.user?.email || 'سیستم'} · {formatJalaliDateTime(item.createdAt)}</p></div>)}</div> : <p className="px-5 py-12 text-center text-sm text-slate-500">هنوز رویداد مدیریتی ثبت نشده است.</p>}</Card>
          <Card className="overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">فعالیت‌های اخیر</h2><p className="mt-1 text-xs text-slate-500">تغییرات انسانی و خودکار در فضای کاری</p></div>{data.activity.length ? <div className="divide-y divide-slate-100">{data.activity.slice(0, 12).map((item) => <div key={item.id} className="px-5 py-3"><p className="text-sm text-slate-800">{item.title}</p><p className="mt-1 text-xs text-slate-400">{formatJalaliDateTime(item.createdAt)}</p></div>)}</div> : <p className="px-5 py-12 text-center text-sm text-slate-500">هنوز فعالیتی ثبت نشده است.</p>}</Card>
        </section>
      </>}
    </main>
  </ProtectedLayout>;
}

function QueueCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return <Card className="p-4"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>{icon}</span><div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{formatPersianDigits(value)}</p></div></div></Card>;
}
