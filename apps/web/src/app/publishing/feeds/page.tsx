'use client';

import { useMemo, useRef, useState } from 'react';
import {
  HeartPulse,
  Radio,
  RefreshCw,
  Rss,
  Search,
  Trash2,
  Pencil,
  Plus,
  Power,
} from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { FeedSourceFilters, matchesFeedCatalogFilters } from '@/components/publishing/feed-source-filters';
import { PlatformFeedsSection } from '@/components/publishing/platform-feeds-section';
import { FeedBulkActions } from '@/components/publishing/feed-bulk-actions';
import { FeedSourceCard, FeedSourceCardGrid, feedTogglePowerClass } from '@/components/publishing/feed-source-card';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, cn } from '@/lib/utils';
import { mergeSourceLanguageCatalog, sourceLanguageLabel, type SourceLanguage } from '@deska/shared';
import { FeedChannelFields, channelsForFeed, topicLabelsForSourceGroup, type FeedChannelDraft } from '@/components/publishing/feed-channel-fields';
import { FEED_PROBE_REQUEST_TIMEOUT_MS, feedUsesOrganizationDefaults, newsOrganizationAutomation } from '@/lib/news-feed-automation';
import {
  FEED_CATALOG_GROUPS,
  FEED_CATALOG_GROUP_ORDER,
  FEED_SOURCE_UI,
  defaultSourceTypeForCatalogGroup,
  feedSourceTypeHint,
  resolveCatalogGroup,
  sortFeedsByName,
  type FeedCatalogGroup,
  type FeedSourceType,
} from '@/lib/feed-source-types';

type FeedPurpose = 'news-room' | 'social-studio';

interface Feed {
  id: string;
  name: string;
  url: string;
  sourceType?: FeedSourceType;
  catalogGroup?: FeedCatalogGroup;
  topicLabel?: string;
  sourceGroupId?: string;
  logoUrl?: string;
  sourceLanguage?: SourceLanguage;
  resolvedFeedUrl?: string;
  includeWords?: string[];
  excludeWords?: string[];
  pollIntervalMinutes?: number | null;
  autoPoll?: boolean | null;
  autoPrepare?: boolean | null;
  autoPublish?: boolean | null;
  autoSendSocial?: boolean | null;
  purpose: FeedPurpose;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string;
  settingsMode?: string | null;
}

interface FeedForm {
  name: string;
  url: string;
  sourceType: FeedSourceType;
  sourceLanguage: SourceLanguage;
  purpose: FeedPurpose;
  topicLabel: string;
  channels: FeedChannelDraft[];
  includeWords: string;
  excludeWords: string;
  pollIntervalMinutes: string;
  autoPoll: boolean;
  autoPrepare: boolean;
  autoPublish: boolean;
  autoSendSocial: boolean;
  useOrganizationDefaults: boolean;
}

const EMPTY_FORM: FeedForm = { name: '', url: '', sourceType: 'rss', sourceLanguage: 'auto', purpose: 'news-room', topicLabel: '', channels: [{ url: '', topicLabel: '' }], includeWords: '', excludeWords: '', pollIntervalMinutes: '240', autoPoll: true, autoPrepare: true, autoPublish: false, autoSendSocial: false, useOrganizationDefaults: true };

interface HealthItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
  featuredImageUrl: string;
  category: string;
}

interface HealthResult {
  source: { name: string; url: string; sourceType: FeedSourceType; resolvedFeedUrl?: string };
  items: HealthItem[];
}

function filledChannels(channels: FeedChannelDraft[]) {
  return channels.map((channel) => ({ url: channel.url.trim(), topicLabel: channel.topicLabel })).filter((channel) => channel.url);
}

