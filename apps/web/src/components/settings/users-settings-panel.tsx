'use client';

import { Users } from 'lucide-react';
import { OrganizationUsersPanel } from '@/components/settings/organization-users-panel';
import { useTenant } from '@/lib/tenant-context';

export function UsersSettingsPanel() {
  const { activeTenantId, activeTenant } = useTenant();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-start gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-sky-950 p-6 text-white shadow-xl shadow-slate-900/10">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
          <Users className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">کاربران</h2>
          <p className="mt-2 text-sm text-slate-300">اعضا و نقش‌های دسترسی سازمان {activeTenant?.name ?? ''}</p>
        </div>
      </header>
      <OrganizationUsersPanel tenantId={activeTenantId} memberRole={activeTenant?.memberRole} />
    </div>
  );
}
