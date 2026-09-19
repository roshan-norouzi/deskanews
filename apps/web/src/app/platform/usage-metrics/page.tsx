'use client';

import { Gauge } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { PlatformUsageMetricsPanel } from '@/components/settings/platform-usage-metrics-panel';
import { useAuth } from '@/lib/auth-context';

export default function PlatformUsageMetricsPage() {
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) {
    return (
      <ProtectedLayout title="تعرفه مصرف">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">فقط مدیر کل به این بخش دسترسی دارد.</div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title="تعرفه مصرف">
      <div className="mx-auto w-full max-w-5xl space-y-4" dir="rtl">
        <header className="flex items-start gap-4 rounded-2xl bg-slate-950 p-6 text-white">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Gauge className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">تعرفه مصرف</h1>
            <p className="mt-2 text-sm text-slate-300">تنظیم هزینه فرایندهای مصرف برای همه سازمان‌های پلتفرم.</p>
          </div>
        </header>
        <PlatformUsageMetricsPanel />
      </div>
    </ProtectedLayout>
  );
}
