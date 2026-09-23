'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Crown,
  Plus,
  Users,
} from 'lucide-react';
import { TENANT_ROLE_LABELS, USAGE_UNIT_LABEL, formatPersianDigits, type TenantRole } from '@deska/shared';
import { OrganizationUsageMini } from '@/components/organizations/organization-usage-mini';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import {
  OrganizationUsagePanel,
  type TenantUsageSummary,
} from '@/components/settings/organization-usage-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { apiFetch, cn } from '@/lib/utils';

interface CreatedOrganization {
  id: string;
  name: string;
  slug: string;
}

export default function OrganizationsPage() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { tenants, activeTenantId, setActiveTenant, refreshTenants, isLoading } = useTenant();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, TenantUsageSummary>>({});
  const [usageErrors, setUsageErrors] = useState<Record<string, boolean>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const usageDetailRef = useRef<HTMLDivElement>(null);

  const memberships = useMemo(() => {
    const fromUser = user?.tenants ?? [];
    return tenants.map((tenant) => ({
      ...tenant,
      joinedAt: fromUser.find((membership) => membership.id === tenant.id)?.joinedAt,
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
    router.push('/dashboard');
  };

  const createOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const created = await apiFetch<CreatedOrganization>('/tenants', {
        method: 'POST',
        body: { name: name.trim(), slug: slug.trim().toLowerCase(), locale: 'fa-IR' },
        skipTenant: true,
      });
      await Promise.all([refresh(), refreshTenants()]);
      setActiveTenant(created.id);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ایجاد سازمان انجام نشد.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedLayout title="سازمان‌های من" tenantRequired={false} showPlatformNav>
      <PageContainer>
        <PageHeader
          title="سازمان‌های من"
          description="سازمان موردنظر را انتخاب کن، مصرف را ببین و وارد اتاق خبر شو."
          icon={Building2}
        />

        {!isLoading && memberships.length > 0 && (
          <section className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary-700">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-slate-500">سازمان‌های در دسترس</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatPersianDigits(memberships.length)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Activity className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-slate-500">مصرف کل</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {usageLoading ? '…' : formatPersianDigits(String(totalUsage))}
                    <span className="mr-1 text-sm font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">سازمان فعال</p>
                  <p className="truncate text-lg font-bold text-slate-900">
                    {memberships.find((org) => org.id === activeTenantId)?.name ?? 'انتخاب نشده'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>سازمان‌های در دسترس</CardTitle>
                <CardDescription>
                  {memberships.length
                    ? `${formatPersianDigits(memberships.length)} سازمان — برای جزئیات مصرف یک سازمان را انتخاب کنید.`
                    : 'هنوز عضو هیچ سازمانی نیستید.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[0, 1].map((key) => (
                      <div key={key} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
                    ))}
                  </div>
                ) : memberships.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-center">
                    <Building2 className="h-10 w-10 text-slate-300" />
                    <h2 className="mt-4 font-semibold text-slate-800">نخستین سازمان خود را بسازید</h2>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                      پس از ساخت سازمان، مالک آن می‌شوید و می‌توانید تیم و منابع خبری را تنظیم کنید.
                    </p>
                  </div>
                ) : (
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
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700">
                              <Building2 className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate font-semibold text-slate-900">{organization.name}</h3>
                                {isOwner && (
                                  <Badge variant="warning">
                                    <Crown className="ml-1 h-3 w-3" />
                                    مالک
                                  </Badge>
                                )}
                                {isActive && <Badge variant="success">فعال</Badge>}
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                نامک: <span dir="ltr">{organization.slug}</span>
                                {' · '}
                                {TENANT_ROLE_LABELS[organization.memberRole as TenantRole] ?? organization.memberRole}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 border-t border-slate-100 pt-4">
                            <OrganizationUsageMini
                              usage={usageMap[organization.id] ?? null}
                              loading={usageLoading}
                              error={usageErrors[organization.id]}
                            />
                          </div>

                          <Button
                            className="mt-4 w-full"
                            variant={isActive ? 'secondary' : 'primary'}
                            onClick={(event) => {
                              event.stopPropagation();
                              enterWorkspace(organization.id);
                            }}
                          >
                            ورود به سازمان
                            <ArrowLeft className="h-4 w-4" />
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                )}
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
              ) : memberships.length > 1 ? (
                <Card>
                  <CardContent className="grid min-h-40 place-items-center px-5 py-10 text-center">
                    <Activity className="h-10 w-10 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-700">سازمانی انتخاب نشده</p>
                    <p className="mt-1 text-xs text-slate-500">روی یکی از کارت‌های بالا کلیک کنید تا جزئیات مصرف نمایش داده شود.</p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary-600" />
                  ایجاد سازمان
                </CardTitle>
                <CardDescription>مالک سازمان تازه خواهید بود.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={createOrganization} className="space-y-4">
                  <Input
                    label="نام سازمان"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={100}
                  />
                  <Input
                    label="نامک (لاتین در نشانی)"
                    dir="ltr"
                    value={slug}
                    onChange={(event) =>
                      setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    }
                    placeholder="my-newsroom"
                    pattern="[a-z0-9-]+"
                    required
                  />
                  {error && (
                    <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                      {error}
                    </div>
                  )}
                  <Button type="submit" className="w-full" isLoading={creating}>
                    <Users className="h-4 w-4" />
                    ساخت سازمان و ورود
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-dashed border-slate-200 bg-slate-50/80">
              <CardContent className="space-y-2 p-5 text-sm leading-6 text-slate-600">
                <p className="font-semibold text-slate-800">درباره مصرف</p>
                <p>
                  مصرف بر اساس فرایندهای اتاق خبر و استودیو (پایش، آماده‌سازی، خلاصه‌سازی، بازنویسی، ترجمه، انتشار، کاور و شبکه‌های اجتماعی) محاسبه می‌شود.
                  واحد نمایش: {USAGE_UNIT_LABEL}.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </PageContainer>
    </ProtectedLayout>
  );
}
