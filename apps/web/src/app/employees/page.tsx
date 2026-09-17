'use client'

import { ProtectedLayout } from '@/components/layout/protected-layout'
import { OrganizationEmployeesPanel } from '@/components/settings/organization-employees-panel'
import { useTenant } from '@/lib/tenant-context'

export default function EmployeesPage() {
  const { activeTenantId, activeTenant } = useTenant()

  return (
    <ProtectedLayout title="کارمندان">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">کارمندان</h2>
          <p className="mt-1 text-sm text-slate-500">
            کاربران سازمان {activeTenant?.name ?? ''} — بخش هسته
          </p>
        </div>
        <OrganizationEmployeesPanel
          tenantId={activeTenantId}
          memberRole={activeTenant?.memberRole}
        />
      </div>
    </ProtectedLayout>
  )
}
