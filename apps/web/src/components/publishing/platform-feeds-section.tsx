'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Pencil, Power } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { FeedSourceCard, FeedSourceCardGrid, feedTogglePowerClass } from '@/components/publishing/feed-source-card';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { newsOrganizationAutomation } from '@/lib/news-feed-automation';
import { sourceLanguageLabel, type SourceLanguage } from '@deska/shared';
import {
  FEED_CATALOG_GROUPS,
  FEED_CATALOG_GROUP_ORDER,
  FEED_CATALOG_GROUP_UI,
  emptyFeedsByCatalogGroup,
  resolveCatalogGroup,
  sortFeedsByName,
  type FeedCatalogGroup,
  type FeedSourceType,
} from '@/lib/feed-source-types';

interface PlatformFeed {
  id: string;
  name: string;
  url: string;
  sourceType?: FeedSourceType;
  catalogGroup?: FeedCatalogGroup;
  logoUrl?: string;
  topicLabel?: string;
  pollIntervalMinutes?: number | null;
  pollIntervalOverride?: number | null;
  catalogPollIntervalMinutes?: number | null;
  settingsMode?: 'default' | 'custom';
  includeWords?: string[];
  excludeWords?: string[];
  customIncludeWords?: string[];
  customExcludeWords?: string[];
  sourceLanguage?: SourceLanguage;
  autoPoll?: boolean | null;
  autoPrepare?: boolean | null;
  autoPublish?: boolean | null;
  autoSendSocial?: boolean | null;
  enabled: boolean;
  platformEnabled?: boolean;
  lastFetchedAt: string | null;
  lastError: string;
}

interface FeedSettingsForm {
  settingsMode: 'default' | 'custom';
  includeWords: string;
  excludeWords: string;
  pollIntervalMinutes: string;
  autoPoll: boolean;
  autoPrepare: boolean;
  autoPublish: boolean;
  autoSendSocial: boolean;
}

function wordsToString(words?: string[]) {
  return (words || []).join('، ');
}

interface PlatformFeedsSectionProps {
  activeGroup: FeedCatalogGroup;
  onActiveGroupChange: (group: FeedCatalogGroup) => void;
  searchQuery?: string;
  topicLabel?: string;
  /** فعال‌های منابع اختصاصی سازمان — به شمارش تب‌ها اضافه می‌شود */
  tenantActiveCountsByGroup?: Record<FeedCatalogGroup, number>;
}

function matchesFeedNameSearch(feed: { name: string; url?: string }, searchQuery: string) {
  const normalized = searchQuery.trim().toLocaleLowerCase('fa');
  if (!normalized) return true;
  return feed.name.toLocaleLowerCase('fa').includes(normalized)
    || String(feed.url || '').toLocaleLowerCase('fa').includes(normalized);
}

