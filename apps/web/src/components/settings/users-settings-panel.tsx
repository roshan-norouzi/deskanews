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
        description="دسترسی هر عضو را با همان آیتم‌های منوی کناری تنظیم کنید. پس از ذخیره، کاربر باید یک‌بار از حساب خارج و دوباره وارد شود تا منوی جدید را ببیند."
        icon={Users}
      />
      <OrganizationUsersPanel tenantId={activeTenantId} memberRole={activeTenant?.memberRole} />
    </div>
  );
}
