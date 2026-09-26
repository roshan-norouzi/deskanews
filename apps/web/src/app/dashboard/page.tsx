'use client';

import Link from 'next/link';
import { AlertTriangle, LayoutDashboard, RefreshCw } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { OrganizationsDashboardSection } from '@/components/organizations/organizations-dashboard-section';
import { WorkQueueCard } from '@/components/dashboard/work-queue-card';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { NoticeBanner } from '@/components/ui/notice-banner';
import { PageLoading } from '@/components/ui/page-loading';
import { useApi } from '@/hooks/use-api';
import { formatJalaliDateTime } from '@/lib/date';
import { useTenant } from '@/lib/tenant-context';

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
  const { activeTenant } = useTenant();

  if (isLoading) {
    return <PageLoading className="py-24" />;
  }

  if (error) {
    return (
      <NoticeBanner tone="error">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>بارگذاری داشبورد انجام نشد: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>تلاش مجدد</Button>
        </div>
      </NoticeBanner>
    );
  }

  if (!data) return null;

  const alerts: Array<{ text: string; href: string }> = [];
  if (data.publishing.newsroom.failed > 0) {
    alerts.push({
      text: `${formatPersianDigits(data.publishing.newsroom.failed)} خبر به‌دلیل خطا نیاز به بررسی دارد. جزئیات را در میز خبر ببینید.`,
      href: '/publishing/news',
    });
  }
  if (data.publishing.social.failed > 0) {
    alerts.push({
      text: `${formatPersianDigits(data.publishing.social.failed)} مطلب در استودیوی اجتماعی نیاز به بررسی خطا دارد.`,
      href: '/publishing/social',
    });
  }
  if (data.publishing.queue.dead > 0) {
    alerts.push({
      text: `${formatPersianDigits(data.publishing.queue.dead)} فرایند متوقف‌شده در صف وجود دارد.`,
      href: '/publishing/operations',
    });
  }
  if (data.publishing.unhealthyIntegrations > 0) {
    alerts.push({
      text: `${formatPersianDigits(data.publishing.unhealthyIntegrations)} اتصال نیاز به بررسی دارد. جزئیات را در مرکز عملیات ببینید.`,
      href: '/publishing/operations',
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="داشبورد"
        icon={LayoutDashboard}
        description={
          activeTenant
            ? `${activeTenant.name} · آخرین به‌روزرسانی ${formatJalaliDateTime(data.generatedAt)}`
            : `آخرین به‌روزرسانی ${formatJalaliDateTime(data.generatedAt)}`
        }
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" />
              به‌روزرسانی
            </Button>
            <Link href="/publishing/operations">
              <Button variant="outline" size="sm">مرکز عملیات</Button>
            </Link>
            <Link href="/publishing/news">
              <Button size="sm">میز خبر</Button>
            </Link>
          </>
        )}
      />

      {alerts.length > 0 && (
        <NoticeBanner tone="error">
          <div className="space-y-1">
            {alerts.map((alert) => (
              <p key={alert.text} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <Link href={alert.href} className="font-medium underline-offset-2 hover:underline">
                  {alert.text}
                </Link>
              </p>
            ))}
          </div>
        </NoticeBanner>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <WorkQueueCard
          title="میز خبر"
          href="/publishing/news"
          actionLabel="باز کردن"
          metrics={[
            { label: 'آمادهٔ بررسی', value: data.publishing.newsroom.action, href: '/publishing/news', tone: data.publishing.newsroom.failed > 0 ? 'default' : 'action' },
            { label: 'نیازمند بررسی', value: data.publishing.newsroom.failed, href: '/publishing/news', tone: 'danger' },
            { label: 'در پردازش', value: data.publishing.newsroom.processing, href: '/publishing/news' },
            { label: 'در حال انجام', value: data.publishing.newsroom.preparing, href: '/publishing/news' },
            { label: 'منتشرشده امروز', value: data.publishing.newsroom.publishedToday, href: '/publishing/news' },
          ]}
        />
        <WorkQueueCard
          title="استودیوی اجتماعی"
          href="/publishing/social"
          actionLabel="باز کردن"
          metrics={[
            { label: 'آماده انتشار', value: data.publishing.social.ready, href: '/publishing/social', tone: 'action' },
            { label: 'نیازمند بررسی', value: data.publishing.social.failed, href: '/publishing/social', tone: 'danger' },
            { label: 'ورودی', value: data.publishing.social.inbox, href: '/publishing/social' },
            { label: 'در حال آماده‌سازی', value: data.publishing.social.preparing, href: '/publishing/social' },
            { label: 'منتشرشده امروز', value: data.publishing.social.publishedToday, href: '/publishing/social' },
          ]}
        />
      </section>

      <OrganizationsDashboardSection />
    </PageContainer>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedLayout>
      <DashboardContent />
    </ProtectedLayout>
  );
}