function validateForm(form: FeedForm) {
  if (form.name.trim().length < 2) return 'نام منبع باید حداقل ۲ نویسه باشد.';
  if (!form.useOrganizationDefaults) {
    const interval = Number(form.pollIntervalMinutes);
    if (!Number.isInteger(interval) || interval < 5 || interval > 1440) return 'فاصله پایش باید بین ۵ تا ۱۴۴۰ دقیقه باشد.';
  }
  const channels = filledChannels(form.channels);
  if (!channels.length) return 'حداقل یک آدرس RSS لازم است.';
  for (const channel of channels) {
    try {
      const url = new URL(channel.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      return 'آدرس منبع باید کامل و معتبر باشد؛ مانند https://example.com';
    }
  }
  return '';
}

function wordsToString(words?: string[]) {
  return (words || []).join('، ');
}

function createModalTitle(group: FeedCatalogGroup, editing: boolean) {
  if (editing) return 'ویرایش منبع';
  const sourceTypes = FEED_CATALOG_GROUPS[group].sourceTypes;
  if (sourceTypes.length === 1) {
    return `افزودن ${FEED_SOURCE_UI[sourceTypes[0]].shortLabel} اختصاصی`;
  }
  return `افزودن منبع اختصاصی — ${FEED_CATALOG_GROUPS[group].label}`;
}

export default function FeedsPage() {
  const confirm = useConfirm();
  const { data, error: loadError, isLoading, refetch } = useApi<Feed[]>('/publishing/news/feeds');
  const { data: orgSettings } = useApi<Record<string, string>>('/publishing/settings');
  const languagesApi = useApi<Array<{ code: string; label: string }>>('/publishing/source-languages');
  const orgAutomation = useMemo(() => newsOrganizationAutomation(orgSettings || {}), [orgSettings]);
  const feeds = useMemo(() => Array.isArray(data) ? data : [], [data]);
  const [selectedCatalogGroups, setSelectedCatalogGroups] = useState<Set<FeedCatalogGroup>>(() => new Set());
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const { data: topicLabels } = useApi<string[]>('/publishing/feed-topic-labels');
  const labelOptions = useMemo(() => Array.isArray(topicLabels) ? topicLabels : [], [topicLabels]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalGroup, setModalGroup] = useState<FeedCatalogGroup>('media-domestic');
  const [editing, setEditing] = useState<Feed | null>(null);
  const [form, setForm] = useState<FeedForm>(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const editingIdRef = useRef<string | null>(null);

  const visibleCustomFeeds = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fa');
    return sortFeedsByName(feeds.filter((feed) => {
      if (!feed.enabled) return false;
      if (!matchesFeedCatalogFilters(feed, selectedCatalogGroups, selectedTopics, labelOptions)) return false;
      if (!normalized) return true;
      return feed.name.toLocaleLowerCase('fa').includes(normalized)
        || feed.url.toLocaleLowerCase('fa').includes(normalized);
    }));
  }, [feeds, labelOptions, query, selectedCatalogGroups, selectedTopics]);

  const modalSourceTypes = FEED_CATALOG_GROUPS[modalGroup].sourceTypes;
  const showSourceTypePicker = modalSourceTypes.length > 1;
  const languageOptions = useMemo(
    () => mergeSourceLanguageCatalog([
      ...(languagesApi.data || []).map((item) => item.code),
      ...feeds.map((feed) => feed.sourceLanguage),
      form.sourceLanguage,
    ]),
    [feeds, form.sourceLanguage, languagesApi.data],
  );

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    editingIdRef.current = null;
    setForm(EMPTY_FORM);
  }

  function openCreate(group: FeedCatalogGroup = [...selectedCatalogGroups][0] || 'media-domestic') {
    setEditing(null);
    editingIdRef.current = null;
    setModalGroup(group);
    const defaultTopic = [...selectedTopics].find((topic) => topic !== '__none') || '';
    setForm({
      ...EMPTY_FORM,
      sourceType: defaultSourceTypeForCatalogGroup(group),
      topicLabel: defaultTopic,
      channels: [{ url: '', topicLabel: defaultTopic }],
      pollIntervalMinutes: orgAutomation.pollIntervalMinutes,
      autoPoll: orgAutomation.autoPoll,
      autoPrepare: orgAutomation.autoPrepare,
      autoPublish: orgAutomation.autoPublish,
      autoSendSocial: orgAutomation.autoSendSocial,
      useOrganizationDefaults: true,
    });
    setNotice(null);
    setModalOpen(true);
  }

  function openEdit(feed: Feed) {
    const group = resolveCatalogGroup(feed.sourceType, feed.catalogGroup, feed.sourceLanguage);
    setEditing(feed);
    editingIdRef.current = feed.id;
    setModalGroup(group);
    const useOrganizationDefaults = feedUsesOrganizationDefaults(feed);
    const automation = useOrganizationDefaults ? orgAutomation : {
      pollIntervalMinutes: String(feed.pollIntervalMinutes ?? orgAutomation.pollIntervalMinutes),
      autoPoll: feed.autoPoll ?? orgAutomation.autoPoll,
      autoPrepare: feed.autoPrepare ?? orgAutomation.autoPrepare,
      autoPublish: feed.autoPublish ?? orgAutomation.autoPublish,
      autoSendSocial: feed.autoSendSocial ?? orgAutomation.autoSendSocial,
    };
    setForm({
      name: feed.name,
      url: feed.url,
      sourceType: feed.sourceType || defaultSourceTypeForCatalogGroup(group),
      sourceLanguage: feed.sourceLanguage || 'auto',
      topicLabel: feed.topicLabel || '',
      channels: channelsForFeed(feed, feeds),
      purpose: feed.purpose,
      includeWords: wordsToString(feed.includeWords),
      excludeWords: wordsToString(feed.excludeWords),
      pollIntervalMinutes: automation.pollIntervalMinutes,
      autoPoll: automation.autoPoll,
      autoPrepare: automation.autoPrepare,
      autoPublish: automation.autoPublish,
      autoSendSocial: automation.autoSendSocial,
      useOrganizationDefaults,
    });
    setNotice(null);
    setModalOpen(true);
  }

  async function testSource(feed: Feed) {
    await run(`test-${feed.id}`, async () => {
      const result = await apiFetch<HealthResult>(`/publishing/news/feeds/${feed.id}/test`, {
        method: 'POST',
        signal: AbortSignal.timeout(FEED_PROBE_REQUEST_TIMEOUT_MS),
      });
      setHealth(result);
      setHealthOpen(true);
    });
  }

  async function probeSource() {
    const validationError = validateForm(form);
    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }
    await run('probe', async () => {
      const result = await apiFetch<HealthResult>('/publishing/news/feeds/probe', {
        method: 'POST',
        signal: AbortSignal.timeout(FEED_PROBE_REQUEST_TIMEOUT_MS),
        body: {
          name: form.name.trim(),
          url: filledChannels(form.channels)[0]?.url || form.url.trim(),
          sourceType: form.sourceType,
          includeWords: form.includeWords,
          excludeWords: form.excludeWords,
        },
      });
      setHealth(result);
      setHealthOpen(true);
    });
  }

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await operation();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'درخواست انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.' });
    } finally {
      setBusy(null);
    }
  }

  async function saveFeed(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }
    await run('save', async () => {
      const feedId = editingIdRef.current;
      const channels = filledChannels(form.channels);
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        url: channels[0].url,
        sourceType: form.sourceType,
        sourceLanguage: form.sourceLanguage,
        purpose: 'news-room',
        catalogGroup: modalGroup,
        topicLabel: channels[0].topicLabel,
        channels,
        includeWords: form.includeWords,
        excludeWords: form.excludeWords,
        settingsMode: form.useOrganizationDefaults ? 'default' : 'custom',
      };
      if (!form.useOrganizationDefaults) {
        body.pollIntervalMinutes = Number(form.pollIntervalMinutes);
        body.autoPoll = form.autoPoll;
        body.autoPrepare = form.autoPrepare;
        body.autoPublish = form.autoPublish;
        body.autoSendSocial = form.autoSendSocial;
      }
      await apiFetch(feedId ? `/publishing/news/feeds/${feedId}` : '/publishing/news/feeds', {
        method: feedId ? 'PATCH' : 'POST',
        body,
      });
      closeModal();
      setNotice({ type: 'success', text: feedId ? 'منبع ذخیره شد.' : 'منبع اضافه شد.' });
      await refetch();
    });
  }

  const catalogBrowseActive = selectedCatalogGroups.size > 0 || selectedTopics.size > 0;

  return (
    <ProtectedLayout>
      <PageContainer className="space-y-8">
        <PageHeader
          title="منابع خبری"
          description="هر منبع یک نام و یک نوع رسانه دارد. فیدهای RSS همان منبع با موضوع جدا، مثلاً ورزشی یا اقتصادی، اینجا فیلتر و روشن می‌شوند."
          icon={Rss}
          actions={
            <Button className="shrink-0" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" /> افزودن منبع
            </Button>
          }
        />

        <Card className="space-y-4 p-4 sm:p-5">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">جست‌وجوی نام رسانه</span>
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جست‌وجوی نام رسانه..."
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-3 pr-10 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </label>
          <FeedSourceFilters
            selectedCatalogGroups={selectedCatalogGroups}
            onCatalogGroupsChange={setSelectedCatalogGroups}
            selectedTopics={selectedTopics}
            onTopicsChange={setSelectedTopics}
            topicOptions={labelOptions}
          />
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-500">
            <Radio className="h-4 w-4 shrink-0" />
            <span>
              {catalogBrowseActive
                ? 'فیدهای کاتالوگ مطابق فیلتر (شامل خاموش برای روشن کردن)'
                : 'فقط منابع روشن نمایش داده می‌شوند — نوع رسانه یا موضوع را تیک بزنید تا کاتالوگ را مرور کنید'}
            </span>
          </div>
        </Card>

        <PlatformFeedsSection
          selectedCatalogGroups={selectedCatalogGroups}
          selectedTopics={selectedTopics}
          labelOptions={labelOptions}
          searchQuery={query}
          includeDisabled={catalogBrowseActive}
        />

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">فیدهای اختصاصی سازمان</h2>
              <p className="mt-1 text-sm text-slate-500">همان فیلتر نوع رسانه و موضوع روی فیدهایی که خود سازمان ساخته اعمال می‌شود.</p>
            </div>
            <FeedBulkActions
              exportPath="/publishing/news/feeds/export"
              importPath="/publishing/news/feeds/import"
              onImported={() => { void refetch(); }}
            />
          </div>

        {notice && <div role="status" className={cn('rounded-xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}
        {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">بارگذاری منابع خبری انجام نشد: {loadError}</div>}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {query.trim()
                ? `${visibleCustomFeeds.length} منبع اختصاصی در نتایج جست‌وجو`
                : `${visibleCustomFeeds.length} منبع اختصاصی روشن`}
            </p>
          </div>

          {isLoading ? (
            <div className="grid min-h-56 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
          ) : visibleCustomFeeds.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Rss className="h-8 w-8" /></span><h2 className="mt-4 font-semibold text-slate-900">فیدی با این فیلتر نیست</h2><p className="mt-2 text-sm text-slate-500">نوع رسانه یا موضوع را عوض کنید، یا منبعی با فیدهای موضوعی اضافه کنید.</p><Button className="mt-5" onClick={() => openCreate()}><Plus className="h-4 w-4" /> افزودن منبع</Button></div>
          ) : (
            <FeedSourceCardGrid>
              {visibleCustomFeeds.map((feed) => (
                <FeedSourceCard
                  key={feed.id}
                  name={feed.name}
                  url={feed.url}
                  logoUrl={feed.logoUrl}
                  sourceType={feed.sourceType}
                  enabled={feed.enabled}
                  topicLabels={topicLabelsForSourceGroup(feed, feeds)}
                  badge={<span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{FEED_CATALOG_GROUPS[resolveCatalogGroup(feed.sourceType, feed.catalogGroup, feed.sourceLanguage)].label}</span>}
                  footer={
                    feed.lastFetchedAt ? (
                      <p className="text-[10px] text-slate-400">
                        آخرین پایش: {new Date(feed.lastFetchedAt).toLocaleString('fa-IR')}
                      </p>
                    ) : null
                  }
                  actions={
                    <>
                      <Button size="sm" variant="ghost" title="آزمایش منبع" aria-label="آزمایش منبع" isLoading={busy === `test-${feed.id}`} onClick={() => void testSource(feed)}>
                        <HeartPulse className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button size="sm" variant="ghost" title="پایش الآن" aria-label="پایش الآن" isLoading={busy === `fetch-${feed.id}`} onClick={() => run(`fetch-${feed.id}`, async () => { await apiFetch(`/publishing/news/feeds/${feed.id}/fetch`, { method: 'POST' }); setNotice({ type: 'success', text: `پایش «${feed.name}» انجام شد.` }); await refetch(); })}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="ویرایش" aria-label="ویرایش" onClick={() => openEdit(feed)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title={feed.enabled ? 'غیرفعال کردن' : 'فعال کردن'} aria-label={feed.enabled ? 'غیرفعال کردن' : 'فعال کردن'} isLoading={busy === `toggle-${feed.id}`} onClick={() => run(`toggle-${feed.id}`, async () => { await apiFetch(`/publishing/news/feeds/${feed.id}/toggle`, { method: 'POST' }); await refetch(); })}>
                        <Power className={feedTogglePowerClass(feed.enabled)} />
                      </Button>
                      <Button size="sm" variant="ghost" title="حذف" aria-label="حذف" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={async () => { const ok = await confirm({ title: 'حذف منبع؟', description: `منبع «${feed.name}» برای همیشه حذف می‌شود.`, confirmLabel: 'حذف منبع', variant: 'danger' }); if (!ok) return; run(`delete-${feed.id}`, async () => { await apiFetch(`/publishing/news/feeds/${feed.id}`, { method: 'DELETE' }); setNotice({ type: 'success', text: 'منبع حذف شد.' }); await refetch(); }); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              ))}
            </FeedSourceCardGrid>
          )}
        </Card>
        </section>

        <Modal open={modalOpen} onClose={closeModal} size="xl" closeOnBackdrop={!busy}>
          <form onSubmit={saveFeed} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ModalHeader
                title={createModalTitle(modalGroup, Boolean(editing))}
                description={FEED_CATALOG_GROUPS[modalGroup].description}
                onClose={closeModal}
              />
              <ModalBody className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="نام منبع" required placeholder="مثلاً ایسنا" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700">نوع رسانه
                    <select
                      value={modalGroup}
                      onChange={(event) => {
                        const group = event.target.value as FeedCatalogGroup;
                        setModalGroup(group);
                        setForm((current) => ({ ...current, sourceType: defaultSourceTypeForCatalogGroup(group) }));
                      }}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-primary-500"
                    >
                      {FEED_CATALOG_GROUP_ORDER.map((group) => <option key={group} value={group}>{FEED_CATALOG_GROUPS[group].label}</option>)}
                    </select>
                  </label>
                </div>
                <FeedChannelFields
                  channels={form.channels}
                  labelOptions={labelOptions}
                  urlLabel={FEED_SOURCE_UI[form.sourceType].label}
                  urlPlaceholder={FEED_SOURCE_UI[form.sourceType].placeholder}
                  onChange={(channels) => setForm((current) => ({ ...current, channels, url: channels[0]?.url || '', topicLabel: channels[0]?.topicLabel || '' }))}
                />
                {showSourceTypePicker ? (
                  <fieldset>
                    <legend className="mb-3 text-sm font-medium text-slate-700">نوع منبع</legend>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {(modalSourceTypes as FeedSourceType[]).map((key) => {
                        const item = FEED_SOURCE_UI[key];
                        const Icon = item.icon;
                        return (
                          <label key={key} className={cn('cursor-pointer rounded-2xl border p-4 transition', form.sourceType === key ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100' : 'border-slate-200 hover:border-slate-300')}>
                            <input type="radio" name="sourceType" value={key} checked={form.sourceType === key} onChange={() => setForm((current) => ({ ...current, sourceType: key }))} className="sr-only" />
                            <Icon className={cn('h-5 w-5', form.sourceType === key ? 'text-primary-700' : 'text-slate-500')} />
                            <span className="mt-3 block text-sm font-semibold text-slate-900">{item.shortLabel}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">{feedSourceTypeHint(form.sourceType)}</p>
                  </fieldset>
                ) : (
                  <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">{feedSourceTypeHint(form.sourceType)}</p>
                )}
                {modalGroup !== 'telegram' && modalGroup !== 'twitter' ? (
                  <fieldset>
                    <legend className="mb-3 text-sm font-medium text-slate-700">زبان منبع</legend>
                    <select value={form.sourceLanguage} onChange={(event) => setForm((current) => ({ ...current, sourceLanguage: event.target.value as SourceLanguage }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20">{languageOptions.map((language) => <option key={language} value={language}>{sourceLanguageLabel(language)}</option>)}</select>
                    <p className="mt-2 text-xs leading-5 text-slate-500">در فرایند آماده‌سازی و ترجمه استفاده می‌شود. «تشخیص خودکار» برای متن‌های فارسی بازنویسی و برای سایر زبان‌ها ترجمه انجام می‌دهد.</p>
                  </fieldset>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2"><Input label="کلمات اجباری (با ویرگول)" placeholder="فقط خبرهایی که حداقل یکی از این کلمات را دارند" value={form.includeWords} onChange={(event) => setForm((current) => ({ ...current, includeWords: event.target.value }))} /><Input label="کلمات ممنوع (با ویرگول)" placeholder="خبرهایی که این کلمات را دارند نادیده گرفته می‌شوند" value={form.excludeWords} onChange={(event) => setForm((current) => ({ ...current, excludeWords: event.target.value }))} /></div>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={form.useOrganizationDefaults}
                    onChange={(event) => {
                      const useOrganizationDefaults = event.target.checked;
                      setForm((current) => ({
                        ...current,
                        useOrganizationDefaults,
                        ...(useOrganizationDefaults ? {
                          pollIntervalMinutes: orgAutomation.pollIntervalMinutes,
                          autoPoll: orgAutomation.autoPoll,
                          autoPrepare: orgAutomation.autoPrepare,
                          autoPublish: orgAutomation.autoPublish,
                          autoSendSocial: orgAutomation.autoSendSocial,
                        } : {}),
                      }));
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">استفاده از پیش‌فرض پایش و اتوماسیون سازمان</span>
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">با تغییر تنظیمات در «تنظیمات انتشار → پایش خبر»، همین منبع هم به‌روز می‌شود.</span>
                  </span>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">فاصله پایش (دقیقه)<input type="number" min="5" max="1440" required dir="ltr" disabled={form.useOrganizationDefaults} className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-100 disabled:text-slate-500" value={form.pollIntervalMinutes} onChange={(event) => setForm((current) => ({ ...current, pollIntervalMinutes: event.target.value, useOrganizationDefaults: false }))} /><span className="text-xs font-normal text-slate-500">بین ۵ دقیقه تا ۲۴ ساعت</span></label>
                <fieldset><legend className="mb-3 text-sm font-medium text-slate-700">اتوماسیون این منبع</legend><div className="grid gap-3 sm:grid-cols-2">{[
                  ['autoPoll', 'پایش خودکار', 'منبع طبق فاصله زمانی بالا به‌صورت خودکار بررسی شود.'],
                  ['autoPrepare', 'آماده‌سازی خودکار', 'مطالب جدید بدون دخالت کاربر آماده شوند.'],
                  ['autoPublish', 'انتشار خودکار', 'خبر آماده در سایت منتشر شود.'],
                  ['autoSendSocial', 'ارسال خودکار به استودیوی اجتماعی', 'خبر آماده برای انتشار در شبکه‌های اجتماعی ارسال شود.'],
                ].map(([key, label, description]) => { const field = key as keyof Pick<FeedForm, 'autoPoll' | 'autoPrepare' | 'autoPublish' | 'autoSendSocial'>; return <label key={key} className={cn('flex items-start gap-3 rounded-2xl border border-slate-200 p-4', form.useOrganizationDefaults ? 'bg-slate-50 opacity-90' : 'cursor-pointer hover:border-primary-300')}><input type="checkbox" disabled={form.useOrganizationDefaults} checked={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.checked, useOrganizationDefaults: false }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600" /><span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{description}</span></span></label>; })}</div><p className="mt-3 text-xs leading-5 text-slate-500">اگر «پیش‌فرض سازمان» فعال باشد، مقادیر از تنظیمات انتشار خوانده می‌شوند. برای تنظیم اختصاصی، تیک پیش‌فرض را بردارید یا یکی از گزینه‌ها را تغییر دهید.</p></fieldset>
              </ModalBody>
              <ModalFooter className="flex items-center justify-between gap-2">
                <Button type="button" variant="outline" isLoading={busy === 'probe'} onClick={() => void probeSource()}><HeartPulse className="h-4 w-4" /> آزمایش منبع</Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={closeModal}>انصراف</Button>
                  <Button type="submit" isLoading={busy === 'save'}>{editing ? 'ذخیره تغییرات' : 'افزودن منبع'}</Button>
                </div>
              </ModalFooter>
          </form>
        </Modal>
        <Modal open={healthOpen && !!health} onClose={() => setHealthOpen(false)} size="xl" zIndex={80}>
          {health && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ModalHeader
                title={<div className="flex items-center gap-2"><HeartPulse className="h-5 w-5 text-emerald-600" /><span>آزمایش منبع</span></div>}
                description={
                  <>
                    <p>۵ مطلب آخر «{health.source.name}»</p>
                    <p className="mt-1 truncate text-xs text-slate-400" dir="ltr">{health.source.url}</p>
                    {health.source.resolvedFeedUrl && (
                      <p className="mt-1 truncate text-xs text-emerald-700" dir="ltr">فید کشف‌شده: {health.source.resolvedFeedUrl}</p>
                    )}
                  </>
                }
                onClose={() => setHealthOpen(false)}
              />
              <ModalBody className="space-y-3 p-6" dir="rtl">
                {health.items.length ? health.items.map((item) => (
                  <article key={item.url} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex gap-4">
                      {item.featuredImageUrl && <img src={item.featuredImageUrl} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover" />}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold leading-6 text-slate-900">{item.title}</h3>
                        <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">{item.summary || 'بدون خلاصه'}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                          {item.publishedAt && <span>{new Date(item.publishedAt).toLocaleString('fa-IR')}</span>}
                          <a href={item.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">مشاهده منبع</a>
                        </div>
                      </div>
                    </div>
                  </article>
                )) : (
                  <div className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-800">منبع پاسخ داد اما مطلبی برای نمایش پیدا نشد. اگر فیلتر کلمات دارید، آن‌ها را بررسی کنید.</div>
                )}
              </ModalBody>
              <ModalFooter className="flex justify-end">
                <Button type="button" onClick={() => setHealthOpen(false)}>بستن</Button>
              </ModalFooter>
            </div>
          )}
        </Modal>
      </PageContainer>
    </ProtectedLayout>
  );
}
