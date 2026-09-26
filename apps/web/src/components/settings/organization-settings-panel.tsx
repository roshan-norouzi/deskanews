'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/lib/tenant-context';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/utils';
import { OrganizationUsagePanel } from '@/components/settings/organization-usage-panel';
import { PageHeader } from '@/components/ui/page-header';

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  locale: string;
  _count?: {
    members: number;
  };
}

export function OrganizationSettingsPanel() {
  const { activeTenant, refreshCurrentTenant } = useTenant();
  const { data, isLoading, refetch } = useApi<TenantDetail>('/tenants/current');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tenant = data ?? activeTenant;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;

    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: { name },
      });
      setMessage('تنظیمات ذخیره شد');
      await refetch();
      await refreshCurrentTenant();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !tenant) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="تنظیمات میز خبر"
        description="اطلاعات میز خبر را ویرایش کنید و موجودی توکن و مصرف روزانه، هفتگی و ماهانه را ببینید."
        icon={Building2}
      />

      <Card className="mx-auto w-full max-w-3xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70">
          <CardTitle>اطلاعات عمومی</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="نام میز خبر"
              value={name || tenant?.name || ''}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="نامک" value={tenant?.slug ?? ''} disabled />
              <Input
                label="تعداد کاربران"
                value={
                  data?._count?.members != null
                    ? String(data._count.members)
                    : '—'
                }
                disabled
              />
            </div>
            {message && (
              <p className={`text-sm ${message.includes('خطا') ? 'text-red-600' : 'text-green-600'}`}>
                {message}
              </p>
            )}
            <Button type="submit" isLoading={saving}>
              ذخیره تغییرات
            </Button>
          </form>
        </CardContent>
      </Card>

      <OrganizationUsagePanel tenantId={tenant?.id ?? null} />
    </div>
  );
}
