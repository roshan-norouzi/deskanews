'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeartPulse, Plus } from 'lucide-react';
import { formatPersianDigits, resolveFeedLogoUrl } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { PlatformFeedCatalogTable } from '@/components/publishing/platform-feed-catalog-table';
import { FeedSourceLogoWithFallback } from '@/components/publishing/feed-source-logo';
import { FeedBulkActions } from '@/components/publishing/feed-bulk-actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { apiFetch, cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { mergeSourceLanguageCatalog, sourceLanguageLabel, type SourceLanguage } from '@deska/shared';
import {
  FEED_CATALOG_GROUPS,
  FEED_CATALOG_GROUP_ORDER,
  FEED_CATALOG_GROUP_UI,
  FEED_SOURCE_UI,
  defaultSourceTypeForCatalogGroup,
  emptyFeedsByCatalogGroup,
  feedSourceTypeHint,
  resolveCatalogGroup,
  sortFeedsByName,
  type FeedCatalogGroup,
  type FeedSourceType,
} from '@/lib/feed-source-types';

interface PlatformFeed {
  id: string;
  name: string;
  url: string;
  sourceType: FeedSourceType;
  catalogGroup?: FeedCatalogGroup;
  resolvedFeedUrl: string;
  sourceLanguage?: SourceLanguage;
  logoUrl?: string;
  logoUrlOverride?: string;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string;
  healthStatus?: 'healthy' | 'degraded' | 'down' | 'unknown';
  healthCheckedAt?: string | null;
  healthItemCount?: number;
  healthError?: string;
  healthFailSince?: string | null;
}

interface FeedForm {
  name: string;
  url: string;
  sourceType: FeedSourceType;
  sourceLanguage: SourceLanguage;
  logoUrlOverride: string;
  enabled: boolean;
}

const EMPTY_FORM: FeedForm = {
  name: '',
  url: '',
  sourceType: 'rss',
  sourceLanguage: 'auto',
  logoUrlOverride: '',
  enabled: true,
};

interface HealthItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
  featuredImageUrl: string;
}

interface HealthResult {
  source: { name: string; url: string; sourceType: FeedSourceType; resolvedFeedUrl?: string };
  items: HealthItem[];
}

