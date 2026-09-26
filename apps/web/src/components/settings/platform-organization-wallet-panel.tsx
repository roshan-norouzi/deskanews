'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Search } from 'lucide-react';
import { TOKEN_TOP_UP_PACKAGES, formatPersianDigits } from '@deska/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/utils';
import type { TenantWalletSnapshot } from '@/components/settings/organization-wallet-panel';

type Organization = { id: string; name: string; slug: string; status: string };

export function PlatformOrganizationWalletPanel() {
  const [query, setQuery] = useState('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [wallet, setWallet] = useState<TenantWalletSnapshot | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [packageId, setPackageId] = useState(TOKEN_TOP_UP_PACKAGES[0]?.id ?? '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const result = await apiFetch<{ items: Organization[] }>(`/platform/organizations${suffix}`, { skipTenant: true });
      setOrganizations(result.items);
      if (result.items[0]) setSelectedId((current) => current || result.items[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت سازمان‌ها انجام نشد');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadWallet = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    setBusy('wallet');
    try {
      const snapshot = await apiFetch<TenantWalletSnapshot>(`/platform/organizations/${tenantId}/wallet`, { skipTenant: true });
      setWallet(snapshot);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت کیف پول انجام نشد');
      setWallet(null);
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadOrganizations(), 250);
    return () => clearTimeout(timer);
  }, [loadOrganizations]);

  useEffect(() => {
    if (selectedId) void loadWallet(selectedId);
  }, [selectedId, loadWallet]);

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === selectedId) ?? null,
    [organizations, selectedId],
  );

  const credit = async () => {
    if (!selectedId) return;
    const amount = Number(creditAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('مقدار شارژ باید عدد صحیح مثبت باشد');
      return;
    }
    setBusy('credit');
    setError('');
    setMessage('');
    try {
      await apiFetch(`/platform/organizations/${selectedId}/wallet/credits`, {
        method: 'POST',
        skipTenant: true,
        body: { amount },
      });
      setCreditAmount('');
      setMessage('شارژ دستی با موفقیت ثبت شد.');
      await loadWallet(selectedId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'شارژ انجام نشد');
    } finally {
      setBusy('');
    }
  };

  const createPayment = async () => {
    if (!selectedId || !packageId) return;
    setBusy('payment');
    setError('');
    setMessage('');
    try {
      await apiFetch(`/platform/organizations/${selectedId}/payments`, {
        method: 'POST',
        skipTenant: true,
        body: { packageId },
      });
      setMessage('درخواست پرداخت برای سازمان ثبت شد. از تب درگاه می‌توانید آن را تأیید کنید.');
      await loadWallet(selectedId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ثبت پرداخت انجام نشد');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <Coins className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>اعتبار سازمان‌ها</CardTitle>
            <p className="mt-1 text-sm text-slate-500">شارژ دستی توکن یا ثبت درخواست پرداخت بر اساس بسته‌های تعریف‌شده در سرور.</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
            <Input className="pr-10" placeholder="جست‌وجوی سازمان..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">سازمان</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              disabled={loading}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name} ({org.slug})</option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      {selectedOrg && wallet && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['قابل مصرف', wallet.availableTokens],
              ['موجودی', wallet.balanceTokens],
              ['رزرو', wallet.reservedTokens],
              ['مصرف‌شده', wallet.consumedTokens],
            ].map(([label, value]) => (
              <Card key={String(label)}>
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{formatPersianDigits(Number(value))}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>شارژ دستی</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input
                  label="تعداد توکن"
                  type="number"
                  min={1}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                />
                <Button isLoading={busy === 'credit'} onClick={() => void credit()}>واریز توکن</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>ثبت درخواست پرداخت</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm">
                  {TOKEN_TOP_UP_PACKAGES.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.label} — {formatPersianDigits(pack.amountRials.toLocaleString('en-US'))} ریال
                    </option>
                  ))}
                </select>
                <Button variant="outline" isLoading={busy === 'payment'} onClick={() => void createPayment()}>
                  ایجاد PaymentIntent
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
    </div>
  );
}