export function PlatformFeedsSection({
  activeGroup,
  onActiveGroupChange,
  searchQuery = '',
  topicLabel = '',
  tenantActiveCountsByGroup,
}: PlatformFeedsSectionProps) {
  const { data, error: loadError, isLoading, refetch } = useApi<PlatformFeed[]>('/publishing/platform-feeds');
  const { data: orgSettings } = useApi<Record<string, string>>('/publishing/settings');
  const orgPollMinutes = Number(newsOrganizationAutomation(orgSettings ?? {}).pollIntervalMinutes) || 240;
  const { isSuperAdmin } = useAuth();
  const { activeTenant } = useTenant();
  const canManage = isSuperAdmin || ['owner', 'admin', 'manager', 'senior_specialist'].includes(activeTenant?.memberRole || '');
  const feeds = useMemo(() => (Array.isArray(data) ? data.filter((feed) => feed.platformEnabled !== false) : []), [data]);
  const feedsByGroup = useMemo(() => {
    const grouped = emptyFeedsByCatalogGroup<PlatformFeed>();
    for (const feed of feeds) {
      const group = resolveCatalogGroup(feed.sourceType, feed.catalogGroup, feed.sourceLanguage);
      grouped[group].push(feed);
    }
    for (const group of FEED_CATALOG_GROUP_ORDER) {
      grouped[group] = sortFeedsByName(grouped[group]);
    }
    return grouped;
  }, [feeds]);
  const visibleFeeds = useMemo(
    () => feedsByGroup[activeGroup].filter((feed) => matchesFeedNameSearch(feed, searchQuery) && (!topicLabel || feed.topicLabel === topicLabel)),
    [activeGroup, feedsByGroup, searchQuery, topicLabel],
  );
  const activeCountsByGroup = useMemo(() => {
    const counts = {} as Record<FeedCatalogGroup, number>;
    for (const group of FEED_CATALOG_GROUP_ORDER) {
      const platformActive = feedsByGroup[group].filter((feed) => feed.enabled).length;
      const tenantActive = tenantActiveCountsByGroup?.[group] ?? 0;
      counts[group] = platformActive + tenantActive;
    }
    return counts;
  }, [feedsByGroup, tenantActiveCountsByGroup]);
  const [catalogExpanded, setCatalogExpanded] = useState(true);
  const [editing, setEditing] = useState<PlatformFeed | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<FeedSettingsForm>({
    settingsMode: 'default',
    includeWords: '',
    excludeWords: '',
    pollIntervalMinutes: String(orgPollMinutes),
    autoPoll: true,
    autoPrepare: true,
    autoPublish: false,
    autoSendSocial: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await operation();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'درخواست انجام نشد.' });
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    const feedId = editingIdRef.current;
    if (!feedId || !editing) return;
    const interval = Number(form.pollIntervalMinutes);
    if (form.settingsMode === 'custom' && (!Number.isInteger(interval) || interval < 5 || interval > 1440)) {
      setNotice({ type: 'error', text: 'فاصله پایش باید بین ۵ تا ۱۴۴۰ دقیقه باشد.' });
      return;
    }
    const feedName = editing.name;
    await run('save', async () => {
      await apiFetch(`/publishing/platform-feeds/${feedId}`, {
        method: 'PATCH',
        body: {
          settingsMode: form.settingsMode,
          includeWords: form.settingsMode === 'custom' ? form.includeWords : [],
          excludeWords: form.settingsMode === 'custom' ? form.excludeWords : [],
          pollIntervalMinutes: form.settingsMode === 'custom' ? interval : null,
          autoPoll: form.autoPoll,
          autoPrepare: form.autoPrepare,
          autoPublish: form.autoPublish,
          autoSendSocial: form.autoSendSocial,
        },
      });
      setEditing(null);
      editingIdRef.current = null;
      setNotice({ type: 'success', text: `تنظیمات «${feedName}» ذخیره شد.` });
      await refetch();
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">منابع پیش‌فرض</h2>
        <p className="mt-1 text-sm text-slate-500">کاتالوگ منابع رسمی پلتفرم. نام و آدرس را مدیر کل ثبت می‌کند؛ هر سازمان خودش منبع را روشن می‌کند و فیلتر و فاصله پایش جداگانه می‌گذارد.</p>
      </div>

      {notice && (
        <div role="status" className={cn('rounded-xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>
          {notice.text}
        </div>
      )}
      {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">دریافت منابع پیش‌فرض انجام نشد: {loadError}</div>}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {FEED_CATALOG_GROUP_ORDER.map((group) => {
          const meta = FEED_CATALOG_GROUPS[group];
          const Icon = FEED_CATALOG_GROUP_UI[group].icon;
          const count = activeCountsByGroup[group];
          return (
            <button
              key={group}
              type="button"
              onClick={() => onActiveGroupChange(group)}
              className={cn(
                'flex flex-1 min-w-[9rem] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                activeGroup === group
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{meta.label}</span>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs font-bold',
                activeGroup === group ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600',
              )} title="منابع فعال (پیش‌فرض + اختصاصی)">
                {formatPersianDigits(count)}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 text-right transition hover:bg-slate-50/80"
          aria-expanded={catalogExpanded}
          onClick={() => setCatalogExpanded((open) => !open)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">{FEED_CATALOG_GROUPS[activeGroup].label}</h3>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                {formatPersianDigits(activeCountsByGroup[activeGroup])} فعال
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{FEED_CATALOG_GROUPS[activeGroup].description}</p>
            {searchQuery.trim() ? (
              <p className="mt-2 text-xs text-slate-500">
                {formatPersianDigits(visibleFeeds.length)} نتیجه از {formatPersianDigits(feedsByGroup[activeGroup].length)} منبع پیش‌فرض
              </p>
            ) : null}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500">
            {catalogExpanded ? 'جمع کردن' : 'باز کردن'}
            <ChevronDown className={cn('h-5 w-5 transition-transform', catalogExpanded && 'rotate-180')} />
          </span>
        </button>
        {catalogExpanded ? (
          <>
        {isLoading ? (
          <div className="grid min-h-40 place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
        ) : feedsByGroup[activeGroup].length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {feeds.length === 0
              ? 'منبع پیش‌فرض فعالی ثبت نشده است.'
              : `در دسته «${FEED_CATALOG_GROUPS[activeGroup].label}» منبعی وجود ندارد.`}
          </div>
        ) : visibleFeeds.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            رسانه‌ای با نام «{searchQuery.trim()}» در این دسته پیدا نشد.
          </div>
        ) : (
          <FeedSourceCardGrid>
            {visibleFeeds.map((feed) => (
              <FeedSourceCard
                key={feed.id}
                name={feed.name}
                url={feed.url}
                logoUrl={feed.logoUrl}
                sourceType={feed.sourceType}
                enabled={feed.enabled}
                badge={<span className="flex flex-wrap gap-1"><Badge variant="default" className="shrink-0 text-[10px]">پیش‌فرض</Badge>{feed.topicLabel ? <Badge variant="default" className="shrink-0 text-[10px]">{feed.topicLabel}</Badge> : null}</span>}
                actions={
                  canManage ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="تنظیمات پایش"
                        aria-label="تنظیمات پایش"
                        onClick={() => {
                          setEditing(feed);
                          editingIdRef.current = feed.id;
                          const mode = feed.settingsMode ?? 'default';
                          setForm({
                            settingsMode: mode,
                            includeWords: wordsToString(feed.customIncludeWords ?? feed.includeWords),
                            excludeWords: wordsToString(feed.customExcludeWords ?? feed.excludeWords),
                            pollIntervalMinutes: String(
                              mode === 'custom'
                                ? (feed.pollIntervalOverride ?? feed.pollIntervalMinutes ?? orgPollMinutes)
                                : orgPollMinutes,
                            ),
                            autoPoll: feed.autoPoll ?? true,
                            autoPrepare: feed.autoPrepare ?? true,
                            autoPublish: feed.autoPublish ?? false,
                            autoSendSocial: feed.autoSendSocial ?? false,
                          });
                          setNotice(null);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={feed.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
                        aria-label={feed.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
                        isLoading={busy === `toggle-${feed.id}`}
                        onClick={() => run(`toggle-${feed.id}`, async () => {
                          await apiFetch(`/publishing/platform-feeds/${feed.id}/toggle`, { method: 'POST', body: { enabled: !feed.enabled } });
                          await refetch();
                        })}
                      >
                        <Power className={feedTogglePowerClass(feed.enabled)} />
                      </Button>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400">بدون دسترسی</span>
                  )
                }
              />
            ))}
          </FeedSourceCardGrid>
        )}
          </>
        ) : (
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            {formatPersianDigits(feedsByGroup[activeGroup].length)} منبع پیش‌فرض — برای مشاهده و مدیریت، بخش را باز کنید.
          </div>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => { setEditing(null); editingIdRef.current = null; }} size="md" closeOnBackdrop={!busy}>
        {editing && (
          <form onSubmit={saveSettings} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ModalHeader title={`تنظیمات «${editing.name}»`} description="نام، آدرس و زبان این منبع فقط در کاتالوگ مدیر کل تغییر می‌کند." onClose={() => { setEditing(null); editingIdRef.current = null; }} />
            <ModalBody className="space-y-4 p-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">{editing.name}</p>
                <p className="mt-1 truncate" dir="ltr">{editing.url}</p>
                <p className="mt-2 text-xs">{sourceLanguageLabel(editing.sourceLanguage || 'auto')}</p>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">نوع تنظیمات</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                  <input type="radio" name="settingsMode" checked={form.settingsMode === 'default'} onChange={() => setForm((current) => ({ ...current, settingsMode: 'default', pollIntervalMinutes: String(orgPollMinutes) }))} className="mt-1" />
                  <span><span className="block text-sm font-semibold text-slate-900">پیش‌فرض سازمان</span><span className="mt-1 block text-xs text-slate-500">بدون فیلتر کلمه؛ فاصله پایش {formatPersianDigits(orgPollMinutes)} دقیقه</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                  <input type="radio" name="settingsMode" checked={form.settingsMode === 'custom'} onChange={() => setForm((current) => ({ ...current, settingsMode: 'custom' }))} className="mt-1" />
                  <span><span className="block text-sm font-semibold text-slate-900">اختصاصی این سازمان</span><span className="mt-1 block text-xs text-slate-500">فیلتر کلمات و فاصله پایش مخصوص این منبع</span></span>
                </label>
              </fieldset>
              {form.settingsMode === 'custom' && (
                <>
                  <Input label="کلمات اجباری (با ویرگول)" placeholder="فقط خبرهایی که حداقل یکی از این کلمات را دارند" value={form.includeWords} onChange={(event) => setForm((current) => ({ ...current, includeWords: event.target.value }))} />
                  <Input label="کلمات ممنوع (با ویرگول)" placeholder="خبرهایی که این کلمات را دارند نادیده گرفته می‌شوند" value={form.excludeWords} onChange={(event) => setForm((current) => ({ ...current, excludeWords: event.target.value }))} />
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                    فاصله پایش (دقیقه)
                    <input type="number" min="5" max="1440" required dir="ltr" className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" value={form.pollIntervalMinutes} onChange={(event) => setForm((current) => ({ ...current, pollIntervalMinutes: event.target.value }))} />
                  </label>
                </>
              )}
              {[
                ['autoPoll', 'پایش خودکار', 'مطالب جدید این منبع بدون دخالت کاربر دریافت شوند.'],
                ['autoPrepare', 'آماده‌سازی خودکار', 'مطالب جدید بدون دخالت کاربر آماده شوند.'],
                ['autoPublish', 'انتشار خودکار', 'خبر آماده در سایت منتشر شود.'],
                ['autoSendSocial', 'ارسال خودکار به استودیوی اجتماعی', 'خبر آماده برای شبکه‌های اجتماعی ارسال شود.'],
              ].map(([key, label, description]) => {
                const field = key as 'autoPoll' | 'autoPrepare' | 'autoPublish' | 'autoSendSocial';
                return (
                  <label key={key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 hover:border-primary-300">
                    <input type="checkbox" checked={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600" />
                    <span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{description}</span></span>
                  </label>
                );
              })}
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setEditing(null); editingIdRef.current = null; }}>انصراف</Button>
              <Button type="submit" isLoading={busy === 'save'}>ذخیره</Button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </section>
  );
}
