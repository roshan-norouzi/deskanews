'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Plus, RefreshCw, Share2, Trash2, Pencil, Power } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-provider';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, cn } from '@/lib/utils';
import { feedTogglePowerClass } from '@/components/publishing/feed-source-card';
import type { SourceLanguage } from '@deska/shared';
import { FEED_SOURCE_UI, feedSourceMeta, feedSourceTypeHint, type FeedSourceType } from '@/lib/feed-source-types';

interface Feed {
  id: string;
  name: string;
  url: string;
  sourceType?: FeedSourceType;
  sourceLanguage?: SourceLanguage;
  pollIntervalMinutes?: number | null;
  autoPoll?: boolean | null;
  autoPrepare?: boolean | null;
  autoPublish?: boolean | null;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string;
}

interface FeedForm {
  name: string;
  url: string;
  sourceType: FeedSourceType;
  sourceLanguage: SourceLanguage;
  pollIntervalMinutes: string;
  autoPoll: boolean;
  autoPrepare: boolean;
  autoPublish: boolean;
}

const EMPTY_FORM: FeedForm = {
  name: '',
  url: '',
  sourceType: 'telegram',
  sourceLanguage: 'auto',
  pollIntervalMinutes: '240',
  autoPoll: true,
  autoPrepare: true,
  autoPublish: false,
};

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

export default function SocialFeedsPage() {
  const confirm = useConfirm();
  const { data, error: loadError, isLoading, refetch } = useApi<Feed[]>('/publishing/social/feeds');
  const feeds = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Feed | null>(null);
  const [form, setForm] = useState<FeedForm>(EMPTY_FORM);
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

  async function saveFeed(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }
    await run('save', async () => {
      await apiFetch(editing ? `/publishing/social/feeds/${editing.id}` : '/publishing/social/feeds', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          ...form,
          purpose: 'social-studio',
          name: form.name.trim(),
          url: form.url.trim(),
          pollIntervalMinutes: Number(form.pollIntervalMinutes),
        },
      });
      setModalOpen(false);
      setNotice({ type: 'success', text: editing ? 'منبع ذخیره شد.' : 'منبع اضافه شد.' });
      await refetch();
    });
  }

  return (
    <ProtectedLayout>
      <PageContainer>
        <div className="space-y-4">
          <Link href="/publishing/social" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-primary-600">
            <ArrowRight className="h-4 w-4" /> بازگشت به استودیو
          </Link>
          <PageHeader
            title="منابع استودیوی اجتماعی"
            description="این منابع، مطالب را مستقیم وارد استودیو می‌کنند. علاوه بر آن‌ها، خبرهای میز خبر هم قابل ارسال به استودیو هستند. تنظیمات این منابع جدا از منابع میز خبر است."
            icon={Share2}
            actions={
              <Button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); }}>
                <Plus className="h-4 w-4" /> افزودن منبع
              </Button>
            }
          />
        </div>

        {notice && <div className={cn('rounded-xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}
        {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="grid min-h-48 place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
          ) : feeds.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">هنوز منبعی برای استودیوی اجتماعی ثبت نشده است.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ds-table">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">منبع</th>
                    <th className="px-5 py-3 font-medium">نوع</th>
                    <th className="px-5 py-3 font-medium">پایش</th>
                    <th className="px-5 py-3 font-medium">وضعیت</th>
                    <th className="px-5 py-3 font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeds.map((feed) => {
                    const meta = feedSourceMeta(feed.sourceType);
                    const Icon = meta.icon;
                    return (
                      <tr key={feed.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">{feed.name}</div>
                          <div className="mt-1 truncate text-xs text-slate-500" dir="ltr">{feed.url}</div>
                        </td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5"><Icon className="h-4 w-4" />{meta.shortLabel}</span></td>
                        <td className="px-5 py-4 text-slate-600">هر {feed.pollIntervalMinutes ?? 240} دقیقه</td>
                        <td className="px-5 py-4"><Badge variant={feed.enabled ? 'success' : 'default'}>{feed.enabled ? 'فعال' : 'غیرفعال'}</Badge></td>
                        <td className="px-5 py-4">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" title="دریافت مطالب" aria-label="دریافت مطالب" isLoading={busy === `fetch-${feed.id}`} onClick={() => run(`fetch-${feed.id}`, async () => { await apiFetch(`/publishing/social/feeds/${feed.id}/fetch`, { method: 'POST' }); await refetch(); })}><RefreshCw className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" title="ویرایش منبع" aria-label="ویرایش منبع" onClick={() => { setEditing(feed); setForm({ name: feed.name, url: feed.url, sourceType: feed.sourceType || 'telegram', sourceLanguage: feed.sourceLanguage || 'auto', pollIntervalMinutes: String(feed.pollIntervalMinutes ?? 240), autoPoll: feed.autoPoll ?? true, autoPrepare: feed.autoPrepare ?? true, autoPublish: feed.autoPublish ?? false }); setModalOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" title={feed.enabled ? 'غیرفعال کردن' : 'فعال کردن'} aria-label={feed.enabled ? 'غیرفعال کردن منبع' : 'فعال کردن منبع'} onClick={() => run(`toggle-${feed.id}`, async () => { await apiFetch(`/publishing/social/feeds/${feed.id}/toggle`, { method: 'POST' }); await refetch(); })}><Power className={feedTogglePowerClass(feed.enabled)} /></Button>
                            <Button size="sm" variant="ghost" className="text-red-600" title="حذف منبع" aria-label="حذف منبع" onClick={async () => { const ok = await confirm({ title: 'حذف منبع؟', description: `منبع «${feed.name}» برای همیشه حذف می‌شود.`, confirmLabel: 'حذف منبع', variant: 'danger' }); if (!ok) return; run(`delete-${feed.id}`, async () => { await apiFetch(`/publishing/social/feeds/${feed.id}`, { method: 'DELETE' }); await refetch(); }); }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg">
          <form onSubmit={saveFeed} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ModalHeader title={editing ? 'ویرایش منبع اجتماعی' : 'افزودن منبع اجتماعی'} onClose={() => setModalOpen(false)} />
            <ModalBody className="space-y-4 p-6">
              <Input label="نام" required value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
              <fieldset>
                <legend className="mb-2 text-sm font-medium">نوع منبع</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(['telegram', 'twitter', 'rss'] as FeedSourceType[]).map((key) => {
                    const item = FEED_SOURCE_UI[key];
                    return (
                      <label key={key} className={cn('cursor-pointer rounded-xl border p-3', form.sourceType === key ? 'border-primary-500 bg-primary-50' : 'border-slate-200')}>
                        <input type="radio" className="sr-only" checked={form.sourceType === key} onChange={() => setForm((c) => ({ ...c, sourceType: key }))} />
                        <item.icon className="h-4 w-4" />
                        <span className="mt-1 block text-sm font-semibold">{item.shortLabel}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">{feedSourceTypeHint(form.sourceType)}</p>
              </fieldset>
              <Input label={FEED_SOURCE_UI[form.sourceType].label} required dir="ltr" placeholder={FEED_SOURCE_UI[form.sourceType].placeholder} value={form.url} onChange={(e) => setForm((c) => ({ ...c, url: e.target.value }))} />
              <Input label="فاصله پایش (دقیقه)" dir="ltr" value={form.pollIntervalMinutes} onChange={(e) => setForm((c) => ({ ...c, pollIntervalMinutes: e.target.value }))} />
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button>
              <Button type="submit" isLoading={busy === 'save'}>ذخیره</Button>
            </ModalFooter>
          </form>
        </Modal>
      </PageContainer>
    </ProtectedLayout>
  );
}
