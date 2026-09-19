import type { LucideIcon } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { cn } from '@/lib/utils';
import { Card } from './card';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: string;
  hint?: string;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, tone = 'bg-primary-50 text-primary-600', hint, className }: StatCardProps) {
  const display = typeof value === 'number' ? formatPersianDigits(value) : value;

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', tone)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="lytic-metric-label mt-4">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{display}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
