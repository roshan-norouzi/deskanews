'use client';

import { ChevronDown, Building2, Check, Plus } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { apiFetch, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';

export function TenantSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { refresh } = useAuth();
  const { tenants, activeTenant, setActiveTenant, refreshTenants, isLoading } = useTenant();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function createOrganization(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: string }>('/tenants', {
        method: 'POST',
        body: { name: name.trim(), slug: slug.trim().toLowerCase(), locale: 'fa-IR' },
        skipTenant: true,
      });
      setActiveTenant(created.id);
      await Promise.all([refresh(), refreshTenants()]);
      setActiveTenant(created.id);
      setCreating(false);
      setName('');
      setSlug('');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ایجاد سازمان انجام نشد.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || tenants.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-card hover:bg-slate-100"
      >
        <Building2 className="h-4 w-4 text-slate-500" />
        <span className="max-w-[120px] truncate">{activeTenant?.name ?? 'انتخاب سازمان'}</span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-elevated">
          <p className="px-3 py-2 text-xs font-medium text-slate-500">سازمان‌ها</p>
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              onClick={() => {
                if (tenant.id === activeTenant?.id) {
                  setOpen(false);
                  return;
                }
                setActiveTenant(tenant.id);
                setOpen(false);
                router.push(pathname);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1 text-right">
                <p className="truncate font-medium text-slate-900">{tenant.name}</p>
                <p className="truncate text-xs text-slate-500" dir="ltr">{tenant.slug}</p>
              </div>
              {activeTenant?.id === tenant.id && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
            </button>
          ))}
          <div className="mt-1 border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
                setCreating(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
            >
              <Plus className="h-4 w-4" />
              افزودن سازمان جدید
            </button>
          </div>
        </div>
      )}

      <Modal open={creating} onClose={() => { if (!submitting) setCreating(false); }} size="sm" labelledBy="new-organization-title">
        <form onSubmit={createOrganization}>
          <ModalHeader title="افزودن سازمان جدید" description="سازمان تازه ۱۰۰۰ توکن هدیه می‌گیرد و شما مالک آن می‌شوید." onClose={() => { if (!submitting) setCreating(false); }} />
          <ModalBody className="space-y-4 px-6 py-5">
            <Input label="نام سازمان" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
            <Input
              label="نامک (لاتین در نشانی)"
              dir="ltr"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-newsroom"
              pattern="[a-z0-9-]+"
              required
            />
            {error ? <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setCreating(false)} disabled={submitting}>انصراف</Button>
            <Button type="submit" isLoading={submitting}>ساخت سازمان</Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
