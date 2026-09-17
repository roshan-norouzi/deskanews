import { jalaaliMonthLength as jalaaliMonthLengthFn, toGregorian, toJalaali } from 'jalaali-js';

export const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

export const GREGORIAN_MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const IRAN_WEEKDAY_LABELS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
] as const;

export interface JalaliDateParts {
  jy: number;
  jm: number;
  jd: number;
}

export interface GregorianDateParts {
  gy: number;
  gm: number;
  gd: number;
}

export interface CalendarCellDate {
  jalali: JalaliDateParts;
  gregorian: GregorianDateParts;
  iranWeekday: number;
  isOutsideMonth: boolean;
}

export interface LunarDateParts {
  year: number;
  month: number;
  day: number;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const LUNAR_MONTH_NAMES_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
] as const;

/**
 * Official Iranian lunar month starts published in the University of Tehran
 * calendar for Solar Hijri year 1405. Outside this published range, the
 * platform falls back to ICU's Umm al-Qura calculation until an official
 * Iranian calendar for that year is imported.
 */
const OFFICIAL_IRAN_LUNAR_MONTH_STARTS_1405 = [
  { year: 1447, month: 10, iso: '2026-03-21' },
  { year: 1447, month: 11, iso: '2026-04-19' },
  { year: 1447, month: 12, iso: '2026-05-18' },
  { year: 1448, month: 1, iso: '2026-06-16' },
  { year: 1448, month: 2, iso: '2026-07-16' },
  { year: 1448, month: 3, iso: '2026-08-14' },
  { year: 1448, month: 4, iso: '2026-09-13' },
  { year: 1448, month: 5, iso: '2026-10-12' },
  { year: 1448, month: 6, iso: '2026-11-11' },
  { year: 1448, month: 7, iso: '2026-12-11' },
  { year: 1448, month: 8, iso: '2027-01-10' },
  { year: 1448, month: 9, iso: '2027-02-08' },
  { year: 1448, month: 10, iso: '2027-03-10' },
] as const;

const OFFICIAL_IRAN_LUNAR_END_1405 = Date.UTC(2027, 2, 20);
const DAY_MS = 86_400_000;

export function toArabicDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => ARABIC_DIGITS[Number(digit)] ?? digit);
}

export function getLunarDateParts(date: Date): LunarDateParts {
  const utcDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (utcDay <= OFFICIAL_IRAN_LUNAR_END_1405) {
    for (let index = OFFICIAL_IRAN_LUNAR_MONTH_STARTS_1405.length - 1; index >= 0; index -= 1) {
      const start = OFFICIAL_IRAN_LUNAR_MONTH_STARTS_1405[index];
      const startMs = Date.parse(`${start.iso}T00:00:00Z`);
      if (utcDay >= startMs) {
        return {
          year: start.year,
          month: start.month,
          day: Math.floor((utcDay - startMs) / DAY_MS) + 1,
        };
      }
    }
  }

  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

export function formatLunarDate(date: Date): string {
  const parts = getLunarDateParts(date);
  const month = LUNAR_MONTH_NAMES_AR[parts.month - 1] ?? '';
  return `${toArabicDigits(parts.day)} ${month} ${toArabicDigits(parts.year)}`;
}

/** هفته از شنبه (۰) تا جمعه (۶) — مطابق time.ir */
export function getIranWeekday(gy: number, gm: number, gd: number): number {
  const jsDay = new Date(gy, gm - 1, gd).getDay();
  return (jsDay + 1) % 7;
}

export function isIranFriday(gy: number, gm: number, gd: number): boolean {
  return new Date(gy, gm - 1, gd).getDay() === 5;
}

export function parseGregorianDateInput(value: string | Date): GregorianDateParts | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    gy: date.getFullYear(),
    gm: date.getMonth() + 1,
    gd: date.getDate(),
  };
}

export function toJalaliParts(gy: number, gm: number, gd: number): JalaliDateParts {
  return toJalaali(gy, gm, gd);
}

export function toGregorianParts(jy: number, jm: number, jd: number): GregorianDateParts {
  return toGregorian(jy, jm, jd);
}

