'use client';

import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  RefreshCw,
  Rss,
  Send,
} from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { formatJalaliDateTime } from '@/lib/date';
import { OrganizationsDashboardSection } from '@/components/organizations/organizations-dashboard-section';

interface DashboardStats {
  publishing: {
    newsroom: {
      inbox: number;
      preparing: number;
      ready: number;
      failed: number;
      publishedToday: number;
      processing: number;
      action: number;
      archive: number;
      rejected: number;
      total: number;
    };
    social: { inbox: number; preparing: number; ready: number; failed: number; publishedToday: number };
    queue: { queued: number; running: number; completed: number; dead: number; cancelled: number };
    unhealthyIntegrations: number;
  };
  notifications: { unread: number };
  generatedAt: string;
}

function DashboardContent() {
  const { data, isLoading, error, refetch } = useApi<DashboardStats>('/dashboard/stats');

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
    );
  }

  if (!data) return null;

  const stats = [
    { label: 'در پردازش (اتاق خبر)', value: data.publishing.newsroom.processing, icon: Rss, tone: 'bg-blue-50 text-blue-600' },
    { label: 'ورودی استودیو', value: data.publishing.social.inbox, icon: Send, tone: 'bg-violet-50 text-violet-600' },
    { label: 'کارهای صف', value: data.publishing.queue.queued + data.publishing.queue.running, icon: Bot, tone: 'bg-cyan-50 text-cyan-600' },
    {
      label: 'فرایندهای متوقف',
      value: data.publishing.queue.dead,
      icon: Activity,
      tone: data.publishing.queue.dead ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'اتصال ناسالم',
      value: data.publishing.unhealthyIntegrations,
      icon: AlertTriangle,
      tone: data.publishing.unhealthyIntegrations ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'اعلان خوانده‌نشده',
      value: data.notifications.unread,
      icon: Bell,
      tone: data.notifications.unread ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="lytic-page-title">داشبورد</h2>
          <p className="mt-1 text-sm text-slate-500">
            آخرین بروزرسانی: {formatJalaliDateTime(data.generatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
            بروزرسانی
          </Button>
          <Link href="/publishing/operations">
            <Button size="sm">مرکز عملیات</Button>
          </Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </section>

      <OrganizationsDashboardSection />

      <section className="grid gap-4 lg:grid-cols-2">
        <PublishingSummary
          title="اتاق خبر"
          href="/publishing/news"
          icon={<Rss className="h-5 w-5 text-blue-600" />}
          values={[
            ['در پردازش', data.publishing.newsroom.processing],
            ['در حال انجام', data.publishing.newsroom.preparing],
            ['آماده اقدام', data.publishing.newsroom.action],
            ['خطادار', data.publishing.newsroom.failed],
            ['منتشر / استودیو', data.publishing.newsroom.archive],
            ['امروز', data.publishing.newsroom.publishedToday],
          ]}
        />
        <PublishingSummary
          title="استودیوی اجتماعی"
          href="/publishing/social"
          icon={<Send className="h-5 w-5 text-violet-600" />}
          values={[
            ['ورودی', data.publishing.social.inbox],
            ['در حال کار', data.publishing.social.preparing],
            ['آماده', data.publishing.social.ready],
            ['خطادار', data.publishing.social.failed],
            ['امروز', data.publishing.social.publishedToday],
          ]}
        />
      </section>
    </div>
  );
}

function PublishingSummary({
  title,
  href,
  icon,
  values,
}: {
  title: string;
  href: string;
  icon: React.ReactNode;
  values: Array<[string, number]>;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-slate-900">{title}</h3>
        </div>
        <Link href={href} className="text-sm font-medium text-primary-600 hover:text-primary-700">مشاهده</Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {values.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-100 p-3 text-center">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{formatPersianDigits(value)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedLayout>
      <DashboardContent />
    </ProtectedLayout>
  );
}
