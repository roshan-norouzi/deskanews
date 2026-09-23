'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/utils';
import { formatJalaliDateTime } from '@/lib/date';

type PaymentSettings = {
  provider: string;
  enabled: boolean;
  webhookConfigured: boolean;
  webhookSource: 'environment' | 'database' | 'none';
  webhookPath: string;
  signatureHeader: string;
  billingEnforcement: boolean;
};

type PendingPayment = {
  id: string;
  amountRials: number;
  tokenAmount: number;
  status: string;
  createdAt: string;
  tenant: { id: string; name: string; slug: string };
};

const PROVIDERS = [
  { id: 'manual', label: 'تأیید دستی / بدون درگاه' },
  { id: 'zarinpal', label: 'زرین‌پال' },
  { id: 'idpay', label: 'آیدی‌پی' },
  { id: 'custom', label: 'سایر' },
];

export function PlatformPaymentSettingsPanel() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [provider, setProvider] = useState('manual');
  const [enabled, setEnabled] = useState(true);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [paymentSettings, pendingPayments] = await Promise.all([
        apiFetch<PaymentSettings>('/platform/payment-settings', { skipTenant: true }),
        apiFetch<PendingPayment[]>('/platform/payments/pending', { skipTenant: true }),
      ]);
      setSettings(paymentSettings);
      setProvider(paymentSettings.provider || 'manual');
      setEnabled(paymentSettings.enabled);
      setPending(pendingPayments);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت تنظیمات درگاه انجام نشد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const body: { provider: string; enabled: boolean; webhookSecret?: string } = { provider, enabled };
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim();
      const saved = await apiFetch<PaymentSettings>('/platform/payment-settings', {
        method: 'PUT',
        skipTenant: true,
        body,
      });
      setSettings(saved);
      setWebhookSecret('');
      setMessage('تنظیمات درگاه ذخیره شد.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ذخیره تنظیمات انجام نشد');
    } finally {
      setSaving(false);
    }
  };

  const confirmPayment = async (paymentId: string) => {
    setConfirmingId(paymentId);
    setError('');
    try {
      await apiFetch(`/platform/payments/${paymentId}/confirm`, { method: 'POST', skipTenant: true });
      setMessage('پرداخت تأیید شد و توکن به کیف پول سازمان واریز شد.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تأیید پرداخت انجام نشد');
    } finally {
      setConfirmingId('');
    }
  };

  if (loading && !settings) {
    return <div className="grid min-h-40 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <CreditCard className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>درگاه پرداخت</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Webhook فقط پرداخت را تأیید می‌کند؛ موجودی را مستقیم تغییر نمی‌دهد.</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">ارائه‌دهنده</span>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-xl border px-3 py-2">
                {PROVIDERS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-7">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              درگاه فعال باشد
            </label>
          </div>
          <Input
            label="رمز امضای Webhook"
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
          />
          <p className="text-xs text-slate-500">
            {settings?.webhookConfigured
              ? `منبع فعلی: ${settings.webhookSource === 'environment' ? 'متغیر محیطی PAYMENT_WEBHOOK_SECRET' : 'ذخیرهٔ رمزنگاری‌شده در پایگاه'} — برای تغییر، مقدار جدید وارد کنید.`
              : 'خالی بماند تا از PAYMENT_WEBHOOK_SECRET در سرور استفاده شود.'}
          </p>
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong>آدرس callback:</strong> <code dir="ltr">{settings?.webhookPath}</code></p>
            <p className="mt-2"><strong>هدر امضا:</strong> <code dir="ltr">{settings?.signatureHeader}</code></p>
            <p className="mt-2"><strong>بدنه:</strong> <code dir="ltr">{`{ "paymentId": "..." }`}</code></p>
            <p className="mt-2">
              وضعیت: {settings?.webhookConfigured ? <Badge variant="success">پیکربندی‌شده</Badge> : <Badge variant="warning">ناقص</Badge>}
              {' '}
              {settings?.billingEnforcement ? <Badge variant="info">کسر توکن فعال</Badge> : <Badge>کسر توکن غیرفعال</Badge>}
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-700">{message}</p>}
          <Button onClick={() => void save()} isLoading={saving}>ذخیره تنظیمات درگاه</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>پرداخت‌های در انتظار تأیید</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500">درخواست پرداخت معلقی نیست.</p>
          ) : (
            pending.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="text-sm">
                  <p className="font-medium">{payment.tenant.name}</p>
                  <p className="text-slate-600">
                    {formatPersianDigits(payment.tokenAmount)} توکن — {formatPersianDigits(payment.amountRials.toLocaleString('en-US'))} ریال
                  </p>
                  <p className="text-xs text-slate-400">{formatJalaliDateTime(payment.createdAt)}</p>
                  <p className="mt-1 text-xs text-slate-500" dir="ltr">{payment.id}</p>
                </div>
                <Button size="sm" isLoading={confirmingId === payment.id} onClick={() => void confirmPayment(payment.id)}>
                  تأیید و واریز توکن
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
