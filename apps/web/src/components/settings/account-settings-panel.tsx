'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/utils';
import { splitPersianFullName } from '@deska/shared';

interface ProfileUpdateResult {
  user: {
    id: string;
    name: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    phone?: string | null;
  };
  requiresReauthentication: boolean;
}

export function AccountSettingsPanel() {
  const router = useRouter();
  const { user, refresh, logout } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const split = splitPersianFullName(user.name ?? '');
    setFirstName(user.firstName?.trim() || split.firstName);
    setLastName(user.lastName?.trim() || split.lastName);
    setEmail(user.email ?? '');
    setPhone(user.phone ?? '');
  }, [user]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError('نام و نام خانوادگی الزامی است');
      return;
    }

    setSaving(true);
    try {
      const result = await apiFetch<ProfileUpdateResult>('/auth/profile', {
        method: 'PATCH',
        skipTenant: true,
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          ...(password.trim() ? { password: password.trim() } : {}),
        },
      });

      setPassword('');
      if (result.requiresReauthentication) {
        await logout();
        router.replace('/login?reason=profile-changed');
        return;
      }

      await refresh();
      setMessage('اطلاعات حساب با موفقیت ذخیره شد');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'خطا در ذخیره اطلاعات حساب');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="flex items-start gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl shadow-slate-900/10">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">حساب کاربری</h2>
          <p className="mt-2 text-sm text-slate-300">نام، ایمیل، موبایل و رمز عبور خود را مدیریت کنید.</p>
        </div>
      </header>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70">
          <CardTitle className="text-base">اطلاعات حساب</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="نام" value={firstName} onChange={(event) => setFirstName(event.target.value)} required maxLength={60} />
              <Input label="نام خانوادگی" value={lastName} onChange={(event) => setLastName(event.target.value)} required maxLength={60} />
              <Input label="ایمیل" type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
              <Input label="شماره موبایل" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0912... یا +98912..." autoComplete="tel" />
            </div>
            <Input
              label="رمز عبور"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              autoComplete="new-password"
              placeholder="برای تغییر رمز عبور، رمز جدید را وارد کنید"
            />
            <p className="text-xs text-slate-500">در صورت تغییر ایمیل یا رمز عبور، پس از ذخیره باید دوباره وارد شوید.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-green-600">{message}</p>}
            <Button type="submit" isLoading={saving}>ذخیره تغییرات</Button>
          </form>
        </CardContent>
      </Card>

      <MfaSettingsPanel />
    </div>
  );
}

interface MfaStatus {
  enabled: boolean;
  setupRequired: boolean;
  pendingSetup: boolean;
  recoveryCodesRemaining: number;
}

interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

function MfaSettingsPanel() {
  const { logout } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<MfaSetupResult | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<MfaStatus>('/auth/mfa/status', { skipTenant: true })
      .then(setStatus)
      .catch(() => setError('وضعیت تأیید دو مرحله‌ای قابل دریافت نیست'))
      .finally(() => setLoading(false));
  }, []);

  async function beginSetup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<MfaSetupResult>('/auth/mfa/setup', { method: 'POST', skipTenant: true });
      setSetup(result);
      setStatus((current) => current ? { ...current, pendingSetup: true } : current);
      setMessage('کلید و کدهای بازیابی را در جای امن ذخیره کنید، سپس کد ۶ رقمی را وارد کنید.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'راه‌اندازی تأیید دو مرحله‌ای انجام نشد');
    } finally {
      setBusy(false);
    }
  }

  async function enableMfa(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/mfa/enable', {
        method: 'POST',
        skipTenant: true,
        body: { code: enableCode.trim() },
      });
      setSetup(null);
      setEnableCode('');
      setStatus({ enabled: true, setupRequired: false, pendingSetup: false, recoveryCodesRemaining: setup?.recoveryCodes.length ?? 0 });
      setMessage('تأیید دو مرحله‌ای فعال شد.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'فعال‌سازی تأیید دو مرحله‌ای انجام نشد');
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/mfa/disable', {
        method: 'POST',
        skipTenant: true,
        body: { code: disableCode.trim(), password: disablePassword },
      });
      await logout();
      router.replace('/login?reason=mfa-disabled');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'غیرفعال‌سازی تأیید دو مرحله‌ای انجام نشد');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70">
        <CardTitle className="text-base">تأیید دو مرحله‌ای (MFA)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {loading ? (
          <p className="text-sm text-slate-500">در حال بارگذاری...</p>
        ) : (
          <>
            {status?.setupRequired && !status.enabled && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                برای نقش مدیریتی شما فعال‌سازی تأیید دو مرحله‌ای توصیه می‌شود.
              </p>
            )}
            {status?.enabled ? (
              <form onSubmit={disableMfa} className="space-y-3">
                <p className="text-sm text-green-700">تأیید دو مرحله‌ای فعال است. کدهای بازیابی باقی‌مانده: {status.recoveryCodesRemaining}</p>
                <Input label="کد تأیید" value={disableCode} onChange={(event) => setDisableCode(event.target.value)} required />
                <Input label="رمز عبور" type="password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} required />
                <Button type="submit" variant="outline" isLoading={busy}>غیرفعال‌سازی MFA</Button>
              </form>
            ) : (
              <>
                {!setup ? (
                  <Button type="button" onClick={beginSetup} isLoading={busy}>شروع راه‌اندازی MFA</Button>
                ) : (
                  <form onSubmit={enableMfa} className="space-y-3">
                    <p className="text-sm text-slate-600">کلید دستی: <code dir="ltr">{setup.secret}</code></p>
                    <p className="text-sm text-slate-600 break-all">OTP URI: <code dir="ltr">{setup.otpauthUrl}</code></p>
                    <p className="text-sm text-slate-600">کدهای بازیابی: {setup.recoveryCodes.join(' · ')}</p>
                    <Input label="کد ۶ رقمی اپ Authenticator" value={enableCode} onChange={(event) => setEnableCode(event.target.value)} required />
                    <Button type="submit" isLoading={busy}>فعال‌سازی MFA</Button>
                  </form>
                )}
              </>
            )}
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-600">{message}</p>}
      </CardContent>
    </Card>
  );
}
