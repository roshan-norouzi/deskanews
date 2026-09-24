import { USAGE_UNIT_LABEL, formatPersianDigits } from '@deska/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { TenantUsageSummary } from '@/components/settings/organization-usage-panel';

function Amount({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <span
      dir="ltr"
      className={cn('inline-block tabular-nums', muted ? 'text-slate-400' : 'text-slate-900')}
    >
      {formatPersianDigits(String(value))}
    </span>
  );
}

export function UsageSnapshot({
  usage,
  loading,
}: {
  usage: TenantUsageSummary | null;
  loading?: boolean;
}) {
  const cells = [
    { label: 'باقیمانده', value: usage?.availableTokens ?? 0, emphasize: true },
    { label: 'امروز', value: usage?.consumedDay ?? 0 },
    { label: 'این هفته', value: usage?.consumedWeek ?? 0 },
    { label: 'این ماه', value: usage?.consumedMonth ?? 0 },
    { label: 'کل ثبت‌شده', value: usage?.totalCost ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-surface-border bg-slate-100 sm:grid-cols-5">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={cn(
            'bg-white px-4 py-3',
            cell.emphasize && 'bg-emerald-50/80',
          )}
        >
          <p className="text-xs text-slate-500">{cell.label}</p>
          {loading ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-100" />
          ) : (
            <p className="mt-1 flex items-baseline gap-1">
              <span className={cn('text-xl font-bold tabular-nums', cell.emphasize ? 'text-emerald-800' : 'text-slate-900')}>
                {formatPersianDigits(String(cell.value))}
              </span>
              <span className="text-[11px] font-medium text-slate-500">{USAGE_UNIT_LABEL}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function UsageProcessTable({
  usage,
  loading,
}: {
  usage: TenantUsageSummary | null;
  loading?: boolean;
}) {
  const metrics = usage?.metrics ?? [];

  if (loading) {
    return <div className="h-48 animate-pulse rounded-lg bg-slate-100" />;
  }

  return (
    <Table density="compact" className="table-fixed">
      <colgroup>
        <col className="w-[36%]" />
        <col className="w-[16%]" />
        <col className="w-[14%]" />
        <col className="w-[16%]" />
        <col className="w-[18%]" />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead>فرایند</TableHead>
          <TableHead>تعداد</TableHead>
          <TableHead>واحد</TableHead>
          <TableHead>نرخ</TableHead>
          <TableHead>جمع ({USAGE_UNIT_LABEL})</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.length === 0 ? (
          <TableEmpty colSpan={5} message="هنوز مصرفی برای این سازمان ثبت نشده است." />
        ) : (
          metrics.map((metric) => {
            const idle = metric.quantity === 0;
            return (
              <TableRow key={metric.key} className={idle ? 'text-slate-400' : undefined}>
                <TableCell className={cn('font-medium', idle ? 'text-slate-400' : 'text-slate-900')}>
                  {metric.label}
                </TableCell>
                <TableCell>
                  <Amount value={metric.quantity} muted={idle} />
                </TableCell>
                <TableCell className="text-slate-500">{metric.unitLabel}</TableCell>
                <TableCell>
                  <Amount value={metric.unitCost} muted={idle} />
                </TableCell>
                <TableCell className={cn('font-semibold', idle ? 'text-slate-400' : 'text-slate-900')}>
                  <Amount value={metric.totalCost} muted={idle} />
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
