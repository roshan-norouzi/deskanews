'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { PlatformAdminPanel } from '@/components/settings/platform-admin-panel';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';

function PlatformAdminPageContent() {
  const searchParams = useSearchParams();
  const { isSuperAdmin } = useAuth();
  const initialTab = searchParams.get('tab') === 'credits' ? 'credits' as const : 'users' as const;

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
          description="کاربران، سازمان‌ها و اعتبار سازمان‌ها."
          icon={ShieldCheck}
        />
        <PlatformAdminPanel embedded initialTab={initialTab} />
      </div>
    </ProtectedLayout>
  );
}

export default function PlatformAdminPage() {
  return (
    <Suspense fallback={<ProtectedLayout title="مدیریت پلتفرم"><div className="grid min-h-40 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div></ProtectedLayout>}>
      <PlatformAdminPageContent />
    </Suspense>
  );
}
