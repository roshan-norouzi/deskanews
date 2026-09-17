'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { AppShell } from './app-shell';
import { PlatformNavigation } from './navigation';

interface ProtectedLayoutProps {
  children: ReactNode;
  title?: string;
  superAdminOnly?: boolean;
  platformAdminOnly?: boolean;
  ownerOnly?: boolean;
  tenantRequired?: boolean;
}

export function ProtectedLayout({
  children,
  title,
  superAdminOnly = false,
  platformAdminOnly = false,
  ownerOnly = false,
  tenantRequired = true,
}: ProtectedLayoutProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, isSuperAdmin, isPlatformAdmin } = useAuth();
  const { activeTenantId, activeTenant, isLoading: tenantLoading } = useTenant();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authLoading || tenantLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if ((superAdminOnly && !isSuperAdmin) || (platformAdminOnly && !isPlatformAdmin) || (ownerOnly && !isSuperAdmin && activeTenant?.memberRole !== 'owner')) {
      router.replace(activeTenantId ? '/dashboard' : '/organizations');
      return;
    }

    if (tenantRequired && !activeTenantId) {
      router.replace('/organizations');
      return;
    }

    setReady(true);
  }, [authLoading, tenantLoading, isAuthenticated, isSuperAdmin, isPlatformAdmin, activeTenantId, activeTenant?.memberRole, superAdminOnly, platformAdminOnly, ownerOnly, tenantRequired, router]);

  if (authLoading || tenantLoading || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          <p className="text-sm text-slate-500">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell title={title}>
      <PlatformNavigation />
      {children}
    </AppShell>
  );
}
