'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'wide';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
  wide: 'max-w-4xl lg:max-w-[min(70vw,56rem)]',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  zIndex?: 70 | 80 | 90;
  closeOnBackdrop?: boolean;
  labelledBy?: string;
  panelClassName?: string;
}

export function Modal({
  open,
  onClose,
  children,
  size = 'lg',
  zIndex = 70,
  closeOnBackdrop = true,
  labelledBy,
  panelClassName,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const zClass = zIndex === 90 ? 'z-[90]' : zIndex === 80 ? 'z-[80]' : 'z-[70]';

  return (
    <div
      className={cn('fixed inset-0 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm', zClass)}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          'flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',
          SIZE_CLASSES[size],
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function ModalHeader({ title, description, onClose, className }: ModalHeaderProps) {
  return (
    <div className={cn('shrink-0 border-b border-slate-100 px-6 py-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {typeof title === 'string' ? (
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          ) : (
            title
          )}
          {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="بستن"
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ModalBody({
  children,
  className,
  dir,
}: {
  children: ReactNode;
  className?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
}) {
  return (
    <div dir={dir} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-y-contain', className)}>
      {children}
    </div>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-4', className)}>
      {children}
    </div>
  );
}

/** Wraps modal content in a flex column — use for forms that span header/body/footer. */
export function ModalFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      {children}
    </div>
  );
}
