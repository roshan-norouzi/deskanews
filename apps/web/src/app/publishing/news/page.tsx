'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Newspaper, RefreshCw, Rss, Search, Settings2, Trash2 } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import {
  NewsArticleCard,
  type NewsArticleCardData,
} from '@/components/publishing/news-article-card';
import { NewsPublishModal, type NewsPublishDraft } from '@/components/publishing/news-publish-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useApi } from '@/hooks/use-api';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import {
  NEWSROOM_FILTERS,
  newsroomFilterMeta,
  type NewsroomFilter,
} from '@/lib/newsroom-filters';
import { ApiError, apiFetch, cn } from '@/lib/utils';

interface Feed { id: string; name: string; purpose: string; enabled: boolean }
interface DestinationCategoryOption { id: string; name: string; isGeneral: boolean; status: string }

export default function NewsPage() {
  const feedsApi = useApi<Feed[]>('/publishing/feeds');
  const categoriesApi = useApi<DestinationCategoryOption[]>('/publishing/destination/categories?status=approved');
  const [categoryId, setCategoryId] = useState('');
  const [generalOnly, setGeneralOnly] = useState(false);
  const [cursor, setCursor] = useState('');
  const articlesPath = useMemo(() => {
    const params = new URLSearchParams();
    if (categoryId) params.set('categoryId', categoryId);
    if (generalOnly) params.set('generalOnly', 'true');
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return `/publishing/news/articles${query ? `?${query}` : ''}`;
  }, [categoryId, generalOnly, cursor]);
  const articlesApi = useApi<{ items: NewsArticleCardData[]; nextCursor: string | null }>(articlesPath);
  const { data: feedData } = feedsApi;
  const { data: articleData, execute: executeArticles } = articlesApi;
  const [status, setStatus] = useState<NewsroomFilter>('action');
  const [feedId, setFeedId] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [publishModal, setPublishModal] = useState<{
    articleId: string;
    articleTitle: string;
    sourceName: string;
    draft: NewsPublishDraft;
  } | null>(null);
  const [translatePendingIds, setTranslatePendingIds] = useState<Record<string, true>>({});

  useVisibleInterval(() => { void executeArticles(); }, 30_000);

  const feeds = useMemo(
    () => (Array.isArray(feedData) ? feedData.filter((feed) => feed.purpose === 'news-room') : []),
    [feedData],
  );
  const approvedCategories = useMemo(
    () => (Array.isArray(categoriesApi.data) ? categoriesApi.data : []),
    [categoriesApi.data],
  );
  const articles = useMemo(() => (Array.isArray(articleData?.items) ? articleData.items : []), [articleData]);

  const activeFilter = newsroomFilterMeta(status);

  const rows = useMemo(() => articles.filter((article) => {
    const statusMatches = activeFilter.matches(article);
    const feedMatches = !feedId || article.feedId === feedId;
    const normalized = query.trim().toLocaleLowerCase('fa');
    const queryMatches = !normalized
      || `${article.titleFa} ${article.originalTitle} ${article.sourceName}`.toLocaleLowerCase('fa').includes(normalized);
    return statusMatches && feedMatches && queryMatches;
  }), [activeFilter, articles, feedId, query]);

  const statCards = useMemo(
    () => NEWSROOM_FILTERS.filter((filter) => filter.key !== 'all').map((filter) => ({
      ...filter,
      count: articles.filter(filter.matches).length,
    })),
    [articles],
  );

  const run = useCallback(async (key: string, operation: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setNotice(null);
    try {
      const result = await operation();
      const queued = Boolean(result && typeof result === 'object' && 'queued' in result && (result as { queued?: boolean }).queued);
      setNotice({
        type: 'success',
        text: queued ? 'کار به worker سپرده شد و پس از انجام در فهرست دیده می‌شود.' : success,
      });
      await articlesApi.refetch();
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'عملیات انجام نشد؛ دوباره تلاش کنید.',
      });
    } finally {
      setBusy(null);
    }
  }, [articlesApi]);

  const syncNews = () => run(
    'sync',
    () => apiFetch('/publishing/news/sync', { method: 'POST' }),
    'فیدهای اتاق خبر پایش شدند؛ خبرهای جدید بر اساس تنظیمات اتوماسیون پردازش می‌شوند.',
  );

  const summarize = (id: string) => run(
    `summarize-${id}`,
    () => apiFetch(`/publishing/news/articles/${id}/summarize`, { method: 'POST' }),
    'تیتر و خلاصهٔ خبر متناسب با زبان آن آماده شد.',
  );

  const openPublishModal = useCallback((article: NewsArticleCardData) => {
    if (!article.contentFa?.trim()) return;
    setPublishModal({
      articleId: article.id,
      articleTitle: article.titleFa || article.originalTitle,
      sourceName: article.sourceName,
      draft: {
        titleFa: article.titleFa,
        summaryFa: article.summaryFa,
        contentFa: article.contentFa,
      },
    });
  }, []);

  const translateFull = useCallback(async (id: string, forceRetranslate = false) => {
    const article = articles.find((item) => item.id === id);
    if (!article) return;

    if (!forceRetranslate && article.contentFa?.trim()) {
      openPublishModal(article);
      return;
    }

    if (forceRetranslate) {
      setPublishModal(null);
    }

    setTranslatePendingIds((current) => ({ ...current, [id]: true }));
    setBusy(`translate-${id}`);
    setNotice(null);
    try {
      const translated = await apiFetch<{ queued?: boolean }>(`/publishing/news/articles/${id}/translate-full`, { method: 'POST' });
      setNotice({
        type: 'success',
        text: translated?.queued
          ? 'ترجمه کامل به worker سپرده شد. چند لحظه بعد فهرست را تازه کنید.'
          : 'متن کامل آماده انتشار شد؛ «آماده برای انتشار» را بزنید.',
      });
      await articlesApi.refetch();
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'آماده‌سازی برای انتشار انجام نشد؛ دوباره تلاش کنید.',
      });
    } finally {
      setTranslatePendingIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setBusy(null);
    }
  }, [articles, articlesApi, openPublishModal]);

  const publishFromModal = useCallback(async (draft: NewsPublishDraft) => {
    if (!publishModal) return;
    const id = publishModal.articleId;
    setBusy(`publish-${id}`);
    setNotice(null);
    try {
      const published = await apiFetch<{ queued?: boolean }>(`/publishing/news/articles/${id}/publish`, {
        method: 'POST',
        body: draft,
      });
      setPublishModal(null);
      setNotice({
        type: 'success',
        text: published?.queued
          ? 'انتشار به worker سپرده شد و پس از انجام در فهرست دیده می‌شود.'
          : 'خبر با موفقیت به سایت مقصد ارسال شد.',
      });
      await articlesApi.refetch();
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'انتشار انجام نشد؛ دوباره تلاش کنید.',
      });
    } finally {
      setBusy(null);
    }
  }, [articlesApi, publishModal]);

  const sendToSocial = (id: string) => run(
    `social-${id}`,
    () => apiFetch(`/publishing/news/articles/${id}/send-to-social`, { method: 'POST' }),
    'خبر با تیتر و خلاصه کوتاه در استودیوی اجتماعی آماده شد.',
  );

  const assignCategory = useCallback(async (articleId: string, destinationCategoryId: string | null) => {
    setBusy(`category-${articleId}`);
    setNotice(null);
    try {
      await apiFetch(`/publishing/news/articles/${articleId}`, {
        method: 'PATCH',
        body: { destinationCategoryId },
      });
      setNotice({ type: 'success', text: 'دسته‌بندی خبر به‌روزرسانی شد.' });
      await articlesApi.refetch();
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'تغییر دسته‌بندی انجام نشد.',
      });
    } finally {
      setBusy(null);
    }
  }, [articlesApi]);

  const reject = (id: string) => {
    if (!window.confirm('این خبر رد شود؟ خبر پس از ۳ روز برای همیشه حذف خواهد شد.')) return;
    void run(
      `reject-${id}`,
      () => apiFetch(`/publishing/news/articles/${id}/reject`, { method: 'POST' }),
      'خبر به بخش ردشده‌ها منتقل شد.',
    );
  };

  const listTitle = activeFilter.label;

  return (
    <ProtectedLayout title="اتاق خبر">
      <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6" dir="rtl">
        <PageHeader
          title="اتاق خبر"
          description="مدیریت خبرها و فرایند انتشار."
          icon={Newspaper}
          actions={(
            <>
              <Link
                href="/publishing/feeds"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/15"
              >
                <Rss className="h-4 w-4" />
                فیدها
              </Link>
              <Link
                href="/publishing/settings"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/15"
              >
                <Settings2 className="h-4 w-4" />
                تنظیمات
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="border border-red-300/40 text-red-100 hover:bg-red-500/20"
                isLoading={busy === 'delete-all'}
                onClick={() => {
                  if (window.confirm('همه خبرهای اتاق خبر برای همیشه حذف شوند؟ فیدها و تنظیمات باقی می‌مانند و در پایش بعدی خبرها دوباره دریافت می‌شوند.')) {
                    void run('delete-all', () => apiFetch('/publishing/news/articles', { method: 'DELETE' }), 'همه خبرهای اتاق خبر حذف شدند؛ در پایش بعدی دوباره دریافت می‌شوند.');
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                حذف همه
              </Button>
              <Button
                size="sm"
                className="bg-white text-slate-900 hover:bg-slate-100"
                isLoading={busy === 'sync'}
                onClick={syncNews}
              >
                <RefreshCw className="h-4 w-4" />
                دریافت خبرهای جدید
              </Button>
            </>
          )}
        />

        {notice && (
          <div
            role="status"
            className={cn(
              'rounded-2xl border px-4 py-3 text-sm',
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            {notice.text}
          </div>
        )}
        {articlesApi.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            دریافت خبرها انجام نشد: {articlesApi.error}
          </div>
        )}

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <button
              type="button"
              key={card.key}
              onClick={() => setStatus(card.key)}
              className={cn(
                'rounded-2xl border bg-white px-4 py-3 text-right shadow-sm transition hover:shadow-md',
                status === card.key ? 'border-primary-400 ring-2 ring-primary-100' : 'border-slate-200',
              )}
            >
              <div className={cn('text-xl font-bold', card.tone)}>{formatPersianDigits(card.count)}</div>
              <div className="mt-0.5 text-xs font-medium text-slate-700">{card.label}</div>
              <div className="mt-1 text-[11px] leading-5 text-slate-400">{card.description}</div>
            </button>
          ))}
        </section>

        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              نمایش
              <select className="rounded-xl border px-3 py-2.5" value={status} onChange={(event) => setStatus(event.target.value as NewsroomFilter)}>
                {NEWSROOM_FILTERS.map((filter) => (
                  <option key={filter.key} value={filter.key}>{filter.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              فید
              <select className="rounded-xl border px-3 py-2.5" value={feedId} onChange={(event) => setFeedId(event.target.value)}>
                <option value="">همه فیدهای اتاق خبر</option>
                {feeds.map((feed) => (
                  <option key={feed.id} value={feed.id}>
                    {feed.name}{feed.enabled ? '' : ' (متوقف)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              دسته‌بندی مقصد
              <select
                className="rounded-xl border px-3 py-2.5"
                value={generalOnly ? '__general__' : categoryId}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '__general__') {
                    setGeneralOnly(true);
                    setCategoryId('');
                    return;
                  }
                  setGeneralOnly(false);
                  setCategoryId(value);
                }}
              >
                <option value="">همه دسته‌ها</option>
                <option value="__general__">فقط عمومی (دسته‌بندی‌نشده)</option>
                {approvedCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              جست‌وجو
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-xl border py-2.5 pl-3 pr-10"
                  placeholder="عنوان یا نام رسانه..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </label>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900">{listTitle}</h2>
          <span className="text-sm text-slate-500">{formatPersianDigits(rows.length)} خبر</span>
        </div>

        {articlesApi.isLoading && !articlesApi.data ? (
          <div className="grid min-h-64 place-items-center">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Newspaper className="h-8 w-8" />
            </span>
            <h3 className="mt-4 font-bold text-slate-900">خبری در این بخش نیست</h3>
            <p className="mt-2 text-sm text-slate-500">
              فیدهای اتاق خبر را اضافه کنید یا «دریافت خبرهای جدید» را بزنید.
            </p>
          </Card>
        ) : (
          <section className="space-y-4">
            {rows.map((article) => (
              <NewsArticleCard
                key={article.id}
                article={article}
                busyKey={busy}
                translatePending={Boolean(translatePendingIds[article.id])}
                categories={approvedCategories}
                onAssignCategory={assignCategory}
                onSummarize={summarize}
                onTranslateFull={(id) => { void translateFull(id); }}
                onSendToSocial={sendToSocial}
                onReject={reject}
              />
            ))}
            {(cursor || articleData?.nextCursor) && (
              <div className="flex justify-center gap-2">
                {cursor && <Button variant="outline" onClick={() => setCursor('')}>صفحه اول</Button>}
                {articleData?.nextCursor && <Button variant="outline" onClick={() => setCursor(articleData.nextCursor || '')}>صفحه بعد</Button>}
              </div>
            )}
          </section>
        )}
        <NewsPublishModal
          open={Boolean(publishModal)}
          articleTitle={publishModal?.articleTitle || ''}
          sourceName={publishModal?.sourceName || ''}
          initialDraft={publishModal?.draft || null}
          busyTranslate={Boolean(publishModal && busy === `translate-${publishModal.articleId}`)}
          busyPublish={Boolean(publishModal && busy === `publish-${publishModal.articleId}`)}
          onClose={() => {
            if (busy?.startsWith('publish-')) return;
            setPublishModal(null);
          }}
          onRetranslate={() => {
            if (!publishModal) return;
            void translateFull(publishModal.articleId, true);
          }}
          onPublish={(draft) => { void publishFromModal(draft); }}
        />
      </main>
    </ProtectedLayout>
  );
}
