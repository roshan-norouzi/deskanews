'use client';

import { useMemo, useRef, useState } from 'react';
import { Pencil, Power } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { FeedSourceCard, FeedSourceCardGrid, feedTogglePowerClass } from '@/components/publishing/feed-source-card';
import { groupFeedsBySourceTopic } from '@/components/publishing/feed-channel-fields';
import { normalizeFeedTopicKey } from '@/components/publishing/feed-source-filters';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { newsOrganizationAutomation } from '@/lib/news-feed-automation';
import { sourceLanguageLabel, type SourceLanguage } from '@deska/shared';
import { matchesFeedCatalogFilters } from '@/components/publishing/feed-source-filters';
import {
  FEED_CATALOG_GROUPS,
  resolveCatalogGroup,
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
  sourceGroupId?: string;
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
  selectedCatalogGroups: ReadonlySet<FeedCatalogGroup>;
  selectedTopics: ReadonlySet<string>;
  labelOptions: string[];
  searchQuery?: string;
  includeDisabled?: boolean;
}

function matchesFeedNameSearch(feed: { name: string; url?: string }, searchQuery: string) {
  const normalized = searchQuery.trim().toLocaleLowerCase('fa');
  if (!normalized) return true;
  return feed.name.toLocaleLowerCase('fa').includes(normalized)
    || String(feed.url || '').toLocaleLowerCase('fa').includes(normalized);
}

export function PlatformFeedsSection({
  selectedCatalogGroups,
  selectedTopics,
  labelOptions,
  searchQuery = '',
  includeDisabled = false,
}: PlatformFeedsSectionProps) {
  const { data, error: loadError, isLoading, refetch } = useApi<PlatformFeed[]>('/publishing/platform-feeds');
  const { data: orgSettings } = useApi<Record<string, string>>('/publishing/settings');
  const orgPollMinutes = Number(newsOrganizationAutomation(orgSettings ?? {}).pollIntervalMinutes) || 240;
  const { isSuperAdmin } = useAuth();
  const { activeTenant } = useTenant();
  const canManage = isSuperAdmin || ['owner', 'admin', 'manager', 'senior_specialist'].includes(activeTenant?.memberRole || '');
  const feeds = useMemo(() => (Array.isArray(data) ? data.filter((feed) => feed.platformEnabled !== false) : []), [data]);
  const visibleBuckets = useMemo(() => {
    const matched = feeds.filter((feed) => {
      if (!includeDisabled && !feed.enabled) return false;
      if (!matchesFeedCatalogFilters(feed, selectedCatalogGroups, selectedTopics, labelOptions)) return false;
      return matchesFeedNameSearch(feed, searchQuery);
    });
    return groupFeedsBySourceTopic(matched, (feed) => normalizeFeedTopicKey(feed.topicLabel, labelOptions));
  }, [feeds, includeDisabled, labelOptions, searchQuery, selectedCatalogGroups, selectedTopics]);
  const [editing, setEditing] = useState<PlatformFeed | null>(null);
  const editingIdsRef = useRef<string[]>([]);
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
    const feedIds = editingIdsRef.current;
    if (!feedIds.length || !editing) return;
    const interval = Number(form.pollIntervalMinutes);
    if (form.settingsMode === 'custom' && (!Number.isInteger(interval) || interval < 5 || interval > 1440)) {
      setNotice({ type: 'error', text: 'فاصله پایش باید بین ۵ تا ۱۴۴۰ دقیقه باشد.' });
      return;
    }
    const feedName = editing.name;
    await run('save', async () => {
      await Promise.all(feedIds.map((feedId) => apiFetch(`/publishing/platform-feeds/${feedId}`, {
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
      })));
      setEditing(null);
      editingIdsRef.current = [];
      setNotice({ type: 'success', text: `تنظیمات «${feedName}» ذخیره شد.` });
      await refetch();
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">فیدهای کاتالوگ</h2>
        <p className="mt-1 text-sm text-slate-500">
          {includeDisabled
            ? 'هر کارت یک منبع و یک موضوع است. اگر چند فید همان موضوع را داشته باشند، با هم روشن یا خاموش می‌شوند.'
            : 'فقط موضوع‌های روشن. برای دیدن و روشن کردن بقیه، نوع رسانه یا موضوع را بالا تیک بزنید.'}
        </p>
      </div>

      {notice && (
        <div role="status" className={cn('rounded-xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>
          {notice.text}
        </div>
      )}
      {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">دریافت منابع پیش‌فرض انجام نشد: {loadError}</div>}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="grid min-h-40 place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
        ) : visibleBuckets.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {feeds.length === 0 ? 'فید پیش‌فرضی ثبت نشده است.' : 'فیدی با این نوع رسانه و موضوع پیدا نشد.'}
          </div>
        ) : (
          <FeedSourceCardGrid>
            {visibleBuckets.map((bucket) => {
              const feed = bucket.anchor;
              const nextEnabled = !bucket.enabled;
              const toggleTitle = bucket.members.length > 1
                ? (bucket.enabled ? 'خاموش کردن همه فیدهای این موضوع' : 'روشن کردن همه فیدهای این موضوع')
                : (bucket.enabled ? 'غیرفعال کردن' : 'فعال کردن');
              return (
              <FeedSourceCard
                key={bucket.key}
                name={feed.name}
                url={bucket.members.length === 1 ? feed.url : undefined}
                logoUrl={feed.logoUrl}
                sourceType={feed.sourceType}
                enabled={bucket.enabled}
                topicLabels={bucket.topicLabel ? [bucket.topicLabel] : []}
                badge={<Badge variant="default" className="shrink-0 text-[10px]">{FEED_CATALOG_GROUPS[resolveCatalogGroup(feed.sourceType, feed.catalogGroup, feed.sourceLanguage)].label}</Badge>}
                footer={bucket.members.length > 1 ? (
                  <p className="text-[11px] font-medium text-slate-500">{formatPersianDigits(bucket.members.length)} فید این موضوع</p>
                ) : null}
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
                          editingIdsRef.current = bucket.members.map((member) => member.id);
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
                        title={toggleTitle}
                        aria-label={toggleTitle}
                        isLoading={busy === `toggle-${bucket.key}`}
                        onClick={() => run(`toggle-${bucket.key}`, async () => {
                          const pending = bucket.members.filter((member) => member.enabled !== nextEnabled);
                          await Promise.all(pending.map((member) => apiFetch(`/publishing/platform-feeds/${member.id}/toggle`, {
                            method: 'POST',
                            body: { enabled: nextEnabled },
                          })));
                          await refetch();
                        })}
                      >
                        <Power className={feedTogglePowerClass(bucket.enabled)} />
                      </Button>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400">بدون دسترسی</span>
                  )
                }
              />
              );
            })}
          </FeedSourceCardGrid>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => { setEditing(null); editingIdsRef.current = []; }} size="md" closeOnBackdrop={!busy}>
        {editing && (
          <form onSubmit={saveSettings} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ModalHeader title={`تنظیمات «${editing.name}»`} description={editingIdsRef.current.length > 1 ? `این تنظیمات روی هر ${formatPersianDigits(editingIdsRef.current.length)} فید این موضوع اعمال می‌شود.` : 'نام، آدرس و زبان این منبع فقط در کاتالوگ مدیر کل تغییر می‌کند.'} onClose={() => { setEditing(null); editingIdsRef.current = []; }} />
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
              <Button type="button" variant="outline" onClick={() => { setEditing(null); editingIdsRef.current = []; }}>انصراف</Button>
              <Button type="submit" isLoading={busy === 'save'}>ذخیره</Button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </section>
  );
}
