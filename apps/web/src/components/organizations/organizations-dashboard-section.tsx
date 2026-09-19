'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Crown,
} from 'lucide-react';
import { TENANT_ROLE_LABELS, USAGE_UNIT_LABEL, formatPersianDigits, type TenantRole } from '@deska/shared';
import { OrganizationUsageMini } from '@/components/organizations/organization-usage-mini';
import {
  OrganizationUsagePanel,
  type TenantUsageSummary,
} from '@/components/settings/organization-usage-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { apiFetch, cn } from '@/lib/utils';

export function OrganizationsDashboardSection() {
  const router = useRouter();
  const { user } = useAuth();
  const { tenants, activeTenantId, setActiveTenant, isLoading } = useTenant();
  const [usageMap, setUsageMap] = useState<Record<string, TenantUsageSummary>>({});
  const [usageErrors, setUsageErrors] = useState<Record<string, boolean>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const usageDetailRef = useRef<HTMLDivElement>(null);

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

  const selectedId = selectedOrgId;
  const selectedOrg = selectedId ? memberships.find((org) => org.id === selectedId) ?? null : null;

  useEffect(() => {
    if (memberships.length === 1 && !selectedOrgId) {
      setSelectedOrgId(memberships[0].id);
    }
  }, [memberships, selectedOrgId]);

  const selectOrganization = (organizationId: string) => {
    setSelectedOrgId(organizationId);
    window.requestAnimationFrame(() => {
      usageDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const totalUsage = useMemo(
    () => Object.values(usageMap).reduce((sum, usage) => sum + usage.totalCost, 0),
    [usageMap],
  );

  useEffect(() => {
    if (!memberships.length) {
      setUsageMap({});
      setUsageErrors({});
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
      const errors: Record<string, boolean> = {};
      for (const [id, usage] of results) {
        if (usage) next[id] = usage;
        else errors[id] = true;
      }
      setUsageMap(next);
      setUsageErrors(errors);
      setUsageLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [memberships]);

  const enterWorkspace = (tenantId: string) => {
    setActiveTenant(tenantId);
    router.push('/publishing/news');
  };

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="grid min-h-40 place-items-center p-6">
          <span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  if (!memberships.length) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary-700" />
            <CardTitle>سازمان‌ها</CardTitle>
          </div>
          <Link href="/organizations" className="text-sm text-primary-700">مدیریت سازمان‌ها</Link>
        </CardHeader>
        <CardContent className="grid place-items-center px-5 py-12 text-center">
          <Building2 className="h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium text-slate-800">هنوز عضو هیچ سازمانی نیستید</p>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            برای شروع کار خبری، نخستین سازمان خود را بسازید.
          </p>
          <Button className="mt-5" onClick={() => router.push('/organizations')}>
            ساخت سازمان
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary-700" />
          <h3 className="text-lg font-bold text-slate-900">سازمان‌های من</h3>
        </div>
        <Link href="/organizations" className="text-sm text-primary-700">
          مدیریت کامل
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary-700">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">سازمان‌ها</p>
              <p className="text-xl font-bold">{formatPersianDigits(memberships.length)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">مصرف کل</p>
              <p className="text-xl font-bold">
                {usageLoading ? '…' : formatPersianDigits(String(totalUsage))}
                <span className="mr-1 text-xs font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">سازمان فعال</p>
              <p className="truncate text-base font-bold">
                {memberships.find((org) => org.id === activeTenantId)?.name ?? 'انتخاب نشده'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>
              {memberships.length > 1
                ? 'برای مشاهده جزئیات مصرف، یک سازمان را انتخاب کنید.'
                : 'جزئیات مصرف سازمان در کنار کارت نمایش داده می‌شود.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {memberships.map((organization) => {
                const isOwner = organization.memberRole === 'owner';
                const isActive = activeTenantId === organization.id;
                const isSelected = selectedId === organization.id;

                return (
                  <article
                    key={organization.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectOrganization(organization.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectOrganization(organization.id);
                      }
                    }}
                    className={cn(
                      'flex flex-col rounded-2xl border p-4 text-right transition hover:shadow-card focus:outline-none focus:ring-2 focus:ring-primary-500/30',
                      isSelected
                        ? 'border-primary-400 bg-primary-50/40 ring-2 ring-primary-100'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate font-semibold text-slate-900">{organization.name}</h4>
                          {isOwner && (
                            <Badge variant="warning">
                              <Crown className="ml-1 h-3 w-3" />
                              مالک
                            </Badge>
                          )}
                          {isActive && <Badge variant="success">فعال</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {TENANT_ROLE_LABELS[organization.memberRole as TenantRole] ?? organization.memberRole}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <OrganizationUsageMini
                        usage={usageMap[organization.id] ?? null}
                        loading={usageLoading}
                        error={usageErrors[organization.id]}
                      />
                    </div>

                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      variant={isActive ? 'secondary' : 'primary'}
                      onClick={(event) => {
                        event.stopPropagation();
                        enterWorkspace(organization.id);
                      }}
                    >
                      ورود به اتاق خبر
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </article>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div ref={usageDetailRef}>
          {selectedOrg ? (
            <OrganizationUsagePanel
              tenantId={selectedOrg.id}
              title={`مصرف «${selectedOrg.name}»`}
              summary={usageMap[selectedOrg.id] ?? null}
              summaryLoading={usageLoading}
            />
          ) : (
            <Card>
              <CardContent className="grid min-h-48 place-items-center px-5 py-10 text-center">
                <Activity className="h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">سازمانی انتخاب نشده</p>
                <p className="mt-1 text-xs text-slate-500">روی یکی از کارت‌های سمت راست کلیک کنید تا جزئیات مصرف نمایش داده شود.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
