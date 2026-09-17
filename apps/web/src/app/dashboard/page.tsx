'use client';

import Link from 'next/link';
import { AlertTriangle, Bell, Bot, Calendar, CheckCircle2, Clock3, LayoutDashboard, Rss, Send, UserCheck, Users } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { formatJalaliDateTime } from '@/lib/date';

interface WorkItem { id: string; kind: 'news' | 'social' | 'automation'; title: string; subtitle: string; status: string; stage: string; error: string; updatedAt: string; href: string }
interface ActivityItem { id: string; title: string; createdAt: string; type: string }
interface DashboardStats {
  contacts: number;
  employees: { active: number };
  core: { upcomingEvents: number; overdueTasks: number };
  publishing: {
    newsroom: { inbox: number; preparing: number; ready: number; failed: number; publishedToday: number };
    social: { inbox: number; preparing: number; ready: number; failed: number; publishedToday: number };
    queue: { queued: number; running: number; completed: number; dead: number; cancelled: number };
    unhealthyIntegrations: number;
  };
  notifications: { unread: number };
  workItems: WorkItem[];
  recentActivity: ActivityItem[];
  generatedAt: string;
}

const STAGE_LABELS: Record<string, string> = {
  inbox: 'ورودی جدید', preparing: 'در حال آماده‌سازی', ready: 'آماده اقدام', publishing: 'در حال انتشار',
  routed: 'ارسال‌شده به استودیو', published: 'منتشرشده', failed: 'نیازمند رسیدگی', archived: 'آرشیو', rejected: 'ردشده',
};

function stageVariant(stage: string): 'default' | 'success' | 'warning' | 'danger' {
  if (stage === 'failed') return 'danger';
  if (stage === 'published' || stage === 'routed') return 'success';
  if (stage === 'ready') return 'warning';
  return 'default';
}

function DashboardContent() {
  const { data, isLoading, error } = useApi<DashboardStats>('/dashboard/stats');
  if (isLoading) return <div className="flex justify-center py-24"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>;
  if (!data) return null;

  const stats = [
    { title: 'مخاطبین', value: data.contacts, icon: Users, tone: 'bg-blue-50 text-blue-700' },
    { title: 'کارمندان فعال', value: data.employees.active, icon: UserCheck, tone: 'bg-violet-50 text-violet-700' },
    { title: 'رویدادهای ۷ روز آینده', value: data.core.upcomingEvents, icon: Calendar, tone: 'bg-amber-50 text-amber-700' },
    { title: 'وظایف عقب‌افتاده', value: data.core.overdueTasks, icon: Clock3, tone: data.core.overdueTasks ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700' },
    { title: 'کارهای صف', value: data.publishing.queue.queued + data.publishing.queue.running, icon: Bot, tone: 'bg-cyan-50 text-cyan-700' },
    { title: 'اتصال‌های ناسالم', value: data.publishing.unhealthyIntegrations, icon: AlertTriangle, tone: data.publishing.unhealthyIntegrations ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700' },
  ];

  return <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
    <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-start">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><LayoutDashboard className="h-6 w-6" /></span>
      <div className="flex-1"><h2 className="text-2xl font-bold">میز کار امروز</h2><p className="mt-2 text-sm text-slate-300">موارد نیازمند اقدام، سلامت فرایندها و آخرین فعالیت‌های سازمان</p><p className="mt-1 text-xs text-slate-400">آخرین بروزرسانی: {formatJalaliDateTime(data.generatedAt)}</p></div>
      <Link href="/publishing/operations" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium ring-1 ring-white/20 hover:bg-white/15">مرکز عملیات</Link>
    </header>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stats.map(({ title, value, icon: Icon, tone }) => <Card key={title}><CardContent className="flex items-center gap-4 p-5"><span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span><div><p className="text-sm text-slate-500">{title}</p><p className="mt-1 text-2xl font-bold text-slate-900">{formatPersianDigits(value)}</p></div></CardContent></Card>)}
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <PublishingSummary title="اتاق خبر" href="/publishing/news" icon={<Rss className="h-5 w-5 text-blue-700" />} values={[['ورودی', data.publishing.newsroom.inbox], ['در حال کار', data.publishing.newsroom.preparing], ['آماده', data.publishing.newsroom.ready], ['خطادار', data.publishing.newsroom.failed], ['امروز', data.publishing.newsroom.publishedToday]]} />
      <PublishingSummary title="استودیوی اجتماعی" href="/publishing/social" icon={<Send className="h-5 w-5 text-violet-700" />} values={[['ورودی', data.publishing.social.inbox], ['در حال کار', data.publishing.social.preparing], ['آماده', data.publishing.social.ready], ['خطادار', data.publishing.social.failed], ['امروز', data.publishing.social.publishedToday]]} />
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><Bell className="h-5 w-5 text-amber-600" /><h3 className="font-bold text-slate-900">صندوق کار</h3></div><span className="text-xs text-slate-500">{formatPersianDigits(data.workItems.length)} مورد اخیر</span></div>{data.workItems.length ? <div className="divide-y divide-slate-100">{data.workItems.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.href} className="block px-5 py-4 transition hover:bg-slate-50"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><p className="truncate font-medium text-slate-900">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.subtitle} · {formatJalaliDateTime(item.updatedAt)}</p>{item.error && <p className="mt-2 line-clamp-2 text-xs leading-5 text-red-700">{item.error}</p>}</div><Badge variant={stageVariant(item.stage)}>{STAGE_LABELS[item.stage] || item.status}</Badge></div></Link>)}</div> : <div className="grid place-items-center px-5 py-14 text-center"><CheckCircle2 className="h-10 w-10 text-emerald-500" /><p className="mt-3 font-medium text-slate-800">مورد معطل یا خطاداری وجود ندارد</p></div>}</Card>
      <Card className="overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h3 className="font-bold text-slate-900">آخرین فعالیت‌ها</h3></div>{data.recentActivity.length ? <div className="divide-y divide-slate-100">{data.recentActivity.map((item) => <div key={item.id} className="px-5 py-3"><p className="text-sm text-slate-800">{item.title}</p><p className="mt-1 text-xs text-slate-400">{formatJalaliDateTime(item.createdAt)}</p></div>)}</div> : <p className="px-5 py-12 text-center text-sm text-slate-500">هنوز فعالیتی ثبت نشده است.</p>}</Card>
    </section>
  </div>;
}

function PublishingSummary({ title, href, icon, values }: { title: string; href: string; icon: React.ReactNode; values: Array<[string, number]> }) {
  return <Card className="p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2">{icon}<h3 className="font-bold text-slate-900">{title}</h3></div><Link href={href} className="text-sm text-primary-700">مشاهده</Link></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">{values.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{formatPersianDigits(value)}</p></div>)}</div></Card>;
}

export default function DashboardPage() {
  return <ProtectedLayout title="داشبورد"><DashboardContent /></ProtectedLayout>;
}
