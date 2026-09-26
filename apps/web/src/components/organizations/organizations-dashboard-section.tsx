'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { TENANT_ROLE_LABELS, type TenantRole } from '@deska/shared';
import { UsageProcessTable, UsageSnapshot } from '@/components/dashboard/usage-board';
import {
  type TenantUsageSummary,
} from '@/components/settings/organization-usage-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { apiFetch, cn } from '@/lib/utils';

export function OrganizationsDashboardSection() {
  const router = useRouter();
  const { user } = useAuth();
  const { tenants, activeTenantId, setActiveTenant, isLoading } = useTenant();
  const [usageMap, setUsageMap] = useState<Record<string, TenantUsageSummary>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const memberships = useMemo(() => {
    const fromUser = user?.tenants ?? [];
    return tenants.map((tenant) => ({
      ...tenant,
      memberRole:
        tenant.memberRole
        ?? fromUser.find((membership) => membership.id === tenant.id)?.memberRole
        ?? 'member',
    }));
  }, [tenants, user?.tenants]);

  useEffect(() => {
    if (!memberships.length) {
      setSelectedOrgId(null);
      return;
    }
    setSelectedOrgId((current) => {
      if (current && memberships.some((org) => org.id === current)) return current;
      return activeTenantId && memberships.some((org) => org.id === activeTenantId)
        ? activeTenantId
        : memberships[0].id;
    });
  }, [memberships, activeTenantId]);

  useEffect(() => {
    if (!memberships.length) {
      setUsageMap({});
      return;
    }

    let cancelled = false;
    setUsageLoading(true);

    void Promise.all(
      memberships.map(async (org) => {
        try {
          const usage = await apiFetch<TenantUsageSummary>(`/tenants/${org.id}/usage`, {
            skipTenant: true,
            headers: { 'X-Tenant-Id': org.id },
          });
          return [org.id, usage] as const;
        } catch {
          return [org.id, null] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, TenantUsageSummary> = {};
      for (const [id, usage] of results) {
        if (usage) next[id] = usage;
      }
      setUsageMap(next);
      setUsageLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [memberships]);

  const selectedOrg = memberships.find((org) => org.id === selectedOrgId) ?? null;
  const selectedUsage = selectedOrg ? usageMap[selectedOrg.id] ?? null : null;

  const enterWorkspace = (tenantId: string) => {
    setActiveTenant(tenantId);
    router.push('/publishing/news');
  };

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-card border border-surface-border bg-white" />;
  }

  if (!memberships.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center px-6 py-12 text-center">
          <Building2 className="h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium text-slate-800">هنوز عضو هیچ میز خبری نیستید</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            برای شروع کار خبری، نخستین میز خبرتان را بسازید.
          </p>
          <Button className="mt-5" onClick={() => router.push('/organizations')}>
            ساخت میز خبر
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">مصرف میز خبر</h2>
        <Link href="/organizations" className="text-sm font-medium text-primary-700 hover:text-primary-800">
          مدیریت میزهای خبر
        </Link>
      </div>

      {memberships.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="انتخاب میز خبر">
          {memberships.map((org) => {
            const selected = org.id === selectedOrg?.id;
            return (
              <button
                key={org.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedOrgId(org.id)}
                className={cn(
                  'h-9 shrink-0 rounded-lg px-3 text-sm font-medium transition',
                  selected
                    ? 'bg-primary-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {org.name}
              </button>
            );
          })}
        </div>
      )}

      {selectedOrg && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-slate-900">{selectedOrg.name}</h3>
                {selectedOrg.memberRole === 'owner' && <Badge variant="warning">مالک</Badge>}
                {activeTenantId === selectedOrg.id && <Badge variant="success">فعال</Badge>}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {TENANT_ROLE_LABELS[selectedOrg.memberRole as TenantRole] ?? selectedOrg.memberRole}
              </p>
            </div>
            <Button size="sm" onClick={() => enterWorkspace(selectedOrg.id)}>
              ورود به میز خبر
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4 p-5">
            <UsageSnapshot usage={selectedUsage} loading={usageLoading} />
            <UsageProcessTable usage={selectedUsage} loading={usageLoading} />
          </div>
        </Card>
      )}
    </section>
  );
}
