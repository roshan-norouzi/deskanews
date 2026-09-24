import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface WorkMetric {
  label: string;
  value: number;
  href?: string;
  tone?: 'default' | 'action' | 'danger';
}

interface WorkQueueCardProps {
  title: string;
  href: string;
  actionLabel: string;
  metrics: WorkMetric[];
}

export function WorkQueueCard({ title, href, actionLabel, metrics }: WorkQueueCardProps) {
  const hero = metrics.find((metric) => metric.tone === 'danger' && metric.value > 0) ?? metrics[0];
  const rest = metrics.filter((metric) => metric !== hero);

  return (
    <Card className="flex min-h-[11rem] flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">کارهایی که الان باید دیده شوند</p>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-800"
        >
          {actionLabel}
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>

      {hero && (
        <Link
          href={hero.href ?? href}
          className={cn(
            'mt-4 flex items-baseline justify-between rounded-lg px-3 py-2.5',
            hero.tone === 'danger' ? 'bg-red-50' : 'bg-primary-50',
          )}
        >
          <span className="text-sm font-medium text-slate-700">{hero.label}</span>
          <span
            className={cn(
              'text-3xl font-bold tabular-nums leading-none',
              hero.tone === 'danger' ? 'text-red-700' : 'text-primary-800',
            )}
          >
            {formatPersianDigits(hero.value)}
          </span>
        </Link>
      )}

      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {rest.map((metric) => (
          <li key={metric.label}>
            {metric.href ? (
              <Link href={metric.href} className="block rounded-md hover:bg-slate-50">
                <MetricCell metric={metric} />
              </Link>
            ) : (
              <MetricCell metric={metric} />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MetricCell({ metric }: { metric: WorkMetric }) {
  return (
    <div className="px-0.5 py-1">
      <p
        className={cn(
          'text-lg font-bold tabular-nums leading-none',
          metric.tone === 'danger' && metric.value > 0 ? 'text-red-700' : 'text-slate-900',
        )}
      >
        {formatPersianDigits(metric.value)}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{metric.label}</p>
    </div>
  );
}
