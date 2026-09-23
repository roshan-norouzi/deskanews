'use client';

import { useCallback, useState } from 'react';
import { Coins, RefreshCw, ShoppingCart } from 'lucide-react';
import { formatPersianDigits, type TokenTopUpPackage } from '@deska/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/utils';
import { formatJalaliDateTime } from '@/lib/date';

type LedgerRow = {
  id: string;
  entryType: string;
  amount: number;
  metricKey: string;
  createdAt: string;
};

type PaymentRow = {
  id: string;
  amountRials: number;
  tokenAmount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
};

export type TenantWalletSnapshot = {
  tenantId: string;
  plan: string;
  monthlyTokens: number;
  enforcement: boolean;
  availableTokens: number;
  balanceTokens: number;
  reservedTokens: number;
  consumedTokens: number;
  recentLedger: LedgerRow[];
  pendingPayments: PaymentRow[];
  packages: TokenTopUpPackage[];
};

const ENTRY_LABELS: Record<string, string> = {
  credit: 'واریز',
  reserve: 'رزرو',
  commit: 'مصرف',
  release: 'آزادسازی رزرو',
};

const PAYMENT_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' }> = {
  pending: { label: 'در انتظار پرداخت', variant: 'warning' },
  paid: { label: 'پرداخت‌شده', variant: 'success' },
};

function formatRials(value: number) {
  return `${formatPersianDigits(value.toLocaleString('en-US'))} ریال`;
}

export function OrganizationWalletPanel({ tenantId }: { tenantId: string | null }) {
  const path = tenantId ? `/tenants/${tenantId}/wallet` : null;
  const { data, isLoading, refetch } = useApi<TenantWalletSnapshot>(path);
  const [busyPackage, setBusyPackage] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const buyPackage = useCallback(async (packageId: string) => {
    if (!tenantId) return;
    setBusyPackage(packageId);
    setNotice(null);
    try {
      const result = await apiFetch<{ payment: PaymentRow; message: string }>(`/tenants/${tenantId}/wallet/payments`, {
        method: 'POST',
        body: { packageId },
      });
      setNotice({ type: 'success', text: result.message });
      await refetch();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'ثبت درخواست پرداخت انجام نشد' });
    } finally {
      setBusyPackage(null);
    }
  }, [refetch, tenantId]);

  if (!tenantId) {
    return <p className="text-sm text-slate-500">سازمان فعال انتخاب نشده است.</p>;
  }

  if (isLoading && !data) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  const wallet = data;
  if (!wallet) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="کیف پول و توکن"
        description="موجودی مصرفی سازمان برای آماده‌سازی، انتشار و کارهای هوش مصنوعی. دریافت خوراک رایگان است."
        icon={Coins}
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
            بروزرسانی
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">قابل مصرف</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatPersianDigits(wallet.availableTokens)}</p>
            <p className="mt-1 text-xs text-slate-500">توکن</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">موجودی کل</p>
            <p className="mt-2 text-2xl font-bold">{formatPersianDigits(wallet.balanceTokens)}</p>
            <p className="mt-1 text-xs text-slate-500">رزرو: {formatPersianDigits(wallet.reservedTokens)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">مصرف‌شده</p>
            <p className="mt-2 text-2xl font-bold">{formatPersianDigits(wallet.consumedTokens)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">سهمیهٔ ماهانهٔ پلن</p>
            <p className="mt-2 text-2xl font-bold">{formatPersianDigits(wallet.monthlyTokens)}</p>
            <p className="mt-1 text-xs text-slate-500">پلن: {wallet.plan}</p>
          </CardContent>
        </Card>
      </div>

      {wallet.enforcement && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          وقتی توکن کافی نباشد، کارهای گران‌قیمت وارد صف نمی‌شوند.
        </p>
      )}

      {notice && (
        <p className={`text-sm ${notice.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{notice.text}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            خرید توکن
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {wallet.packages.map((pack) => (
            <div key={pack.id} className="rounded-2xl border border-slate-200 p-4">
              <p className="font-bold text-slate-900">{pack.label}</p>
              <p className="mt-1 text-sm text-slate-600">{formatRials(pack.amountRials)}</p>
              <Button
                className="mt-4 w-full"
                size="sm"
                isLoading={busyPackage === pack.id}
                onClick={() => void buyPackage(pack.id)}
              >
                ثبت درخواست پرداخت
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>درخواست‌های پرداخت</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {wallet.pendingPayments.length === 0 ? (
              <p className="text-sm text-slate-500">درخواستی ثبت نشده است.</p>
            ) : (
              wallet.pendingPayments.map((payment) => {
                const meta = PAYMENT_STATUS[payment.status] ?? { label: payment.status, variant: 'default' as const };
                return (
                  <div key={payment.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{formatPersianDigits(payment.tokenAmount)} توکن</span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="mt-1 text-slate-600">{formatRials(payment.amountRials)}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatJalaliDateTime(payment.createdAt)}</p>
                    {payment.status === 'pending' && (
                      <p className="mt-2 text-xs text-slate-500">شناسه پرداخت: {payment.id}</p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>گردش اخیر کیف پول</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {wallet.recentLedger.length === 0 ? (
              <p className="text-sm text-slate-500">هنوز گردشی ثبت نشده است.</p>
            ) : (
              wallet.recentLedger.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{ENTRY_LABELS[row.entryType] ?? row.entryType}</p>
                    <p className="text-xs text-slate-500">{formatJalaliDateTime(row.createdAt)}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatPersianDigits(row.amount)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