export function getJalaliToday(): JalaliDateParts {
  const now = new Date();
  return toJalaliParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function getGregorianToday(): GregorianDateParts {
  const now = new Date();
  return { gy: now.getFullYear(), gm: now.getMonth() + 1, gd: now.getDate() };
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaaliMonthLengthFn(jy, jm);
}

export function gregorianMonthLength(gy: number, gm: number): number {
  return new Date(gy, gm, 0).getDate();
}

function shiftJalaliMonth(jy: number, jm: number, delta: number): JalaliDateParts {
  const monthIndex = jy * 12 + (jm - 1) + delta;
  let nextJy = Math.floor(monthIndex / 12);
  let nextJm = monthIndex % 12;
  if (nextJm < 0) {
    nextJm += 12;
    nextJy -= 1;
  }
  return { jy: nextJy, jm: nextJm + 1, jd: 1 };
}

function createCell(
  jalali: JalaliDateParts,
  gregorian: GregorianDateParts,
  isOutsideMonth: boolean,
): CalendarCellDate {
  return {
    jalali,
    gregorian,
    iranWeekday: getIranWeekday(gregorian.gy, gregorian.gm, gregorian.gd),
    isOutsideMonth,
  };
}

export function buildJalaliMonthGrid(jy: number, jm: number): CalendarCellDate[] {
  const daysInMonth = jalaliMonthLength(jy, jm);
  const firstGregorian = toGregorianParts(jy, jm, 1);
  const startWeekday = getIranWeekday(firstGregorian.gy, firstGregorian.gm, firstGregorian.gd);
  const cells: CalendarCellDate[] = [];

  const previousMonth = shiftJalaliMonth(jy, jm, -1);
  const previousMonthDays = jalaliMonthLength(previousMonth.jy, previousMonth.jm);

  for (let offset = startWeekday; offset > 0; offset -= 1) {
    const jd = previousMonthDays - offset + 1;
    const gregorian = toGregorianParts(previousMonth.jy, previousMonth.jm, jd);
    cells.push(
      createCell({ jy: previousMonth.jy, jm: previousMonth.jm, jd }, gregorian, true),
    );
  }

  for (let jd = 1; jd <= daysInMonth; jd += 1) {
    const gregorian = toGregorianParts(jy, jm, jd);
    cells.push(createCell({ jy, jm, jd }, gregorian, false));
  }

  const nextMonth = shiftJalaliMonth(jy, jm, 1);
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const gregorian = toGregorianParts(nextMonth.jy, nextMonth.jm, nextDay);
    cells.push(
      createCell({ jy: nextMonth.jy, jm: nextMonth.jm, jd: nextDay }, gregorian, true),
    );
    nextDay += 1;
  }

  return cells;
}

export function buildGregorianMonthGrid(gy: number, gm: number): CalendarCellDate[] {
  const daysInMonth = gregorianMonthLength(gy, gm);
  const startWeekday = getIranWeekday(gy, gm, 1);
  const cells: CalendarCellDate[] = [];

  const previousMonthDate = new Date(gy, gm - 2, 1);
  const previousGy = previousMonthDate.getFullYear();
  const previousGm = previousMonthDate.getMonth() + 1;
  const previousMonthDays = gregorianMonthLength(previousGy, previousGm);

  for (let offset = startWeekday; offset > 0; offset -= 1) {
    const gd = previousMonthDays - offset + 1;
    const jalali = toJalaliParts(previousGy, previousGm, gd);
    cells.push(createCell(jalali, { gy: previousGy, gm: previousGm, gd }, true));
  }

  for (let gd = 1; gd <= daysInMonth; gd += 1) {
    const jalali = toJalaliParts(gy, gm, gd);
    cells.push(createCell(jalali, { gy, gm, gd }, false));
  }

  const nextMonthDate = new Date(gy, gm, 1);
  const nextGy = nextMonthDate.getFullYear();
  const nextGm = nextMonthDate.getMonth() + 1;
  let nextDay = 1;

  while (cells.length % 7 !== 0) {
    const jalali = toJalaliParts(nextGy, nextGm, nextDay);
    cells.push(createCell(jalali, { gy: nextGy, gm: nextGm, gd: nextDay }, true));
    nextDay += 1;
  }

  return cells;
}

export function formatGregorianKey(parts: GregorianDateParts): string {
  const month = String(parts.gm).padStart(2, '0');
  const day = String(parts.gd).padStart(2, '0');
  return `${parts.gy}-${month}-${day}`;
}

