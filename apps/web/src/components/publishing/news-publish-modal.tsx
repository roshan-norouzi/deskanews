'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Send,
  Trash2,
  Underline,
  Upload,
} from 'lucide-react';
import { looksLikePublishHtml, toWordPressHtml } from '@deska/shared';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { apiFetch, cn, withBasePath } from '@/lib/utils';

export interface NewsPublishDraft {
  titleFa: string;
  summaryFa: string;
  contentHtml: string;
  featuredImageUrl: string | null;
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
  onFeaturedImageChange: (url: string | null) => void;
}

const PUBLISH_BODY_CLASS = cn(
  'news-publish-body text-[15px] leading-8 text-slate-800 outline-none',
  '[&_p]:mb-4 [&_p:last-child]:mb-0',
  '[&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-10',
  '[&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:leading-9',
  '[&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-8',
  '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pr-6',
  '[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pr-6',
  '[&_li]:mb-1',
  '[&_a]:font-medium [&_a]:text-primary-600 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary-700',
);

function mediaSrc(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//iu.test(url) || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return withBasePath(url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : `/${url}`}`);
}

function seedHtml(content: string, sourceName: string, sourceUrl: string, articleId: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (looksLikePublishHtml(trimmed)) return trimmed;
  return toWordPressHtml(trimmed, sourceName, sourceUrl, articleId);
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

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
  onFeaturedImageChange,
}: NewsPublishModalProps) {
  const [draft, setDraft] = useState<NewsPublishDraft>({
    titleFa: '',
    summaryFa: '',
    contentHtml: '',
    featuredImageUrl: null,
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seededForOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      seededForOpen.current = false;
      return;
    }
    if (!initialDraft || seededForOpen.current) return;
    const html = seedHtml(initialDraft.contentHtml, sourceName, sourceUrl, articleId);
    setDraft({
      titleFa: initialDraft.titleFa,
      summaryFa: initialDraft.summaryFa,
      contentHtml: html,
      featuredImageUrl: initialDraft.featuredImageUrl ?? featuredImageUrl,
    });
    requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.innerHTML = html;
    });
    seededForOpen.current = true;
  }, [articleId, featuredImageUrl, initialDraft, open, sourceName, sourceUrl]);

  useEffect(() => {
    if (open) setDraft((current) => ({ ...current, featuredImageUrl }));
  }, [featuredImageUrl, open]);

  const showDraft = Boolean(initialDraft?.contentHtml?.trim() || draft.contentHtml.trim());
  const canPublish = Boolean(draft.titleFa.trim() && draft.summaryFa.trim() && draft.contentHtml.trim());

  function readEditorHtml(): string {
    return (editorRef.current?.innerHTML || draft.contentHtml).trim();
  }

  function applyFormat(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setDraft((current) => ({ ...current, contentHtml: readEditorHtml() }));
  }

  function insertLink() {
    const href = window.prompt('آدرس لینک (https://...)', 'https://');
    if (!href || !/^https?:\/\//iu.test(href.trim())) return;
    applyFormat('createLink', href.trim());
  }

  async function uploadFeaturedImage(file?: File) {
    if (!file) return;
    setUploadingImage(true);
    setImageError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const updated = await apiFetch<{ featuredImageUrl: string | null }>(
        `/publishing/news/articles/${articleId}/featured-image`,
        { method: 'POST', body },
      );
      const nextUrl = updated.featuredImageUrl || null;
      setDraft((current) => ({ ...current, featuredImageUrl: nextUrl }));
      onFeaturedImageChange(nextUrl);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'آپلود تصویر انجام نشد.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function removeFeaturedImage() {
    setUploadingImage(true);
    setImageError(null);
    try {
      await apiFetch(`/publishing/news/articles/${articleId}/featured-image`, { method: 'DELETE' });
      setDraft((current) => ({ ...current, featuredImageUrl: null }));
      onFeaturedImageChange(null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'حذف تصویر انجام نشد.');
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="wide" closeOnBackdrop={!busyTranslate && !busyPublish && !uploadingImage}>
      <ModalHeader
        title="آماده برای انتشار"
        description={`${sourceName} — ${articleTitle}`}
        onClose={busyPublish || uploadingImage ? undefined : onClose}
      />
      <ModalBody className="space-y-4 px-6 py-5">
        {showDraft ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {draft.featuredImageUrl ? (
                <img
                  src={mediaSrc(draft.featuredImageUrl)}
                  alt="تصویر شاخص"
                  className="max-h-64 w-full object-cover"
                />
              ) : (
                <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 py-8 text-slate-400">
                  <ImageIcon className="h-8 w-8" />
                  <p className="text-sm text-slate-500">تصویر شاخصی ثبت نشده است</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-4 py-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  onChange={(event) => {
                    void uploadFeaturedImage(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  isLoading={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {draft.featuredImageUrl ? 'تعویض تصویر' : 'آپلود تصویر شاخص'}
                </Button>
                {draft.featuredImageUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={uploadingImage}
                    onClick={() => void removeFeaturedImage()}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </Button>
                )}
                <p className="text-xs text-slate-500">JPG، PNG، WebP یا AVIF — حداکثر ۱۵ مگابایت</p>
              </div>
              {imageError && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{imageError}</p>}
            </div>

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
              <span className="text-sm font-medium text-slate-700">متن کامل (همان‌طور که در سایت منتشر می‌شود)</span>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
                  <ToolbarButton label="عنوان ۱" onClick={() => applyFormat('formatBlock', 'h1')}><Heading1 className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton label="عنوان ۲" onClick={() => applyFormat('formatBlock', 'h2')}><Heading2 className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton label="عنوان ۳" onClick={() => applyFormat('formatBlock', 'h3')}><Heading3 className="h-4 w-4" /></ToolbarButton>
                  <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
                  <ToolbarButton label="پررنگ" onClick={() => applyFormat('bold')}><Bold className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton label="کج" onClick={() => applyFormat('italic')}><Italic className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton label="زیرخط" onClick={() => applyFormat('underline')}><Underline className="h-4 w-4" /></ToolbarButton>
                  <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
                  <ToolbarButton label="فهرست نقطه‌ای" onClick={() => applyFormat('insertUnorderedList')}><List className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton label="فهرست شماره‌دار" onClick={() => applyFormat('insertOrderedList')}><ListOrdered className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton label="لینک" onClick={insertLink}><Link2 className="h-4 w-4" /></ToolbarButton>
                </div>
                <div
                  ref={editorRef}
                  role="textbox"
                  aria-multiline="true"
                  aria-label="متن کامل خبر"
                  contentEditable={!busyPublish}
                  suppressContentEditableWarning
                  dir="rtl"
                  className={cn(
                    'min-h-72 max-h-[min(50vh,28rem)] overflow-y-auto px-4 py-4 sm:px-5',
                    PUBLISH_BODY_CLASS,
                    busyPublish && 'pointer-events-none opacity-60',
                  )}
                  onInput={() => setDraft((current) => ({ ...current, contentHtml: readEditorHtml() }))}
                />
              </div>
              <p className="text-xs leading-5 text-slate-500">
                عبارت‌های «به گزارش…» و «منبع» از قبل در متن هستند و می‌توانید آن‌ها را ویرایش یا حذف کنید. استایل‌ها با نوار ابزار بالا اعمال می‌شوند.
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">متن کامل هنوز آماده نیست؛ از کارت خبر «آماده‌سازی برای انتشار» را بزنید.</p>
        )}
      </ModalBody>
      <ModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={busyPublish || uploadingImage}>
          انصراف
        </Button>
        <Button variant="outline" onClick={onRetranslate} isLoading={busyTranslate} disabled={busyPublish || !showDraft || uploadingImage}>
          آماده‌سازی مجدد
        </Button>
        <Button
          onClick={() => onPublish({
            titleFa: draft.titleFa.trim(),
            summaryFa: draft.summaryFa.trim(),
            contentHtml: readEditorHtml(),
            featuredImageUrl: draft.featuredImageUrl,
          })}
          isLoading={busyPublish}
          disabled={busyTranslate || uploadingImage || !canPublish}
        >
          <Send className="h-4 w-4" />
          انتشار در سایت
        </Button>
      </ModalFooter>
    </Modal>
  );
}
