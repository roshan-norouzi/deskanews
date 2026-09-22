'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';

export interface NewsPublishDraft {
  titleFa: string;
  summaryFa: string;
  contentFa: string;
}

interface NewsPublishModalProps {
  open: boolean;
  articleTitle: string;
  sourceName: string;
  initialDraft: NewsPublishDraft | null;
  busyTranslate: boolean;
  busyPublish: boolean;
  onClose: () => void;
  onRetranslate: () => void;
  onPublish: (draft: NewsPublishDraft) => void;
}

export function NewsPublishModal({
  open,
  articleTitle,
  sourceName,
  initialDraft,
  busyTranslate,
  busyPublish,
  onClose,
  onRetranslate,
  onPublish,
}: NewsPublishModalProps) {
  const [draft, setDraft] = useState<NewsPublishDraft>({ titleFa: '', summaryFa: '', contentFa: '' });

  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft, open]);

  const canPublish = Boolean(draft.titleFa.trim() && draft.summaryFa.trim() && draft.contentFa.trim());
  const showDraft = Boolean(initialDraft?.contentFa?.trim());

  return (
    <Modal open={open} onClose={onClose} size="2xl" closeOnBackdrop={!busyTranslate && !busyPublish}>
      <ModalHeader
        title="بررسی متن کامل"
        description={`${sourceName} — ${articleTitle}`}
        onClose={busyPublish ? undefined : onClose}
      />
      <ModalBody className="space-y-4 px-6 py-5">
        {showDraft ? (
          <>
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
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              متن کامل
              <textarea
                className="min-h-72 rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-8 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                value={draft.contentFa}
                onChange={(event) => setDraft((current) => ({ ...current, contentFa: event.target.value }))}
              />
            </label>
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