function validateForm(form: FeedForm) {
  if (form.name.trim().length < 2) return 'نام منبع باید حداقل ۲ نویسه باشد.';
  try {
    const url = new URL(form.url.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    return 'آدرس منبع باید کامل و معتبر باشد.';
  }
  return '';
}

export default function PlatformFeedsPage() {
  const { isSuperAdmin } = useAuth();
  const [feeds, setFeeds] = useState<PlatformFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [editing, setEditing] = useState<PlatformFeed | null>(null);
  const [form, setForm] = useState<FeedForm>(EMPTY_FORM);
  const [learnedLanguages, setLearnedLanguages] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState<FeedCatalogGroup>('media-domestic');
  const editingIdRef = useRef<string | null>(null);

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

  const languageOptions = useMemo(
    () => mergeSourceLanguageCatalog([...learnedLanguages, ...feeds.map((feed) => feed.sourceLanguage), form.sourceLanguage]),
    [feeds, form.sourceLanguage, learnedLanguages],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, languages] = await Promise.all([
        apiFetch<PlatformFeed[]>('/platform/feeds', { skipTenant: true }),
        apiFetch<Array<{ code: string }>>('/platform/source-languages', { skipTenant: true }).catch(() => []),
      ]);
      setFeeds(Array.isArray(result) ? result : []);
      setLearnedLanguages(Array.isArray(languages) ? languages.map((item) => item.code) : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'دریافت منابع پیش‌فرض انجام نشد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    editingIdRef.current = null;
    setForm(EMPTY_FORM);
  }

  function openCreate(group: FeedCatalogGroup = activeGroup) {
    setEditing(null);
    editingIdRef.current = null;
    setForm({
      ...EMPTY_FORM,
      sourceType: defaultSourceTypeForCatalogGroup(group),
    });
    setActiveGroup(group);
    setModalOpen(true);
  }

  function openEdit(feed: PlatformFeed) {
    setEditing(feed);
    editingIdRef.current = feed.id;
    setForm({
      name: feed.name,
      url: feed.url,
      sourceType: feed.sourceType,
      sourceLanguage: feed.sourceLanguage || 'auto',
      logoUrlOverride: feed.logoUrlOverride || '',
      enabled: feed.enabled,
    });
    setModalOpen(true);
  }

  async function probeSource() {
    const validationError = validateForm(form);
    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }
    setBusy('probe');
    setNotice(null);
    try {
      const result = await apiFetch<HealthResult>('/platform/feeds/probe', {
        method: 'POST',
        skipTenant: true,
        body: {
          name: form.name.trim(),
          url: form.url.trim(),
          sourceType: form.sourceType,
        },
      });
      setHealth(result);
      setHealthOpen(true);
    } catch (reason) {
      setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'تست منبع انجام نشد' });
    } finally {
      setBusy('');
    }
  }

  async function testSource(feed: PlatformFeed) {
    setBusy(`test-${feed.id}`);
    setNotice(null);
    try {
      const result = await apiFetch<HealthResult & { healthStatus?: PlatformFeed['healthStatus']; healthError?: string }>(
        `/platform/feeds/${feed.id}/test`,
        { method: 'POST', skipTenant: true },
      );
      setHealth(result);
      setHealthOpen(true);
      await load();
    } catch (reason) {
      setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'تست منبع انجام نشد' });
    } finally {
      setBusy('');
    }
  }

  async function saveFeed(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }
    const feedId = editingIdRef.current;
    setBusy('save');
    setNotice(null);
    try {
      const body = {
        name: form.name.trim(),
        url: form.url.trim(),
        sourceType: form.sourceType,
        catalogGroup: resolveCatalogGroup(form.sourceType, activeGroup, form.sourceLanguage),
        sourceLanguage: form.sourceLanguage,
        logoUrl: form.logoUrlOverride.trim(),
        enabled: form.enabled,
      };
      await apiFetch(feedId ? `/platform/feeds/${feedId}` : '/platform/feeds', {
        method: feedId ? 'PATCH' : 'POST',
        skipTenant: true,
        body,
      });
      closeModal();
      setNotice({ type: 'success', text: feedId ? 'منبع پیش‌فرض ویرایش شد.' : 'منبع پیش‌فرض اضافه شد.' });
      await load();
    } catch (reason) {
      setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'ذخیره انجام نشد' });
    } finally {
      setBusy('');
    }
  }

  if (!isSuperAdmin) {
    return (
      <ProtectedLayout title="منابع پیش‌فرض پلتفرم">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">فقط مدیر کل به این بخش دسترسی دارد.</div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title="منابع پیش‌فرض پلتفرم">
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6" dir="rtl">
        <PageHeader
          title="منابع پیش‌فرض پلتفرم"
          description="فقط نام، آدرس، نوع و زبان منابع رسمی را اینجا ثبت کنید. فیلتر کلمات و فاصله پایش را هر سازمان برای خودش تنظیم می‌کند."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <FeedBulkActions
                exportPath="/platform/feeds/export"
                importPath="/platform/feeds/import"
                skipTenant
                onImported={load}
              />
              <Button onClick={() => openCreate(activeGroup)}>
                <Plus className="h-4 w-4" /> افزودن به {FEED_CATALOG_GROUPS[activeGroup].label}
              </Button>
            </div>
          }
        />

        {notice && (
          <div
            role="status"
            className={cn(
              'rounded-xl border px-4 py-3 text-sm',
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            {notice.text}
          </div>
        )}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {FEED_CATALOG_GROUP_ORDER.map((group) => {
            const meta = FEED_CATALOG_GROUPS[group];
            const Icon = FEED_CATALOG_GROUP_UI[group].icon;
            const count = feedsByGroup[group].length;
            return (
              <button
                key={group}
                type="button"
                onClick={() => setActiveGroup(group)}
                className={cn(
                  'flex flex-1 min-w-[9rem] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition',
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
                )}>
                  {formatPersianDigits(count)}
                </span>
              </button>
            );
          })}
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-900">{FEED_CATALOG_GROUPS[activeGroup].label}</h2>
            <p className="mt-1 text-sm text-slate-500">{FEED_CATALOG_GROUPS[activeGroup].description}</p>
          </div>
          {loading ? (
            <div className="grid min-h-56 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
          ) : (
            <PlatformFeedCatalogTable
              feeds={feedsByGroup[activeGroup]}
              busy={busy}
              onTest={(feed) => void testSource(feed as PlatformFeed)}
              onFetch={(feed) => {
                void (async () => {
                  setBusy(`fetch-${feed.id}`);
                  try {
                    await apiFetch(`/platform/feeds/${feed.id}/fetch`, { method: 'POST', skipTenant: true });
                    setNotice({ type: 'success', text: 'پایش انجام شد.' });
                    await load();
                  } catch (reason) {
                    setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'پایش انجام نشد' });
                  } finally {
                    setBusy('');
                  }
                })();
              }}
              onEdit={(feed) => {
                setActiveGroup(resolveCatalogGroup((feed as PlatformFeed).sourceType, (feed as PlatformFeed).catalogGroup, (feed as PlatformFeed).sourceLanguage));
                openEdit(feed as PlatformFeed);
              }}
              onDelete={(feed) => {
                if (!window.confirm(`منبع «${feed.name}» حذف شود؟`)) return;
                void (async () => {
                  setBusy(`delete-${feed.id}`);
                  try {
                    await apiFetch(`/platform/feeds/${feed.id}`, { method: 'DELETE', skipTenant: true });
                    await load();
                  } catch (reason) {
                    setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'حذف انجام نشد' });
                  } finally {
                    setBusy('');
                  }
                })();
              }}
              emptyMessage={`هنوز ${FEED_CATALOG_GROUPS[activeGroup].label.toLowerCase()} در کاتالوگ ثبت نشده است.`}
            />
          )}
        </Card>

        <Modal open={modalOpen} onClose={closeModal} size="lg" closeOnBackdrop={!busy}>
          <form onSubmit={saveFeed} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ModalHeader
              title={editing ? 'ویرایش منبع پیش‌فرض' : 'افزودن منبع پیش‌فرض'}
              onClose={closeModal}
            />
            <ModalBody className="space-y-4 p-6">
                <Input label="نام" required value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">نوع منبع</legend>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(FEED_CATALOG_GROUPS[activeGroup].sourceTypes as FeedSourceType[]).map((key) => {
                      const item = FEED_SOURCE_UI[key];
                      return (
                      <label key={key} className={cn('cursor-pointer rounded-2xl border p-4', form.sourceType === key ? 'border-primary-500 bg-primary-50' : 'border-slate-200')}>
                        <input type="radio" className="sr-only" checked={form.sourceType === key} onChange={() => setForm((c) => ({ ...c, sourceType: key }))} />
                        <item.icon className="h-5 w-5" />
                        <span className="mt-2 block text-sm font-semibold">{item.shortLabel}</span>
                        <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
                      </label>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">{feedSourceTypeHint(form.sourceType)}</p>
                </fieldset>
                <Input label={FEED_SOURCE_UI[form.sourceType].label} required dir="ltr" placeholder={FEED_SOURCE_UI[form.sourceType].placeholder} value={form.url} onChange={(e) => setForm((c) => ({ ...c, url: e.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-[auto,1fr] sm:items-end">
                  <FeedSourceLogoWithFallback
                    name={form.name || 'منبع'}
                    logoUrl={resolveFeedLogoUrl(form.url, form.logoUrlOverride, form.sourceType)}
                    sourceType={form.sourceType}
                    size="lg"
                  />
                  <Input
                    label="آدرس لوگو (اختیاری)"
                    dir="ltr"
                    placeholder="خالی = استخراج خودکار از آدرس منبع"
                    value={form.logoUrlOverride}
                    onChange={(e) => setForm((c) => ({ ...c, logoUrlOverride: e.target.value }))}
                  />
                </div>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">زبان منبع<select value={form.sourceLanguage} onChange={(e) => setForm((c) => ({ ...c, sourceLanguage: e.target.value as SourceLanguage }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20">{languageOptions.map((language) => <option key={language} value={language}>{sourceLanguageLabel(language)}</option>)}</select></label>
                <p className="text-xs leading-5 text-slate-500">فیلتر کلمات و فاصله پایش را هر سازمان در بخش «منابع پیش‌فرض» تنظیم می‌کند.</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((c) => ({ ...c, enabled: e.target.checked }))} /> فعال در سطح پلتفرم</label>
            </ModalBody>
            <ModalFooter className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" isLoading={busy === 'probe'} onClick={() => void probeSource()}><HeartPulse className="h-4 w-4" /> آزمایش منبع</Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeModal}>انصراف</Button>
                <Button type="submit" isLoading={busy === 'save'}>ذخیره</Button>
              </div>
            </ModalFooter>
          </form>
        </Modal>

        <Modal open={healthOpen && !!health} onClose={() => setHealthOpen(false)} size="xl" zIndex={80}>
          {health && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" dir="rtl">
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
              <ModalBody className="space-y-3 p-6">
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
                  <div className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-800">منبع پاسخ داد اما مطلبی برای نمایش پیدا نشد.</div>
                )}
              </ModalBody>
              <ModalFooter className="flex justify-end">
                <Button type="button" onClick={() => setHealthOpen(false)}>بستن</Button>
              </ModalFooter>
            </div>
          )}
        </Modal>
      </main>
    </ProtectedLayout>
  );
}
