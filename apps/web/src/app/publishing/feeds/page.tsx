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
  SlidersHorizontal,
} from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { FeedSourceFilters, matchesFeedCatalogFilters, normalizeFeedTopicKey } from '@/components/publishing/feed-source-filters';
import { PlatformFeedsSection, matchesFeedNameSearch } from '@/components/publishing/platform-feeds-section';
import { FeedBulkActions } from '@/components/publishing/feed-bulk-actions';
import {
  buildNewsFeedSettingsPatch,
  buildPlatformFeedSettingsPatch,
  FeedMonitoringSettingsForm,
  type FeedMonitoringSettingsValues,
} from '@/components/publishing/feed-monitoring-settings-form';
import { FeedSourceCard, FeedSourceCardGrid, feedTogglePowerClass } from '@/components/publishing/feed-source-card';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { ApiError, apiFetch, cn } from '@/lib/utils';
import { formatPersianDigits, mergeSourceLanguageCatalog, sourceLanguageLabel, type SourceLanguage } from '@deska/shared';
import { FeedChannelFields, channelsForFeed, groupFeedsBySourceTopic, type FeedChannelDraft } from '@/components/publishing/feed-channel-fields';
import { FEED_PROBE_REQUEST_TIMEOUT_MS, feedUsesOrganizationDefaults, newsOrganizationAutomation } from '@/lib/news-feed-automation';
import {
  FEED_CATALOG_GROUPS,
  FEED_CATALOG_GROUP_ORDER,
  FEED_SOURCE_UI,
  defaultSourceTypeForCatalogGroup,
  feedSourceTypeHint,
  resolveCatalogGroup,
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

interface PlatformFeedMember {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  sourceType?: FeedSourceType;
  catalogGroup?: FeedCatalogGroup;
  topicLabel?: string | null;
  sourceLanguage?: SourceLanguage;
  platformEnabled?: boolean;
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
  const { isSuperAdmin } = useAuth();
  const { activeTenant } = useTenant();
  const canManagePlatformFeeds = isSuperAdmin || ['owner', 'admin', 'manager', 'senior_specialist'].includes(activeTenant?.memberRole || '');
  const { data, error: loadError, isLoading, refetch } = useApi<Feed[]>('/publishing/news/feeds');
  const { data: platformFeedsData } = useApi<PlatformFeedMember[]>('/publishing/platform-feeds');
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
  const [platformFeedsRevision, setPlatformFeedsRevision] = useState(0);
  const editingIdRef = useRef<string | null>(null);

  const catalogBrowseActive = selectedCatalogGroups.size > 0 || selectedTopics.size > 0;
  const filterBulkActive = catalogBrowseActive || query.trim().length > 0;
  const visibleCustomBuckets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fa');
    const matched = feeds.filter((feed) => {
      if (!catalogBrowseActive && !feed.enabled) return false;
      if (!matchesFeedCatalogFilters(feed, selectedCatalogGroups, selectedTopics, labelOptions)) return false;
      if (!normalized) return true;
      return feed.name.toLocaleLowerCase('fa').includes(normalized)
        || feed.url.toLocaleLowerCase('fa').includes(normalized);
    });
    return groupFeedsBySourceTopic(matched, (feed) => normalizeFeedTopicKey(feed.topicLabel, labelOptions));
  }, [catalogBrowseActive, feeds, labelOptions, query, selectedCatalogGroups, selectedTopics]);

  const filteredPlatformMembers = useMemo(() => {
    const catalogFeeds = Array.isArray(platformFeedsData)
      ? platformFeedsData.filter((feed) => feed.platformEnabled !== false)
      : [];
    return catalogFeeds.filter((feed) => {
      if (!catalogBrowseActive && !feed.enabled) return false;
      if (!matchesFeedCatalogFilters(feed, selectedCatalogGroups, selectedTopics, labelOptions)) return false;
      return matchesFeedNameSearch(feed, query);
    });
  }, [catalogBrowseActive, labelOptions, platformFeedsData, query, selectedCatalogGroups, selectedTopics]);

  const filteredCustomMembers = useMemo(
    () => visibleCustomBuckets.flatMap((bucket) => bucket.members),
    [visibleCustomBuckets],
  );

  const bulkToggleTargetCount = filteredCustomMembers.length + (canManagePlatformFeeds ? filteredPlatformMembers.length : 0);

  const bulkEditEnabledCustomMembers = useMemo(
    () => filteredCustomMembers.filter((member) => member.enabled),
    [filteredCustomMembers],
  );
  const bulkEditEnabledPlatformMembers = useMemo(
    () => (canManagePlatformFeeds ? filteredPlatformMembers.filter((member) => member.enabled) : []),
    [canManagePlatformFeeds, filteredPlatformMembers],
  );
  const bulkEditEnabledCount = bulkEditEnabledCustomMembers.length + bulkEditEnabledPlatformMembers.length;

  const orgPollMinutes = orgAutomation.pollIntervalMinutes;
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState<FeedMonitoringSettingsValues>(() => ({
    settingsMode: 'custom',
    includeWords: '',
    excludeWords: '',
    pollIntervalMinutes: orgPollMinutes,
    autoPoll: orgAutomation.autoPoll,
    autoPrepare: orgAutomation.autoPrepare,
    autoPublish: orgAutomation.autoPublish,
    autoSendSocial: orgAutomation.autoSendSocial,
  }));

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

  async function bulkSetFilteredEnabled(enabled: boolean) {
    await run('bulk-filter-toggle', async () => {
      const newsFeedIds = filteredCustomMembers.filter((member) => member.enabled !== enabled).map((member) => member.id);
      const platformFeedIds = canManagePlatformFeeds
        ? filteredPlatformMembers.filter((member) => member.enabled !== enabled).map((member) => member.id)
        : [];
      if (!newsFeedIds.length && !platformFeedIds.length) {
        setNotice({ type: 'success', text: enabled ? 'همه منابع این فیلتر از قبل روشن بودند.' : 'همه منابع این فیلتر از قبل خاموش بودند.' });
        return;
      }
      const result = await apiFetch<{
        newsUpdated: number;
        platformUpdated: number;
        platformSkipped?: number;
      }>('/publishing/feeds/bulk-enabled', {
        method: 'POST',
        body: { enabled, newsFeedIds, platformFeedIds },
      });
      const updated = (result.newsUpdated ?? 0) + (result.platformUpdated ?? 0);
      const skipped = result.platformSkipped ?? 0;
      setNotice({
        type: 'success',
        text: enabled
          ? `روشن شد: ${formatPersianDigits(updated)} منبع${skipped ? ` (${formatPersianDigits(skipped)} منبع توسط پلتفرم غیرفعال شده بود)` : ''}. دریافت خبرها در پایش بعدی یا با «دریافت خبرهای جدید» انجام می‌شود.`
          : `خاموش شد: ${formatPersianDigits(updated)} منبع.`,
      });
      await refetch();
      setPlatformFeedsRevision((value) => value + 1);
    });
  }

  function openBulkGroupEdit() {
    setBulkEditForm({
      settingsMode: 'custom',
      includeWords: '',
      excludeWords: '',
      pollIntervalMinutes: orgPollMinutes,
      autoPoll: orgAutomation.autoPoll,
      autoPrepare: orgAutomation.autoPrepare,
      autoPublish: orgAutomation.autoPublish,
      autoSendSocial: orgAutomation.autoSendSocial,
    });
    setBulkEditOpen(true);
  }

  async function saveBulkGroupEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!bulkEditEnabledCount) return;

    const platformPatch = buildPlatformFeedSettingsPatch(bulkEditForm);
    const newsPatch = buildNewsFeedSettingsPatch(bulkEditForm);
    const validationError = platformPatch.error || newsPatch.error;
    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }

    const scopeLabel = filterBulkActive ? 'منابع فعال این فیلتر' : 'همه منابع فعال';
    const ok = await confirm({
      title: 'اعمال تنظیمات گروهی؟',
      description: `تنظیمات پایش و خودکارسازی روی ${formatPersianDigits(bulkEditEnabledCount)} ${scopeLabel} (کاتالوگ و اختصاصی) اعمال می‌شود.`,
      confirmLabel: 'اعمال روی همه',
    });
    if (!ok) return;

    await run('bulk-group-edit', async () => {
      const updates: Promise<unknown>[] = [];
      if (platformPatch.body) {
        for (const member of bulkEditEnabledPlatformMembers) {
          updates.push(apiFetch(`/publishing/platform-feeds/${member.id}`, {
            method: 'PATCH',
            body: platformPatch.body,
          }));
        }
      }
      if (newsPatch.body) {
        for (const member of bulkEditEnabledCustomMembers) {
          updates.push(apiFetch(`/publishing/news/feeds/${member.id}`, {
            method: 'PATCH',
            body: newsPatch.body,
          }));
        }
      }
      await Promise.all(updates);
      setBulkEditOpen(false);
      setNotice({ type: 'success', text: `تنظیمات روی ${formatPersianDigits(bulkEditEnabledCount)} منبع فعال اعمال شد.` });
      await refetch();
      setPlatformFeedsRevision((value) => value + 1);
    });
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

  return (
    <ProtectedLayout>
      <PageContainer className="space-y-8">
        <PageHeader
          title="منابع خبری"
          description="از منابع آمادهٔ داخلی و بین‌المللی انتخاب کنید یا منبع اختصاصی اضافه کنید. با فعال‌کردن منبع، خبرهای آن در میز خبر دریافت می‌شوند. فیدهای هم‌موضوع هر منبع با هم فعال یا غیرفعال می‌شوند."
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
          {bulkEditEnabledCount > 0 || (filterBulkActive && bulkToggleTargetCount > 0) ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {bulkEditEnabledCount > 0 ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={openBulkGroupEdit}>
                    <SlidersHorizontal className="h-4 w-4" />
                    ویرایش گروهی
                  </Button>
                  <span className="text-xs text-slate-500">
                    {formatPersianDigits(bulkEditEnabledCount)} منبع فعال
                    {filterBulkActive ? ' در این فیلتر' : ''}
                  </span>
                </>
              ) : null}
              {filterBulkActive && bulkToggleTargetCount > 0 ? (
                <>
                  {bulkEditEnabledCount > 0 ? <span className="hidden h-4 w-px bg-slate-200 sm:inline" aria-hidden /> : null}
                  <span className="text-xs text-slate-500">
                    {formatPersianDigits(bulkToggleTargetCount)} منبع در فیلتر (فعال و غیرفعال)
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={busy === 'bulk-filter-toggle'}
                    onClick={() => void bulkSetFilteredEnabled(true)}
                  >
                    <Power className="h-4 w-4 text-emerald-600" />
                    روشن کردن همه
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={busy === 'bulk-filter-toggle'}
                    onClick={() => void bulkSetFilteredEnabled(false)}
                  >
                    <Power className="h-4 w-4 text-slate-400" />
                    خاموش کردن همه
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-500">
            <Radio className="h-4 w-4 shrink-0" />
            <span>
              {catalogBrowseActive
                ? 'منابع مطابق با فیلتر شما، شامل منابع غیرفعال'
                : 'منابع فعال نمایش داده می‌شوند. برای دیدن سایر منابع، نوع رسانه یا موضوع را انتخاب کنید.'}
            </span>
          </div>
        </Card>

        {notice && (
          <div
            role="status"
            className={cn(
              'rounded-xl border px-4 py-3 text-sm',
              notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            {notice.text}
          </div>
        )}

        <PlatformFeedsSection
          selectedCatalogGroups={selectedCatalogGroups}
          selectedTopics={selectedTopics}
          labelOptions={labelOptions}
          searchQuery={query}
          includeDisabled={catalogBrowseActive}
          feedsRevision={platformFeedsRevision}
        />

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">فیدهای اختصاصی میز خبر</h2>
              <p className="mt-1 text-sm text-slate-500">فیلترهای نوع رسانه و موضوع، روی منابع اختصاصی میز خبر هم اعمال می‌شوند.</p>
            </div>
            <FeedBulkActions
              exportPath="/publishing/news/feeds/export"
              importPath="/publishing/news/feeds/import"
              onImported={() => { void refetch(); }}
            />
          </div>

        {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">بارگذاری منابع خبری انجام نشد: {loadError}</div>}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {query.trim()
                ? `${visibleCustomBuckets.length} موضوع اختصاصی در نتایج جست‌وجو`
                : `${visibleCustomBuckets.length} موضوع اختصاصی روشن`}
            </p>
          </div>

          {isLoading ? (
            <div className="grid min-h-56 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
          ) : visibleCustomBuckets.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Rss className="h-8 w-8" /></span><h2 className="mt-4 font-semibold text-slate-900">فیدی با این فیلتر نیست</h2><p className="mt-2 text-sm text-slate-500">با این فیلترها منبعی پیدا نشد. فیلترها را تغییر دهید یا منبع جدیدی اضافه کنید.</p><Button className="mt-5" onClick={() => openCreate()}><Plus className="h-4 w-4" /> افزودن منبع</Button></div>
          ) : (
            <FeedSourceCardGrid>
              {visibleCustomBuckets.map((bucket) => {
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
                  badge={<span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{FEED_CATALOG_GROUPS[resolveCatalogGroup(feed.sourceType, feed.catalogGroup, feed.sourceLanguage)].label}</span>}
                  footer={bucket.members.length > 1 ? (
                    <p className="text-[11px] font-medium text-slate-500">{formatPersianDigits(bucket.members.length)} فید این موضوع</p>
                  ) : feed.lastFetchedAt ? (
                    <p className="text-[10px] text-slate-400">آخرین پایش: {new Date(feed.lastFetchedAt).toLocaleString('fa-IR')}</p>
                  ) : null}
                  actions={
                    <>
                      <Button size="sm" variant="ghost" title="آزمایش منبع" aria-label="آزمایش منبع" isLoading={busy === `test-${feed.id}`} onClick={() => void testSource(feed)}>
                        <HeartPulse className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button size="sm" variant="ghost" title="پایش الآن" aria-label="پایش الآن" isLoading={busy === `fetch-${bucket.key}`} onClick={() => run(`fetch-${bucket.key}`, async () => {
                        for (const member of bucket.members) {
                          await apiFetch(`/publishing/news/feeds/${member.id}/fetch`, { method: 'POST' });
                        }
                        setNotice({ type: 'success', text: `پایش «${feed.name}» انجام شد.` });
                        await refetch();
                      })}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="ویرایش" aria-label="ویرایش" onClick={() => openEdit(feed)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title={toggleTitle} aria-label={toggleTitle} isLoading={busy === `toggle-${bucket.key}`} onClick={() => run(`toggle-${bucket.key}`, async () => {
                        for (const member of bucket.members) {
                          if (member.enabled === nextEnabled) continue;
                          await apiFetch(`/publishing/news/feeds/${member.id}/toggle`, { method: 'POST' });
                        }
                        await refetch();
                      })}>
                        <Power className={feedTogglePowerClass(bucket.enabled)} />
                      </Button>
                      <Button size="sm" variant="ghost" title="حذف" aria-label="حذف" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={async () => {
                        const topic = bucket.topicLabel || 'بدون موضوع';
                        const ok = await confirm({
                          title: 'حذف فیدهای این موضوع؟',
                          description: bucket.members.length > 1
                            ? `${formatPersianDigits(bucket.members.length)} فید موضوع «${topic}» از «${feed.name}» حذف می‌شود.`
                            : `فید «${feed.name}» حذف می‌شود.`,
                          confirmLabel: 'حذف',
                          variant: 'danger',
                        });
                        if (!ok) return;
                        run(`delete-${bucket.key}`, async () => {
                          for (const member of bucket.members) {
                            await apiFetch(`/publishing/news/feeds/${member.id}`, { method: 'DELETE' });
                          }
                          setNotice({ type: 'success', text: 'فیدهای این موضوع حذف شد.' });
                          await refetch();
                        });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
                );
              })}
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
                    <span className="block text-sm font-semibold text-slate-900">استفاده از پیش‌فرض پایش و خودکارسازی میز خبر</span>
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">با تغییر تنظیمات در «تنظیمات انتشار → پایش خبر»، همین منبع هم به‌روز می‌شود.</span>
                  </span>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">فاصله پایش (دقیقه)<input type="number" min="5" max="1440" required dir="ltr" disabled={form.useOrganizationDefaults} className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-100 disabled:text-slate-500" value={form.pollIntervalMinutes} onChange={(event) => setForm((current) => ({ ...current, pollIntervalMinutes: event.target.value, useOrganizationDefaults: false }))} /><span className="text-xs font-normal text-slate-500">بین ۵ دقیقه تا ۲۴ ساعت</span></label>
                <fieldset><legend className="mb-3 text-sm font-medium text-slate-700">خودکارسازی این منبع</legend><div className="grid gap-3 sm:grid-cols-2">{[
                  ['autoPoll', 'پایش خودکار', 'منبع طبق فاصله زمانی بالا به‌صورت خودکار بررسی شود.'],
                  ['autoPrepare', 'آماده‌سازی خودکار', 'مطالب جدید بدون دخالت کاربر آماده شوند.'],
                  ['autoPublish', 'انتشار خودکار', 'خبر آماده در سایت منتشر شود.'],
                  ['autoSendSocial', 'ارسال خودکار به استودیوی اجتماعی', 'خبر بررسی و انتشار در شبکه‌های اجتماعی ارسال شود.'],
                ].map(([key, label, description]) => { const field = key as keyof Pick<FeedForm, 'autoPoll' | 'autoPrepare' | 'autoPublish' | 'autoSendSocial'>; return <label key={key} className={cn('flex items-start gap-3 rounded-2xl border border-slate-200 p-4', form.useOrganizationDefaults ? 'bg-slate-50 opacity-90' : 'cursor-pointer hover:border-primary-300')}><input type="checkbox" disabled={form.useOrganizationDefaults} checked={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.checked, useOrganizationDefaults: false }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600" /><span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{description}</span></span></label>; })}</div><p className="mt-3 text-xs leading-5 text-slate-500">اگر «پیش‌فرض میز خبر» فعال باشد، مقادیر از تنظیمات انتشار خوانده می‌شوند. برای تنظیم اختصاصی، تیک پیش‌فرض را بردارید یا یکی از گزینه‌ها را تغییر دهید.</p></fieldset>
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

        <Modal open={bulkEditOpen} onClose={() => setBulkEditOpen(false)} size="md" closeOnBackdrop={busy !== 'bulk-group-edit'}>
          <form onSubmit={(event) => void saveBulkGroupEdit(event)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ModalHeader
              title="ویرایش گروهی پایش و خودکارسازی"
              description={
                filterBulkActive
                  ? `تنظیمات زیر روی ${formatPersianDigits(bulkEditEnabledCount)} منبع فعال در فیلتر فعلی (کاتالوگ${canManagePlatformFeeds ? '' : ' — فقط اختصاصی'} و اختصاصی) اعمال می‌شود.`
                  : `تنظیمات زیر روی ${formatPersianDigits(bulkEditEnabledCount)} منبع فعال فعلی اعمال می‌شود.`
              }
              onClose={() => setBulkEditOpen(false)}
            />
            <ModalBody className="max-h-[min(70vh,640px)] overflow-y-auto p-6">
              <FeedMonitoringSettingsForm
                values={bulkEditForm}
                orgPollMinutes={orgPollMinutes}
                settingsModeName="bulkSettingsMode"
                onChange={(patch) => setBulkEditForm((current) => ({ ...current, ...patch }))}
              />
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBulkEditOpen(false)}>انصراف</Button>
              <Button type="submit" isLoading={busy === 'bulk-group-edit'}>اعمال روی همه</Button>
            </ModalFooter>
          </form>
        </Modal>
      </PageContainer>
    </ProtectedLayout>
  );
}
