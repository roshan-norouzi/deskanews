'use client';

import { useMemo, useState } from 'react';
import { Boxes } from 'lucide-react';
import { getCoreModuleSpec } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/utils';
import type { TenantModuleRecord } from '@/lib/tenant-modules';

function ModulesContent() {
  const { data, isLoading } = useApi<TenantModuleRecord[]>('/modules/tenant');
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const modules = useMemo(() => {
    if (!data) return [];
    return data;
  }, [data]);

  const handleToggle = async (moduleId: string, current: boolean) => {
    setToggling(moduleId);
    setToggleError(null);
    try {
      await apiFetch(`/modules/${moduleId}/toggle`, {
        method: 'PATCH',
        body: { enabled: !current },
      });
      // فعال/غیرفعال شدن ماژول روی منوی اصلی و دسترسی‌های tenant اثر می‌گذارد؛
      // بنابراین بعد از ثبت موفق، کل صفحه را برای بارگذاری context جدید refresh می‌کنیم.
      window.location.reload();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'خطا در تغییر وضعیت ماژول');
    } finally {
      setToggling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
      <header className="flex items-start gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-violet-950 p-6 text-white shadow-xl shadow-slate-900/10"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Boxes className="h-6 w-6" /></span><div><h2 className="text-2xl font-bold">ماژول‌ها</h2><p className="mt-2 text-sm text-slate-300">
          ماژول‌های موردنیاز سازمان را فعال کنید؛ ماژول‌های هسته همیشه فعال هستند
        </p></div></header>
        {toggleError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {toggleError}
          </p>
        )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const spec = getCoreModuleSpec(mod.id);
          const dependencyText =
            mod.dependencyLabels && mod.dependencyLabels.length > 0
              ? mod.dependencyLabels.join('، ')
              : null;
          const isToggleDisabled = mod.enabled
            ? mod.canDisable === false
            : mod.canEnable === false;
          const disableReason = mod.enabled
            ? mod.blockingDependentLabels && mod.blockingDependentLabels.length > 0
              ? `ابتدا غیرفعال کنید: ${mod.blockingDependentLabels.join('، ')}`
              : null
            : mod.missingDependencyLabels && mod.missingDependencyLabels.length > 0
              ? `ابتدا فعال کنید: ${mod.missingDependencyLabels.join('، ')}`
              : null;

          return (
            <Card
              key={mod.id}
              className={
                mod.enabled
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-slate-200 bg-slate-50/80'
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{mod.name}</CardTitle>
                  <Badge variant={mod.enabled ? 'success' : 'default'}>
                    {mod.enabled ? 'فعال' : 'غیرفعال'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {mod.domainLabel && (
                  <p className="mb-1 text-xs text-slate-400">{mod.domainLabel}</p>
                )}
                {spec?.description && (
                  <p className="mb-2 text-sm text-slate-600">{spec.description}</p>
                )}
                {dependencyText && (
                  <p className="mb-3 text-xs text-slate-500">وابستگی: {dependencyText}</p>
                )}
                {mod.isCore ? (
                  <p className="text-xs text-primary-600">ماژول هسته — همیشه فعال</p>
                ) : (
                  <>
                    {disableReason && (
                      <p className="mb-2 text-xs text-amber-700">{disableReason}</p>
                    )}
                    <Button
                      size="sm"
                      variant={mod.enabled ? 'outline' : 'primary'}
                      isLoading={toggling === mod.id}
                      disabled={isToggleDisabled}
                      title={disableReason ?? undefined}
                      onClick={() => handleToggle(mod.id, mod.enabled)}
                    >
                      {mod.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsModulesPage() {
  return (
    <ProtectedLayout title="ماژول‌ها" ownerOnly>
      <ModulesContent />
    </ProtectedLayout>
  );
}
