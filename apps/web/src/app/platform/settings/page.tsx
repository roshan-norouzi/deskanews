'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Cloud, CreditCard, Gauge, HeartPulse, Settings, Tags } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { PlatformAiSettingsPanel } from '@/components/settings/platform-ai-settings-panel';
import { PlatformCatalogHealthSettingsPanel } from '@/components/settings/platform-catalog-health-settings-panel';
import { PlatformTopicLabelsPanel } from '@/components/settings/platform-topic-labels-panel';
import { PlatformSourceFetchSettingsPanel } from '@/components/settings/platform-source-fetch-settings-panel';
import { PlatformUsageMetricsPanel } from '@/components/settings/platform-usage-metrics-panel';
import { PlatformPaymentSettingsPanel } from '@/components/settings/platform-payment-settings-panel';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

type PlatformSettingsTab = 'ai' | 'sources' | 'usage' | 'payments';
type SourceSection = 'fetch' | 'health' | 'labels';

const TAB_DEFINITIONS: Array<{
  id: PlatformSettingsTab;
  label: string;
  icon: typeof Bot;
  description: string;
}> = [
  {
    id: 'ai',
    label: 'هوش مصنوعی',
    icon: Bot,
    description: 'اتصال GapGPT، مدل‌ها و دستورهای پردازش خبر — سراسری برای همه سازمان‌ها.',
  },
  {
    id: 'sources',
    label: 'منابع',
    icon: Cloud,
    description: 'دریافت منبع، سلامت کاتالوگ و برچسب‌های موضوعی.',
  },
  {
    id: 'usage',
    label: 'تعرفه مصرف',
    icon: Gauge,
    description: 'تنظیم هزینه فرایندهای مصرف برای همه سازمان‌های پلتفرم.',
  },
  {
    id: 'payments',
    label: 'درگاه پرداخت',
    icon: CreditCard,
    description: 'Webhook، امضای HMAC و تأیید پرداخت‌های معلق.',
  },
];

const SOURCE_SECTIONS: Array<{ id: SourceSection; label: string; icon: typeof Cloud; description: string }> = [
  { id: 'fetch', label: 'دریافت منبع', icon: Cloud, description: 'Worker Deska برای تلگرام، X، و رسانه‌های بین‌المللی مسدود یا بدون RSS.' },
  { id: 'health', label: 'سلامت کاتالوگ', icon: HeartPulse, description: 'تست خودکار سلامت منابع پیش‌فرض و فاصله اجرای دوره‌ای.' },
  { id: 'labels', label: 'برچسب منابع', icon: Tags, description: 'برچسب موضوعی منابع خبری، جدا از دستهٔ کاتالوگ.' },
];

const LEGACY_SOURCE_TABS: Record<string, SourceSection> = {
  'source-fetch': 'fetch',
  'catalog-health': 'health',
  'topic-labels': 'labels',
};

function PlatformSettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin } = useAuth();

  const requestedTab = searchParams.get('tab') ?? 'ai';
  const legacySection = LEGACY_SOURCE_TABS[requestedTab];
  const activeTab: PlatformSettingsTab = legacySection
    ? 'sources'
    : TAB_DEFINITIONS.some((tab) => tab.id === requestedTab)
      ? requestedTab as PlatformSettingsTab
      : 'ai';
  const requestedSection = (searchParams.get('section') as SourceSection | null) ?? legacySection ?? 'fetch';
  const activeSection = SOURCE_SECTIONS.some((section) => section.id === requestedSection) ? requestedSection : 'fetch';
  const activeDefinition = activeTab === 'sources'
    ? SOURCE_SECTIONS.find((section) => section.id === activeSection) ?? SOURCE_SECTIONS[0]
    : TAB_DEFINITIONS.find((tab) => tab.id === activeTab) ?? TAB_DEFINITIONS[0];

  useEffect(() => {
    if (requestedTab === 'wallet') {
      router.replace('/platform?tab=credits');
      return;
    }
    if (legacySection) {
      router.replace(`/platform/settings?tab=sources&section=${legacySection}`);
    }
  }, [legacySection, requestedTab, router]);

  function selectTab(tab: PlatformSettingsTab) {
    router.replace(tab === 'sources' ? '/platform/settings?tab=sources&section=fetch' : `/platform/settings?tab=${tab}`);
  }

  function selectSection(section: SourceSection) {
    router.replace(`/platform/settings?tab=sources&section=${section}`);
  }

  if (!isSuperAdmin) {
    return (
      <ProtectedLayout title="تنظیمات پلتفرم">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">فقط مدیر کل به این بخش دسترسی دارد.</div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title="تنظیمات پلتفرم">
      <div className="mx-auto w-full max-w-6xl space-y-6" dir="rtl">
        <header className="flex items-start gap-4 rounded-2xl bg-slate-950 p-6 text-white">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Settings className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">تنظیمات پلتفرم</h1>
            <p className="mt-2 text-sm text-slate-300">هوش مصنوعی، منابع، تعرفه و درگاه پرداخت.</p>
          </div>
        </header>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {TAB_DEFINITIONS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  selected ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">{activeDefinition.label}</h2>
            <p className="mt-1 text-sm text-slate-500">{activeDefinition.description}</p>
          </div>

          {activeTab === 'sources' && (
            <div className="mb-6 flex flex-wrap gap-2">
              {SOURCE_SECTIONS.map((section) => {
                const Icon = section.icon;
                const selected = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => selectSection(section.id)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium',
                      selected ? 'border-primary-200 bg-primary-50 text-primary-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'ai' && <PlatformAiSettingsPanel />}
          {activeTab === 'sources' && activeSection === 'fetch' && <PlatformSourceFetchSettingsPanel />}
          {activeTab === 'sources' && activeSection === 'health' && <PlatformCatalogHealthSettingsPanel />}
          {activeTab === 'sources' && activeSection === 'labels' && <PlatformTopicLabelsPanel />}
          {activeTab === 'usage' && <PlatformUsageMetricsPanel />}
          {activeTab === 'payments' && <PlatformPaymentSettingsPanel />}
        </div>
      </div>
    </ProtectedLayout>
  );
}

export default function PlatformSettingsPage() {
  return (
    <Suspense fallback={<ProtectedLayout title="تنظیمات پلتفرم"><div className="grid min-h-40 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div></ProtectedLayout>}>
      <PlatformSettingsPageContent />
    </Suspense>
  );
}
