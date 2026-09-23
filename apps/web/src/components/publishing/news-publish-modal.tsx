'use client';

import { useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { toWordPressHtml } from '@deska/shared';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

export interface NewsPublishDraft {
  titleFa: string;
  summaryFa: string;
  contentFa: string;
}

interface NewsPublishModalProps {
  open: boolean;
  articleId: string;
  articleTitle: string;
  sourceName: string;
  sourceUrl: string;
  featuredImageUrl: string | null;
  initialDraft: NewsPublishDraft | null;
  busyTranslate: boolean;
  busyPublish: boolean;
  onClose: () => void;
  onRetranslate: () => void;
  onPublish: (draft: NewsPublishDraft) => void;
}

const PUBLISH_BODY_CLASS = cn(
  'news-publish-body text-[15px] leading-8 text-slate-800',
  '[&_p]:mb-4 [&_p:last-child]:mb-0',
  '[&_a]:font-medium [&_a]:text-primary-600 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary-700',
);

export function NewsPublishModal({
  open,
  articleId,
  articleTitle,
  sourceName,
  sourceUrl,
  featuredImageUrl,
  initialDraft,
  busyTranslate,
  busyPublish,
  onClose,
  onRetranslate,
  onPublish,
}: NewsPublishModalProps) {
  const [draft, setDraft] = useState<NewsPublishDraft>({ titleFa: '', summaryFa: '', contentFa: '' });
  const [contentMode, setContentMode] = useState<'preview' | 'edit'>('preview');

  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft, open]);

  useEffect(() => {
    if (open) setContentMode('preview');
  }, [open]);

  const publishHtml = useMemo(
    () => toWordPressHtml(draft.contentFa.trim(), sourceName, sourceUrl, articleId),
    [articleId, draft.contentFa, sourceName, sourceUrl],
  );

  const canPublish = Boolean(draft.titleFa.trim() && draft.summaryFa.trim() && draft.contentFa.trim());
  const showDraft = Boolean(initialDraft?.contentFa?.trim());

  return (
    <Modal open={open} onClose={onClose} size="wide" closeOnBackdrop={!busyTranslate && !busyPublish}>
      <ModalHeader
        title="آماده برای انتشار"
        description={`${sourceName} — ${articleTitle}`}
        onClose={busyPublish ? undefined : onClose}
      />
      <ModalBody className="space-y-4 px-6 py-5">
        {showDraft ? (
          <>
            {featuredImageUrl ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <img
                  src={featuredImageUrl}
                  alt="تصویر شاخص"
                  className="max-h-64 w-full object-cover"
                />
                <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                  تصویر شاخص همراه با خبر به سایت مقصد ارسال می‌شود.
                </p>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                تصویر شاخصی برای این خبر ثبت نشده است؛ انتشار بدون تصویر شاخص انجام می‌شود.
              </p>
            )}
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              تیتر
              <input
                className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                value={draft.titleFa}
                onChange={(event) => setDraft((current) => ({ ...current, titleFa: event.target.value }))}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              لید / خلاصه
              <textarea
                className="min-h-24 rounded-xl border border-slate-300 px-3 py-2.5 leading-7 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                value={draft.summaryFa}
                onChange={(event) => setDraft((current) => ({ ...current, summaryFa: event.target.value }))}
              />
            </label>
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">متن کامل (همان‌طور که در سایت منتشر می‌شود)</span>
                <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
                  <button
                    type="button"
                    className={cn(
                      'rounded-md px-3 py-1.5 font-medium transition',
                      contentMode === 'preview' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
                    )}
                    onClick={() => setContentMode('preview')}
                  >
                    پیش‌نمایش
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded-md px-3 py-1.5 font-medium transition',
                      contentMode === 'edit' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
                    )}
                    onClick={() => setContentMode('edit')}
                  >
                    ویرایش متن
                  </button>
                </div>
              </div>
              {contentMode === 'preview' ? (
                <div
                  className={cn(
                    'min-h-72 max-h-[min(50vh,28rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5',
                    PUBLISH_BODY_CLASS,
                  )}
                  dir="rtl"
                  // Safe: generated from escaped plain text via toWordPressHtml
                  dangerouslySetInnerHTML={{ __html: publishHtml }}
                />
              ) : (
                <textarea
                  className="min-h-72 rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-8 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                  value={draft.contentFa}
                  onChange={(event) => setDraft((current) => ({ ...current, contentFa: event.target.value }))}
                  placeholder="هر پاراگراف را با یک خط خالی از پاراگراف بعد جدا کنید."
                />
              )}
              {contentMode === 'preview' && (
                <p className="text-xs leading-5 text-slate-500">
                  عبارت «به گزارش…» در ابتدای متن و «منبع» در پایان، مطابق قالب انتشار سایت مقصد به‌صورت خودکار اضافه می‌شوند.
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">متن کامل هنوز آماده نیست؛ از کارت خبر «آماده‌سازی برای انتشار» را بزنید.</p>
        )}
      </ModalBody>
      <ModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={busyPublish}>
          انصراف
        </Button>
        <Button variant="outline" onClick={onRetranslate} isLoading={busyTranslate} disabled={busyPublish || !showDraft}>
          آماده‌سازی مجدد
        </Button>
        <Button
          onClick={() => onPublish({
            titleFa: draft.titleFa.trim(),
            summaryFa: draft.summaryFa.trim(),
            contentFa: draft.contentFa.trim(),
          })}
          isLoading={busyPublish}
          disabled={busyTranslate || !canPublish}
        >
          <Send className="h-4 w-4" />
          انتشار در سایت
        </Button>
      </ModalFooter>
    </Modal>
  );
}
