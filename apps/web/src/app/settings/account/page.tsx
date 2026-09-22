'use client';

import { ProtectedLayout } from '@/components/layout/protected-layout';
import { AccountSettingsPanel } from '@/components/settings/account-settings-panel';

export default function AccountSettingsPage() {
  return (
    <ProtectedLayout title="حساب کاربری" tenantRequired={false}>
      <div className="mx-auto w-full max-w-7xl" dir="rtl">
        <AccountSettingsPanel />
      </div>
    </ProtectedLayout>
  );
}