export function formatJalaliKey(parts: JalaliDateParts): string {
  const month = String(parts.jm).padStart(2, '0');
  const day = String(parts.jd).padStart(2, '0');
  return `${parts.jy}-${month}-${day}`;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

export function formatPersianDigits(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

export function formatJalaliLabel(parts: JalaliDateParts, withYear = false): string {
  const monthName = JALALI_MONTH_NAMES[parts.jm - 1] ?? '';
  if (withYear) {
    return formatPersianDigits(`${parts.jd} ${monthName} ${parts.jy}`);
  }
  return formatPersianDigits(`${parts.jd} ${monthName}`);
}

/** نام ماه شمسی به همراه سال، بدون شماره روز؛ مناسب عنوان ماه تقویم. */
export function formatJalaliMonthLabel(parts: JalaliDateParts): string {
  const monthName = JALALI_MONTH_NAMES[parts.jm - 1] ?? '';
  return formatPersianDigits(`${monthName} ${parts.jy}`);
}

export function formatGregorianLabel(parts: GregorianDateParts, withYear = false): string {
  const monthName = GREGORIAN_MONTH_NAMES_EN[parts.gm - 1] ?? '';
  if (withYear) {
    return `${parts.gd} ${monthName} ${parts.gy}`;
  }
  return `${parts.gd} ${monthName}`;
}

/** نام ماه میلادی به همراه سال، بدون شماره روز؛ مناسب عنوان ماه تقویم. */
export function formatGregorianMonthLabel(parts: GregorianDateParts): string {
  const monthName = GREGORIAN_MONTH_NAMES_EN[parts.gm - 1] ?? '';
  return `${monthName} ${parts.gy}`;
}

export function eventMatchesCalendarCell(
  eventStartAt: string,
  cell: CalendarCellDate,
  system: 'jalali' | 'gregorian',
  recurrenceType?: string,
  recurrenceCal?: string,
  recurrenceRule?: unknown,
): boolean {
  const eventGregorian = parseGregorianDateInput(eventStartAt);
  if (!eventGregorian) return false;

  const eventJalali = toJalaliParts(eventGregorian.gy, eventGregorian.gm, eventGregorian.gd);

  if (recurrenceType && recurrenceType !== 'none' && recurrenceType !== 'yearly') {
    const rule = recurrenceRule && typeof recurrenceRule === 'object'
      ? (recurrenceRule as { interval?: number; until?: string })
      : undefined;
    const interval = Math.max(1, Number(rule?.interval ?? 1));
    const cellDate = new Date(Date.UTC(cell.gregorian.gy, cell.gregorian.gm - 1, cell.gregorian.gd));
    const eventDate = new Date(Date.UTC(eventGregorian.gy, eventGregorian.gm - 1, eventGregorian.gd));
    if (cellDate < eventDate || (rule?.until && cellDate > new Date(`${rule.until}T23:59:59Z`))) return false;
    const days = Math.round((cellDate.getTime() - eventDate.getTime()) / 86400000);
    if (recurrenceType === 'daily') return days % interval === 0;
    if (recurrenceType === 'weekly') return days % (7 * interval) === 0;
    if (recurrenceType === 'monthly') {
      const months = (cell.gregorian.gy - eventGregorian.gy) * 12 + cell.gregorian.gm - eventGregorian.gm;
      return months >= 0 && months % interval === 0 && cell.gregorian.gd === eventGregorian.gd;
    }
  }

  if (recurrenceType === 'yearly') {
    const rule =
      recurrenceRule && typeof recurrenceRule === 'object'
        ? (recurrenceRule as { calendar?: string; month?: number; day?: number })
        : undefined;
    const calendar = rule?.calendar ?? recurrenceCal ?? system;

    if (calendar === 'lunar') {
      const targetMonth = rule?.month;
      const targetDay = rule?.day;
      const eventLunar = getLunarDateParts(new Date(eventStartAt));
      const cellLunar = getLunarDateParts(
        new Date(Date.UTC(cell.gregorian.gy, cell.gregorian.gm - 1, cell.gregorian.gd)),
      );
      return Boolean(
        eventLunar &&
          cellLunar &&
          cellLunar.month === (targetMonth ?? eventLunar.month) &&
          cellLunar.day === (targetDay ?? eventLunar.day),
      );
    }

    if (calendar === 'jalali') {
      return (
        (rule?.month ?? eventJalali.jm) === cell.jalali.jm &&
        (rule?.day ?? eventJalali.jd) === cell.jalali.jd
      );
    }
    if (calendar === 'gregorian') {
      return (
        (rule?.month ?? eventGregorian.gm) === cell.gregorian.gm &&
        (rule?.day ?? eventGregorian.gd) === cell.gregorian.gd
      );
    }

    return system === 'jalali'
      ? eventJalali.jm === cell.jalali.jm && eventJalali.jd === cell.jalali.jd
      : eventGregorian.gm === cell.gregorian.gm && eventGregorian.gd === cell.gregorian.gd;
  }

  if (system === 'jalali') {
    return (
      eventJalali.jy === cell.jalali.jy &&
      eventJalali.jm === cell.jalali.jm &&
      eventJalali.jd === cell.jalali.jd
    );
  }

  return formatGregorianKey(eventGregorian) === formatGregorianKey(cell.gregorian);
}
