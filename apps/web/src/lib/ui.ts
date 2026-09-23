import { cn } from '@/lib/utils';

/** Shared control chrome so Input, FilterBar, and native fields match. */
export const CONTROL_CLASS =
  'h-10 w-full rounded-lg border border-surface-border bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-500 hover:border-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:shadow-none';

export const CONTROL_CLASS_MULTILINE =
  'min-h-24 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm leading-7 text-slate-900 shadow-sm placeholder:text-slate-500 hover:border-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50';

export function controlClass(className?: string, invalid?: boolean) {
  return cn(
    CONTROL_CLASS,
    invalid && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
    className,
  );
}
