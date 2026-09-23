import { cn } from '@/lib/utils';

interface PageLoadingProps {
  label?: string;
  className?: string;
  minHeight?: string;
}

export function PageLoading({ label = 'در حال بارگذاری...', className, minHeight = 'min-h-64' }: PageLoadingProps) {
  return (
    <div className={cn('grid place-items-center gap-3', minHeight, className)} role="status" aria-live="polite">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5">
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="mt-4 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
