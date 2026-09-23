import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-10' : 'min-h-48 p-8',
        className,
      )}
    >
      {Icon && (
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon className="h-8 w-8" />
        </span>
      )}
      <h3 className={cn('font-bold text-slate-900', Icon ? 'mt-4' : '')}>{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
