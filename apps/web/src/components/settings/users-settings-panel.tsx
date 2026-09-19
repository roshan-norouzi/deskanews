'use client';

import { Users } from 'lucide-react';
import { OrganizationUsersPanel } from '@/components/settings/organization-users-panel';
import { useTenant } from '@/lib/tenant-context';
import { PageHeader } from '@/components/ui/page-header';

export function UsersSettingsPanel() {
  const { activeTenantId, activeTenant } = useTenant();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="کاربران"
        description={`اعضا و نقش‌های دسترسی سازمان ${activeTenant?.name ?? ''}`}
        icon={Users}
      />
      <OrganizationUsersPanel tenantId={activeTenantId} memberRole={activeTenant?.memberRole} />
    </div>
  );
}
