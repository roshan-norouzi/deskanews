'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORM_NAME, PLATFORM_TAGLINE } from '@deska/shared';
import { useAuth } from '@/lib/auth-context';
import { clearTenantId, setTenantId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function routeAfterLogin(
  router: ReturnType<typeof useRouter>,
  user: { tenants?: { id: string }[]; pendingInvitations?: unknown[] },
  mfaSetupRequired?: boolean,
) {
  if (mfaSetupRequired) {
    router.push('/settings?tab=account&mfa=setup');
    return;
  }
  const memberships = user.tenants ?? [];
  if (user.pendingInvitations?.length || memberships.length !== 1) {
    clearTenantId();
    router.push('/organizations');
  } else {
    setTenantId(memberships[0].id);
    router.push('/dashboard');
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyMfa, user, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      routeAfterLogin(router, user);
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || (isAuthenticated && !mfaToken)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (mfaToken) {
        const authenticated = await verifyMfa(mfaToken, mfaCode.trim());
        routeAfterLogin(router, authenticated);
        return;
      }

      const result = await login(email, password);
      if (result.kind === 'mfa_required') {
        setMfaToken(result.mfaToken);
        setPassword('');
        setMfaCode('');
        return;
      }

      routeAfterLogin(router, result.user, result.mfaSetupRequired);
    } catch (err) {
      setPassword('');
      setMfaCode('');
      setError(err instanceof Error ? err.message : 'خطا در ورود');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-primary-50 via-white to-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-2xl font-bold text-white">
            د
          </div>
          <CardTitle className="text-2xl">{PLATFORM_NAME}</CardTitle>
          <CardDescription>
            {mfaToken ? 'کد تأیید دو مرحله‌ای را وارد کنید' : PLATFORM_TAGLINE}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!mfaToken ? (
              <>
                <Input
                  label="ایمیل"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  autoComplete="email"
                />
                <Input
                  label="رمز عبور"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </>
            ) : (
              <>
                <Input
                  label="کد تأیید ۶ رقمی"
                  type="text"
                  inputMode="numeric"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                  required
                  autoComplete="one-time-code"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMfaToken(null);
                    setMfaCode('');
                    setError(null);
                  }}
                >
                  بازگشت به ورود با رمز عبور
                </Button>
              </>
            )}
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <Button type="submit" className="w-full" isLoading={submitting}>
              {mfaToken ? 'تأیید و ورود' : 'ورود'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
