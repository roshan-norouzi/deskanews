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
import { PageHeader } from '@/components/ui/page-header';

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
      <PageHeader
        title="حساب کاربری"
        description="نام، ایمیل، موبایل و رمز عبور خود را مدیریت کنید."
        icon={ShieldCheck}
      />

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
    </div>
  );
}
