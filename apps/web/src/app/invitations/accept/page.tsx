'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { apiFetch } from '@/lib/utils';

function AcceptInvitationContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const { refreshTenants, setActiveTenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [acceptedTenant, setAcceptedTenant] = useState<{ tenantId: string; tenantName: string }>();
  const token = params.get('token') ?? '';

  useEffect(() => { if (!token) setError('توکن دعوت در نشانی وجود ندارد.'); }, [token]);

  const accept = async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const result = await apiFetch<{ tenantId: string; tenantName: string }>('/tenants/invites/accept', { method: 'POST', body: { token }, skipTenant: true });
      await Promise.all([refresh(), refreshTenants()]);
      setActiveTenant(result.tenantId);
      setAcceptedTenant(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'پذیرش دعوت انجام نشد'); }
    finally { setLoading(false); }
  };

  return <Card className="mx-auto max-w-xl"><CardHeader><CardTitle>پذیرش دعوت سازمان</CardTitle></CardHeader><CardContent className="space-y-4">
    {acceptedTenant ? <><div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 className="h-5 w-5" />عضویت شما در «{acceptedTenant.tenantName}» فعال شد.</div><Button className="w-full" onClick={() => router.push('/dashboard')}>ورود به میزکار</Button></> : <><p className="text-sm leading-7 text-slate-600">با تأیید، حساب پلتفرم شما به سازمان دعوت‌کننده متصل می‌شود. رمز عبور شما برای مدیر سازمان قابل مشاهده یا تغییر نیست.</p>{error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<Button className="w-full" disabled={!token} isLoading={loading} onClick={() => void accept()}>پذیرش دعوت</Button></>}
  </CardContent></Card>;
}

export default function AcceptInvitationPage() {
  return <ProtectedLayout title="پذیرش دعوت" tenantRequired={false}><main className="py-10" dir="rtl"><Suspense fallback={<div className="text-center">در حال بارگذاری...</div>}><AcceptInvitationContent /></Suspense></main></ProtectedLayout>;
}
