'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORM_NAME, PLATFORM_TAGLINE } from '@deska/shared';
import { useAuth } from '@/lib/auth-context';
import { clearTenantId, setTenantId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const memberships = user.tenants ?? [];
      if (user.pendingInvitations?.length || memberships.length !== 1) {
        clearTenantId();
        router.replace('/organizations');
      } else {
        setTenantId(memberships[0].id);
        router.replace('/dashboard');
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || isAuthenticated) {
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
      const user = await login(email, password);
      const memberships = user.tenants ?? [];
      if (user.pendingInvitations?.length || memberships.length !== 1) {
        clearTenantId();
        router.push('/organizations');
      } else {
        setTenantId(memberships[0].id);
        router.push('/dashboard');
      }
    } catch (err) {
      setPassword('');
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
          <CardDescription>{PLATFORM_TAGLINE}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <Button type="submit" className="w-full" isLoading={submitting}>
              ورود
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
