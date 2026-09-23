import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const variants = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100',
  warning: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100',
  danger: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-100',
  info: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-100',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function statusToBadgeVariant(status: string): BadgeProps['variant'] {
  const map: Record<string, BadgeProps['variant']> = {
    active: 'success',
    pending: 'warning',
    open: 'info',
    rejected: 'danger',
    inactive: 'default',
  };
  return map[status] ?? 'default';
}
