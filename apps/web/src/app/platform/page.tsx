'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Crown, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { PLATFORM_ROLES, TENANT_ROLE_LABELS, type TenantRole } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

type Membership = { role: string; status: string; tenant: { id: string; name: string; primaryOwnerUserId?: string | null } };
type PlatformUser = { id: string; name: string; email: string; role: string; status: string; tenantMembers: Membership[] };
type Organization = { id: string; name: string; slug: string; status: string; primaryOwner?: { id: string; name: string } | null; _count: { members: number } };
type ListResult<T> = { items: T[]; total: number };
type Overview = { users: number; activeUsers: number; organizations: number; activeOrganizations: number; memberships: number };
type OrganizationDetail = Organization & { members: Array<{ userId: string; role: string; status: string; user: { name: string; email: string } }> };

export default function PlatformPage() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<'users' | 'organizations'>('users');
  const [query, setQuery] = useState('');
  const [overview, setOverview] = useState<Overview>();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [detail, setDetail] = useState<OrganizationDetail>();
  const [targetOwner, setTargetOwner] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const [summary, result] = await Promise.all([
        apiFetch<Overview>('/platform/overview', { skipTenant: true }),
        tab === 'users'
          ? apiFetch<ListResult<PlatformUser>>(`/platform/users${suffix}`, { skipTenant: true })
          : apiFetch<ListResult<Organization>>(`/platform/organizations${suffix}`, { skipTenant: true }),
      ]);
      setOverview(summary);
      if (tab === 'users') setUsers((result as ListResult<PlatformUser>).items);
      else setOrganizations((result as ListResult<Organization>).items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'دریافت اطلاعات انجام نشد'); }
    finally { setLoading(false); }
  }, [query, tab]);

  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);

  const patchUser = async (id: string, field: 'role' | 'status', value: string) => {
    await apiFetch(`/platform/users/${id}/${field}`, { method: 'PATCH', body: { [field]: value }, skipTenant: true });
    await load();
  };
  const patchOrganization = async (id: string, status: string) => {
    await apiFetch(`/platform/organizations/${id}/status`, { method: 'PATCH', body: { status }, skipTenant: true });
    await load();
  };
  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newUser.password !== newUser.confirmPassword) {
      setError('رمز عبور و تکرار آن یکسان نیست');
      return;
    }
    setCreatingUser(true); setError('');
    try {
      await apiFetch('/platform/users', {
        method: 'POST', skipTenant: true,
        body: { ...newUser, name: newUser.name.trim(), email: newUser.email.trim(), phone: newUser.phone.trim() || undefined },
      });
      setNewUser({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
      setShowCreateUser(false);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ایجاد کاربر انجام نشد'); }
    finally { setCreatingUser(false); }
  };
  const openOrganization = async (id: string) => {
    const result = await apiFetch<OrganizationDetail>(`/platform/organizations/${id}`, { skipTenant: true });
    setDetail(result); setTargetOwner(result.primaryOwner?.id ?? '');
  };
  const transferOwnership = async () => {
    if (!detail || !targetOwner) return;
    await apiFetch(`/platform/organizations/${detail.id}/transfer-ownership`, { method: 'POST', body: { targetUserId: targetOwner }, skipTenant: true });
    await openOrganization(detail.id); await load();
  };

  const tripleDeleteConfirmation = (entityLabel: string, expectedText: string) => {
    if (!window.confirm(`مرحله ۱ از ۳: آیا از حذف دائمی ${entityLabel} مطمئن هستید؟`)) return false;
    if (!window.confirm('مرحله ۲ از ۳: همه اطلاعات وابسته نیز برای همیشه حذف می‌شوند و بازیابی ممکن نیست. ادامه می‌دهید؟')) return false;
    const typed = window.prompt(`مرحله ۳ از ۳: برای تأیید نهایی عبارت زیر را دقیقاً وارد کنید:\n${expectedText}`);
    return typed?.trim() === expectedText;
  };

  const deleteUser = async (user: PlatformUser) => {
    if (!tripleDeleteConfirmation(`کاربر ${user.name}`, user.email)) return;
    setDeletingId(user.id); setError('');
    try {
      await apiFetch(`/platform/users/${user.id}`, {
        method: 'DELETE', skipTenant: true,
        body: { confirmIrreversible: true, confirmCascade: true, confirmationText: user.email },
      });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'حذف کاربر انجام نشد'); }
    finally { setDeletingId(''); }
  };

  const deleteOrganization = async (organization: Organization) => {
    if (!tripleDeleteConfirmation(`سازمان ${organization.name}`, organization.slug)) return;
    setDeletingId(organization.id); setError('');
    try {
      const result = await apiFetch<{ storageCleanupComplete: boolean }>(`/platform/organizations/${organization.id}`, {
        method: 'DELETE', skipTenant: true,
        body: { confirmIrreversible: true, confirmCascade: true, confirmationText: organization.slug },
      });
      if (detail?.id === organization.id) setDetail(undefined);
      await load();
      if (!result.storageCleanupComplete) {
        setError('اطلاعات سازمان حذف شد، اما پاک‌سازی بخشی از فایل‌های فیزیکی نیازمند بررسی گزارش سرور است.');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'حذف سازمان انجام نشد'); }
    finally { setDeletingId(''); }
  };

  return <ProtectedLayout title="مدیریت پلتفرم" platformAdminOnly tenantRequired={false}>
    <main className="mx-auto max-w-7xl space-y-5" dir="rtl">
      <section className="rounded-3xl bg-slate-950 p-6 text-white"><h1 className="text-2xl font-bold">مدیریت پلتفرم</h1><p className="mt-2 text-sm text-slate-300">کاربران مستقل، عضویت‌های سازمانی، سازمان‌ها و مالکیت‌ها</p></section>
      {overview && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['کل کاربران', overview.users], ['کاربران فعال', overview.activeUsers], ['کل سازمان‌ها', overview.organizations], ['سازمان‌های فعال', overview.activeOrganizations], ['عضویت‌ها', overview.memberships]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>)}</div>}
      <Card><CardHeader><div className="flex flex-wrap justify-between gap-3"><div className="flex gap-2"><Button variant={tab === 'users' ? 'primary' : 'outline'} onClick={() => setTab('users')}><Users className="h-4 w-4" />کاربران</Button><Button variant={tab === 'organizations' ? 'primary' : 'outline'} onClick={() => setTab('organizations')}><Building2 className="h-4 w-4" />سازمان‌ها</Button></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><div className="relative min-w-56 flex-1 sm:w-80"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input className="pr-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو..." /></div>{isSuperAdmin && tab === 'users' && <Button type="button" onClick={() => setShowCreateUser((visible) => !visible)}><UserPlus className="h-4 w-4" />افزودن کاربر</Button>}</div></div></CardHeader><CardContent>
        {error && <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {isSuperAdmin && showCreateUser && <form onSubmit={createUser} className="mb-5 grid gap-3 rounded-2xl border border-primary-100 bg-primary-50/40 p-4 sm:grid-cols-2"><Input label="نام و نام خانوادگی" value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} required /><Input label="ایمیل" type="email" dir="ltr" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} required /><Input label="شماره موبایل (اختیاری)" dir="ltr" value={newUser.phone} onChange={(event) => setNewUser((current) => ({ ...current, phone: event.target.value }))} /><Input label="رمز عبور اولیه" type="password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} required minLength={12} autoComplete="new-password" /><Input label="تکرار رمز عبور" type="password" value={newUser.confirmPassword} onChange={(event) => setNewUser((current) => ({ ...current, confirmPassword: event.target.value }))} required minLength={12} autoComplete="new-password" /><div className="flex items-end gap-2"><Button type="submit" isLoading={creatingUser}>ایجاد کاربر</Button><Button type="button" variant="ghost" onClick={() => setShowCreateUser(false)}>انصراف</Button></div></form>}
        {loading ? <div className="py-12 text-center text-slate-500">در حال دریافت...</div> : tab === 'users' ? <div className="space-y-3">{users.map((user) => <article key={user.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold">{user.name}</h2><p className="text-sm text-slate-500" dir="ltr">{user.email}</p><div className="mt-2 flex flex-wrap gap-1">{user.tenantMembers.map((membership) => <Badge key={membership.tenant.id} variant={membership.tenant.primaryOwnerUserId === user.id ? 'warning' : 'default'}>{membership.tenant.primaryOwnerUserId === user.id && <Crown className="ml-1 h-3 w-3" />}{membership.tenant.name} · {TENANT_ROLE_LABELS[membership.role as TenantRole] ?? membership.role}</Badge>)}</div></div><select value={user.role} aria-label="نقش پلتفرم" onChange={(e) => void patchUser(user.id, 'role', e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value={PLATFORM_ROLES.USER}>کاربر</option><option value={PLATFORM_ROLES.ADMIN}>مدیر پلتفرم</option><option value={PLATFORM_ROLES.SUPER_ADMIN}>مدیر کل</option></select><StatusSelect value={user.status} onChange={(value) => void patchUser(user.id, 'status', value)} kind="user" /><Button variant="danger" isLoading={deletingId === user.id} onClick={() => void deleteUser(user)}><Trash2 className="h-4 w-4" />حذف دائمی</Button></div></article>)}</div>
        : <div className="space-y-3">{organizations.map((organization) => <article key={organization.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold">{organization.name}</h2><p className="text-sm text-slate-500"><span dir="ltr">{organization.slug}</span> · {organization._count.members} عضو · مالک: {organization.primaryOwner?.name ?? 'تعیین نشده'}</p></div><StatusSelect value={organization.status} onChange={(value) => void patchOrganization(organization.id, value)} kind="organization" /><Button variant="outline" onClick={() => void openOrganization(organization.id)}>اعضا و مالکیت</Button><Button variant="danger" isLoading={deletingId === organization.id} onClick={() => void deleteOrganization(organization)}><Trash2 className="h-4 w-4" />حذف دائمی</Button></div></article>)}</div>}
      </CardContent></Card>
      {detail && <Card><CardHeader><CardTitle>مالکیت {detail.name}</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3">{isSuperAdmin ? <><label className="min-w-72 flex-1 text-sm">مالک اصلی<select value={targetOwner} onChange={(e) => setTargetOwner(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5">{detail.members.filter((member) => member.status === 'active').map((member) => <option key={member.userId} value={member.userId}>{member.user.name} — {member.user.email}</option>)}</select></label><Button disabled={!targetOwner || targetOwner === detail.primaryOwner?.id} onClick={() => void transferOwnership()}><Crown className="h-4 w-4" />انتقال مالکیت</Button></> : <p className="flex-1 text-sm text-slate-600">انتقال مالکیت فقط توسط مدیر کل سیستم انجام می‌شود.</p>}<Button variant="ghost" onClick={() => setDetail(undefined)}>بستن</Button></CardContent></Card>}
    </main>
  </ProtectedLayout>;
}

function StatusSelect({ value, onChange, kind }: { value: string; onChange: (value: string) => void; kind: 'user' | 'organization' }) {
  return <select value={value} aria-label="وضعیت" onChange={(e) => onChange(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="active">فعال</option><option value="inactive">غیرفعال</option>{kind === 'user' ? <option value="blocked">مسدود</option> : <option value="suspended">تعلیق</option>}<option value="pending">در انتظار</option></select>;
}
