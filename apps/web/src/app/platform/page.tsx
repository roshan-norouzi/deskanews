'use client';

import { ShieldCheck } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { PlatformAdminPanel } from '@/components/settings/platform-admin-panel';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';

export default function PlatformAdminPage() {
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) {
    return (
      <ProtectedLayout>
        <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">فقط مدیر کل به این بخش دسترسی دارد.</div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
        <PageHeader
          title="مدیریت پلتفرم"
          description="کاربران، سازمان‌ها، تعرفه مصرف، هوش مصنوعی و کاتالوگ منابع سراسری."
          icon={ShieldCheck}
        />
        <PlatformAdminPanel embedded />
      </div>
    </ProtectedLayout>
  );
}
