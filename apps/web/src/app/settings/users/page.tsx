'use client';

import { ProtectedLayout } from '@/components/layout/protected-layout';
import { OrganizationUsersPanel } from '@/components/settings/organization-users-panel';
import { useTenant } from '@/lib/tenant-context';

export default function SettingsUsersPage() {
  const { activeTenantId, activeTenant } = useTenant();

  return (
    <ProtectedLayout title="کاربران" ownerOnly>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">کاربران</h2>
          <p className="mt-1 text-sm text-slate-500">
            اعضا و نقش‌های دسترسی سازمان {activeTenant?.name ?? ''}
          </p>
        </div>
        <OrganizationUsersPanel
          tenantId={activeTenantId}
          memberRole={activeTenant?.memberRole}
        />
      </div>
    </ProtectedLayout>
  );
}
