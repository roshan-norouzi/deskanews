'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NoticeTone = 'success' | 'error' | 'info';

const TONE_CLASS: Record<NoticeTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

interface NoticeBannerProps {
  tone: NoticeTone;
  children: React.ReactNode;
  className?: string;
  onDismiss?: () => void;
}

export function NoticeBanner({ tone, children, className, onDismiss }: NoticeBannerProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', TONE_CLASS[tone], className)}
    >
      <div className="min-w-0 flex-1 leading-6">{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="shrink-0 rounded-lg p-1 text-current opacity-70 hover:bg-black/5 hover:opacity-100"
          aria-label="بستن پیام"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
