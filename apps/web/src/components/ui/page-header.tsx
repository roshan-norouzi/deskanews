import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  tone?: 'default' | 'brand';
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  tone = 'default',
}: PageHeaderProps) {
  const isBrand = tone === 'brand';

  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <span
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-full',
              isBrand ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600',
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <h1 className="lytic-page-title">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
