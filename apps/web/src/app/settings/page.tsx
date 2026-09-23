'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Coins, Users } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { OrganizationSettingsPanel } from '@/components/settings/organization-settings-panel';
import { UsersSettingsPanel } from '@/components/settings/users-settings-panel';
import { OrganizationWalletPanel } from '@/components/settings/organization-wallet-panel';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { cn } from '@/lib/utils';

type SettingsTab = 'organization' | 'users' | 'wallet';

const TAB_DEFINITIONS: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof Building2;
  ownerOnly?: boolean;
}> = [
  { id: 'organization', label: 'سازمان', icon: Building2, ownerOnly: true },
  { id: 'users', label: 'کاربران', icon: Users, ownerOnly: true },
  { id: 'wallet', label: 'کیف پول', icon: Coins, ownerOnly: true },
];

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin } = useAuth();
  const { activeTenant } = useTenant();
  const isOwner = isSuperAdmin || activeTenant?.memberRole === 'owner';

  const availableTabs = useMemo(
    () =>
      TAB_DEFINITIONS.filter((tab) => {
        if (tab.ownerOnly && !isOwner) return false;
        return true;
      }),
    [isOwner],
  );

  const requestedTab = searchParams.get('tab') as SettingsTab | 'account' | null;

  useEffect(() => {
    if (searchParams.get('tab') === 'platform') {
      router.replace('/platform');
      return;
    }
    if (searchParams.get('tab') === 'account') {
      router.replace('/settings/account');
      return;
    }
    if (availableTabs.length === 0) {
      router.replace('/settings/account');
    }
  }, [searchParams, router, availableTabs.length]);

  const defaultTab: SettingsTab = 'organization';
  const activeTab = availableTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as SettingsTab)
    : defaultTab;
  const tenantRequired = activeTab === 'organization' || activeTab === 'users' || activeTab === 'wallet';

  useEffect(() => {
    if (availableTabs.length === 0) return;
    if (requestedTab === 'account') return;
    if (requestedTab === activeTab) return;
    if (!availableTabs.some((tab) => tab.id === requestedTab)) {
      router.replace(`/settings?tab=${activeTab}`);
    }
  }, [activeTab, requestedTab, router, availableTabs]);

  function selectTab(tab: SettingsTab) {
    router.replace(`/settings?tab=${tab}`);
  }

  if (availableTabs.length === 0) {
    return (
      <ProtectedLayout title="تنظیمات سازمان" tenantRequired={false}>
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title="تنظیمات سازمان" tenantRequired={tenantRequired}>
      <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  selected ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'organization' && <OrganizationSettingsPanel />}
        {activeTab === 'users' && <UsersSettingsPanel />}
        {activeTab === 'wallet' && <OrganizationWalletPanel tenantId={activeTenant?.id ?? null} />}
      </div>
    </ProtectedLayout>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
