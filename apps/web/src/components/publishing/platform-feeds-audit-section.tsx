'use client';

import { useState } from 'react';
import { CheckCircle2, HeartPulse, RefreshCw, XCircle } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/utils';
import { FEED_CATALOG_GROUPS, type FeedCatalogGroup } from '@/lib/feed-source-types';

interface AuditResultItem {
  id: string;
  name: string;
  url: string;
  sourceType: string;
  catalogGroup: FeedCatalogGroup;
  ok: boolean;
  itemCount: number;
  latencyMs: number;
  lastError: string;
  sampleTitles: string[];
}

interface AuditResponse {
  checkedAt: string;
  total: number;
  passed: number;
  failed: number;
  results: AuditResultItem[];
}

export function PlatformFeedsAuditSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<AuditResponse | null>(null);

  async function runAudit() {
    setBusy(true);
    setError('');
    try {
      const result = await apiFetch<AuditResponse>('/platform/feeds/audit', { method: 'POST', skipTenant: true });
      setAudit(result);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'بررسی منابع پیش‌فرض انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-bold text-slate-900">بررسی منابع پیش‌فرض پلتفرم</h2>
          <p className="mt-1 text-xs text-slate-500">اتصال و دریافت نمونه خبر از همه منابع فعال کاتالوگ — فقط برای مدیر کل.</p>
        </div>
        <Button variant="outline" isLoading={busy} onClick={() => void runAudit()}>
          <HeartPulse className="h-4 w-4" />
          {audit ? 'بررسی مجدد' : 'شروع بررسی'}
        </Button>
      </div>

      {error && <div role="alert" className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!audit ? (
        <div className="grid place-items-center px-5 py-14 text-center text-sm text-slate-500">
          <RefreshCw className="h-10 w-10 text-slate-300" />
          <p className="mt-3">برای آزمایش اتصال و دریافت خبر از منابع پیش‌فرض، دکمه «شروع بررسی» را انتخاب کنید.</p>
        </div>
      ) : (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-xl bg-slate-100 px-3 py-2">کل: {formatPersianDigits(audit.total)}</span>
            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">موفق: {formatPersianDigits(audit.passed)}</span>
            <span className="rounded-xl bg-red-50 px-3 py-2 text-red-700">ناموفق: {formatPersianDigits(audit.failed)}</span>
            <span className="text-xs text-slate-400 self-center">{new Date(audit.checkedAt).toLocaleString('fa-IR')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50 text-right text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">منبع</th>
                  <th className="px-4 py-3">دسته</th>
                  <th className="px-4 py-3">وضعیت</th>
                  <th className="px-4 py-3">مطالب</th>
                  <th className="px-4 py-3">زمان</th>
                  <th className="px-4 py-3">جزئیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.results.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="mt-1 truncate text-xs text-slate-400" dir="ltr">{item.url}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{FEED_CATALOG_GROUPS[item.catalogGroup]?.label || item.catalogGroup}</td>
                    <td className="px-4 py-3">
                      <Badge variant={item.ok ? 'success' : 'danger'}>
                        {item.ok ? 'موفق' : 'ناموفق'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatPersianDigits(item.itemCount)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatPersianDigits(item.latencyMs)} ms</td>
                    <td className="max-w-sm px-4 py-3 text-xs leading-5 text-slate-600">
                      {item.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{item.sampleTitles[0] || 'بدون نمونه'}</span>
                      ) : (
                        <span className="inline-flex items-start gap-1 text-red-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item.lastError}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
