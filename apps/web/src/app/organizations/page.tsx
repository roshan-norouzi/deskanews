'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Crown, Plus, Users } from 'lucide-react';
import { TENANT_ROLE_LABELS, type TenantRole } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { apiFetch } from '@/lib/utils';

interface CreatedOrganization { id: string; name: string; slug: string; }

export default function OrganizationsPage() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { tenants, activeTenantId, setActiveTenant, refreshTenants, isLoading } = useTenant();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberships = useMemo(() => {
    const fromUser = user?.tenants ?? [];
    return tenants.map((tenant) => ({
      ...tenant,
      joinedAt: fromUser.find((membership) => membership.id === tenant.id)?.joinedAt,
      memberRole: tenant.memberRole ?? fromUser.find((membership) => membership.id === tenant.id)?.memberRole ?? 'member',
    }));
  }, [tenants, user?.tenants]);

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
    <ProtectedLayout title="سازمان‌های من" tenantRequired={false}>
      <main className="mx-auto max-w-6xl space-y-6" dir="rtl">
        <section className="rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-primary-950 p-6 text-white shadow-xl shadow-slate-900/10">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Building2 className="h-6 w-6" /></span>
            <div><h1 className="text-2xl font-bold">سازمان‌های من</h1><p className="mt-2 text-sm leading-6 text-slate-300">عضویت‌های خود را ببینید، میان میزکارها جابه‌جا شوید یا سازمان تازه‌ای ایجاد کنید.</p></div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader><CardTitle>میزکارهای در دسترس</CardTitle><CardDescription>{memberships.length ? `${memberships.length} سازمان برای شما در دسترس است.` : 'هنوز عضو هیچ سازمانی نیستید.'}</CardDescription></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-12 text-center text-sm text-slate-500">در حال دریافت سازمان‌ها...</div>
              ) : memberships.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-center"><Building2 className="h-10 w-10 text-slate-300" /><h2 className="mt-4 font-semibold text-slate-800">نخستین سازمان خود را بسازید</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">پس از ساخت سازمان، شما مالک آن هستید و می‌توانید کاربران را با سطح دسترسی دلخواه اضافه کنید.</p></div>
              ) : (
                <div className="space-y-3">
                  {memberships.map((organization) => {
                    const isOwner = organization.memberRole === 'owner';
                    return (
                      <article key={organization.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700"><Building2 className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-slate-900">{organization.name}</h3>{isOwner && <Badge variant="warning"><Crown className="ml-1 h-3 w-3" />مالک</Badge>}{activeTenantId === organization.id && <Badge variant="success">میزکار فعال</Badge>}</div><p className="mt-1 text-xs text-slate-500"><span dir="ltr">{organization.slug}</span> · {TENANT_ROLE_LABELS[organization.memberRole as TenantRole] ?? organization.memberRole}</p></div>
                        <Button variant={activeTenantId === organization.id ? 'secondary' : 'outline'} onClick={() => enterWorkspace(organization.id)}>ورود به میزکار <ArrowLeft className="h-4 w-4" /></Button>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary-600" />ایجاد سازمان</CardTitle><CardDescription>مالک سازمان تازه خواهید بود.</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={createOrganization} className="space-y-4">
                <Input label="نام سازمان" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
                <Input label="شناسه انگلیسی URL" dir="ltr" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="my-organization" pattern="[a-z0-9-]+" required />
                {error && <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                <Button type="submit" className="w-full" isLoading={creating}><Users className="h-4 w-4" />ساخت سازمان و ورود</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </ProtectedLayout>
  );
}
