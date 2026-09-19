import {
  formatPersianDigits,
  toJalaliParts,
  type GregorianDateParts,
  type JalaliDateParts,
} from '@deska/shared';

export type CalendarSystem = 'jalali' | 'gregorian';

export { formatPersianDigits };

export function formatJalaliDate(
  date: string | Date | null | undefined,
  format = 'YYYY/MM/DD',
): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';

  const { jy, jm, jd } = toJalaliParts(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
  );

  if (format === 'D MMM') {
    const months = [
      'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
    ];
    return formatPersianDigits(`${jd} ${months[jm - 1] ?? ''}`);
  }

  const month = String(jm).padStart(2, '0');
  const day = String(jd).padStart(2, '0');
  return formatPersianDigits(`${jy}/${month}/${day}`);
}

export function formatJalaliDateTime(
  date: string | Date | null | undefined,
  format = 'YYYY/MM/DD HH:mm',
): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';

  const datePart = formatJalaliDate(date, 'YYYY/MM/DD');
  if (format === 'YYYY/MM/DD') return datePart;

  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return formatPersianDigits(`${datePart.replace(/—/, '')} ${hours}:${minutes}`);
}

export function formatGregorianDate(
  date: string | Date | null | undefined,
  format = 'YYYY/MM/DD',
): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';

  const gy = parsed.getFullYear();
  const gm = parsed.getMonth() + 1;
  const gd = parsed.getDate();

  if (format === 'D MMM') {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return `${gd} ${months[gm - 1] ?? ''}`;
  }

  if (format === 'MMMM YYYY') {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return `${months[gm - 1] ?? ''} ${gy}`;
  }

  const month = String(gm).padStart(2, '0');
  const day = String(gd).padStart(2, '0');
  return `${gy}/${month}/${day}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('fa-IR').format(value);
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('fa-IR').format(value)} ریال`;
}

export type { GregorianDateParts, JalaliDateParts };
export {
  buildGregorianMonthGrid,
  buildJalaliMonthGrid,
  eventMatchesCalendarCell,
  formatGregorianKey,
  formatGregorianLabel,
  formatJalaliKey,
  formatJalaliLabel,
  getGregorianToday,
  getIranWeekday,
  getJalaliToday,
  IRAN_WEEKDAY_LABELS,
  isIranFriday,
  JALALI_MONTH_NAMES,
} from '@deska/shared';
