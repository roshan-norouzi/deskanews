'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Newspaper, RefreshCw, Rss, Settings2, Trash2 } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import {
  NewsArticleCard,
  type NewsArticleCardData,
} from '@/components/publishing/news-article-card';
import { NewsPublishModal, type NewsPublishDraft } from '@/components/publishing/news-publish-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { NoticeBanner } from '@/components/ui/notice-banner';
import { PageContainer } from '@/components/ui/page-container';
import { PageSkeleton } from '@/components/ui/page-loading';
import { PageHeader } from '@/components/ui/page-header';
import { QUEUED_JOB_SUCCESS } from '@/lib/product-copy';
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
  const confirm = useConfirm();
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
    sourceUrl: string;
    featuredImageUrl: string | null;
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

  useEffect(() => {
    setTranslatePendingIds((current) => {
      const ids = Object.keys(current);
      if (!ids.length) return current;
      let changed = false;
      const next = { ...current };
      for (const id of ids) {
        const article = articles.find((item) => item.id === id);
        if (!article) continue;
        if (article.contentFa?.trim() || ['failed', 'publish_failed'].includes(article.status)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [articles]);

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
        text: queued ? QUEUED_JOB_SUCCESS : success,
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
    'منابع اتاق خبر پایش شدند؛ خبرهای جدید بر اساس تنظیمات اتوماسیون پردازش می‌شوند.',
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
      sourceUrl: article.originalUrl || '',
      featuredImageUrl: article.featuredImageUrl,
      draft: {
        titleFa: article.titleFa,
        summaryFa: article.summaryFa,
        contentHtml: article.contentFa || '',
        featuredImageUrl: article.featuredImageUrl,
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
          ? QUEUED_JOB_SUCCESS
          : 'متن کامل آماده انتشار شد؛ «آماده برای انتشار» را بزنید.',
      });
      await articlesApi.refetch();
    } catch (error) {
      setTranslatePendingIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setNotice({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'آماده‌سازی برای انتشار انجام نشد؛ دوباره تلاش کنید.',
      });
    } finally {
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
        body: {
          titleFa: draft.titleFa,
          summaryFa: draft.summaryFa,
          contentHtml: draft.contentHtml,
          featuredImageUrl: draft.featuredImageUrl,
        },
      });
      setPublishModal(null);
      setNotice({
        type: 'success',
        text: published?.queued
          ? QUEUED_JOB_SUCCESS
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
    void run(
      `reject-${id}`,
      () => apiFetch(`/publishing/news/articles/${id}/reject`, { method: 'POST' }),
      'خبر به بخش ردشده‌ها منتقل شد.',
    );
  };

  const restoreRejected = (id: string) => {
    void run(
      `restore-${id}`,
      () => apiFetch(`/publishing/news/articles/${id}/restore`, { method: 'POST' }),
      'خبر به اتاق خبر بازگردانده شد.',
    );
  };

  const listTitle = activeFilter.label;

  return (
    <ProtectedLayout>
      <PageContainer width="narrow">
        <PageHeader
          title="اتاق خبر"
          description="مدیریت خبرها و فرایند انتشار."
          icon={Newspaper}
          actions={(
            <>
              <Link href="/publishing/feeds">
                <Button variant="outline" size="sm" type="button">
                  <Rss className="h-4 w-4" />
                  منابع خبری
                </Button>
              </Link>
              <Link href="/publishing/settings">
                <Button variant="outline" size="sm" type="button">
                  <Settings2 className="h-4 w-4" />
                  تنظیمات انتشار
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-700 hover:bg-red-50"
                isLoading={busy === 'delete-all'}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'حذف همه خبرهای اتاق خبر؟',
                    description:
                      'همه خبرهای فعلی برای همیشه حذف می‌شوند. منابع و تنظیمات باقی می‌مانند و در پایش بعدی خبرها دوباره دریافت می‌شوند.',
                    confirmLabel: 'حذف همه خبرها',
                    variant: 'danger',
                  });
                  if (!ok) return;
                  void run(
                    'delete-all',
                    () => apiFetch('/publishing/news/articles', { method: 'DELETE' }),
                    'همه خبرهای اتاق خبر حذف شدند؛ در پایش بعدی دوباره دریافت می‌شوند.',
                  );
                }}
              >
                <Trash2 className="h-4 w-4" />
                حذف همه
              </Button>
              <Button
                size="sm"
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
          <NoticeBanner tone={notice.type === 'success' ? 'success' : 'error'} onDismiss={() => setNotice(null)}>
            {notice.text}
          </NoticeBanner>
        )}
        {articlesApi.error && (
          <NoticeBanner tone="error">
            دریافت خبرها انجام نشد: {articlesApi.error}
          </NoticeBanner>
        )}

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <button
              type="button"
              key={card.key}
              onClick={() => setStatus(card.key)}
              className={cn(
                'rounded-lg border bg-white px-4 py-3 text-right transition',
                status === card.key ? 'border-primary-400 ring-2 ring-primary-100' : 'border-slate-200',
              )}
            >
              <div className={cn('text-xl font-bold', card.tone)}>{formatPersianDigits(card.count)}</div>
              <div className="mt-0.5 text-xs font-medium text-slate-700">{card.label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{card.description}</div>
            </button>
          ))}
        </section>

        <FilterBar
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="عنوان یا نام رسانه..."
        >
          <label className="ds-field min-w-[12rem]">
            منبع
            <select className="h-10 rounded-lg border border-surface-border bg-white px-3 text-sm" value={feedId} onChange={(event) => setFeedId(event.target.value)}>
              <option value="">همه منابع اتاق خبر</option>
              {feeds.map((feed) => (
                <option key={feed.id} value={feed.id}>
                  {feed.name}{feed.enabled ? '' : ' (متوقف)'}
                </option>
              ))}
            </select>
          </label>
          <label className="ds-field min-w-[12rem]">
            دسته‌بندی مقصد
            <select
              className="h-10 rounded-lg border border-surface-border bg-white px-3 text-sm"
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
        </FilterBar>

        <div className="flex items-center justify-between">
          <h2 className="ds-section-title">{listTitle}</h2>
          <span className="text-sm text-slate-500">{formatPersianDigits(rows.length)} خبر</span>
        </div>

        {articlesApi.isLoading && !articlesApi.data ? (
          <PageSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={Newspaper}
              title="خبری در این بخش نیست"
              description="منابع اتاق خبر را در «منابع خبری» اضافه کنید یا دکمه «دریافت خبرهای جدید» را بزنید."
              action={(
                <Link href="/publishing/feeds">
                  <Button variant="outline" size="sm">مدیریت منابع خبری</Button>
                </Link>
              )}
            />
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
                onRestore={restoreRejected}
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
          articleId={publishModal?.articleId || ''}
          articleTitle={publishModal?.articleTitle || ''}
          sourceName={publishModal?.sourceName || ''}
          sourceUrl={publishModal?.sourceUrl || ''}
          featuredImageUrl={publishModal?.featuredImageUrl ?? null}
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
          onFeaturedImageChange={(url) => {
            setPublishModal((current) => (current ? {
              ...current,
              featuredImageUrl: url,
              draft: { ...current.draft, featuredImageUrl: url },
            } : current));
          }}
        />
      </PageContainer>
    </ProtectedLayout>
  );
}
