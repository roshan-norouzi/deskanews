import * as XLSX from 'xlsx';
import { FEED_CATALOG_GROUP_ORDER, SOURCE_LANGUAGES, FEED_SOURCE_TYPES, isSourceLanguageCode, type FeedCatalogGroup, type SourceLanguage } from '@deska/shared';

export type BulkColumnDef = { key: string; header: string };

export const PLATFORM_BULK_COLUMNS: BulkColumnDef[] = [
  { key: 'id', header: 'شناسه' },
  { key: 'name', header: 'نام' },
  { key: 'url', header: 'آدرس' },
  { key: 'sourceType', header: 'نوع منبع' },
  { key: 'sourceLanguage', header: 'زبان' },
  { key: 'catalogGroup', header: 'دسته' },
  { key: 'logoUrl', header: 'لوگو' },
  { key: 'enabled', header: 'فعال' },
];

export const TENANT_BULK_COLUMNS: BulkColumnDef[] = [
  { key: 'id', header: 'شناسه' },
  { key: 'name', header: 'نام' },
  { key: 'url', header: 'آدرس' },
  { key: 'sourceType', header: 'نوع منبع' },
  { key: 'sourceLanguage', header: 'زبان' },
  { key: 'includeWords', header: 'کلمات اجباری' },
  { key: 'excludeWords', header: 'کلمات ممنوع' },
  { key: 'pollIntervalMinutes', header: 'فاصله پایش (دقیقه)' },
  { key: 'autoPoll', header: 'پایش خودکار' },
  { key: 'autoPrepare', header: 'آماده‌سازی خودکار' },
  { key: 'autoPublish', header: 'انتشار خودکار' },
  { key: 'autoSendSocial', header: 'ارسال خودکار اجتماعی' },
  { key: 'enabled', header: 'فعال' },
];

const GUIDE_SHEET = 'راهنما';

function headerToKey(header: string, columns: BulkColumnDef[]): string | null {
  const normalized = String(header || '').trim();
  if (!normalized) return null;
  const byHeader = columns.find((column) => column.header === normalized);
  if (byHeader) return byHeader.key;
  const byKey = columns.find((column) => column.key === normalized);
  return byKey?.key ?? null;
}

export function parseBooleanCell(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'بله', 'فعال', 'آری'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'خیر', 'غیرفعال'].includes(text)) return false;
  return fallback;
}

export function parseWordsCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function parseWorkbookRows(buffer: Buffer, columns: BulkColumnDef[]): Array<{ rowNumber: number; values: Record<string, string> }> {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => name !== GUIDE_SHEET) || workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, { header: 1, defval: '' });
  if (!matrix.length) return [];

  const headerRow = matrix[0] || [];
  const keyByIndex: Array<string | null> = headerRow.map((cell) => headerToKey(String(cell ?? ''), columns));
  const rows: Array<{ rowNumber: number; values: Record<string, string> }> = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const line = matrix[index] || [];
    const values: Record<string, string> = {};
    let hasContent = false;
    for (let col = 0; col < keyByIndex.length; col += 1) {
      const key = keyByIndex[col];
      if (!key) continue;
      const raw = line[col];
      const text = raw === null || raw === undefined ? '' : String(raw).trim();
      if (text) hasContent = true;
      values[key] = text;
    }
    if (!hasContent) continue;
    rows.push({ rowNumber: index + 1, values });
  }

  return rows;
}

export function buildWorkbook(
  columns: BulkColumnDef[],
  rows: Record<string, string | number | boolean>[],
  guideLines: string[],
): Buffer {
  const header = columns.map((column) => column.header);
  const data = rows.map((row) => columns.map((column) => {
    const value = row[column.key];
    if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
    return value ?? '';
  }));
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const guide = XLSX.utils.aoa_to_sheet(guideLines.map((line) => [line]));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'منابع');
  XLSX.utils.book_append_sheet(workbook, guide, GUIDE_SHEET);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function validateEnum(value: string, allowed: readonly string[], label: string): string | null {
  if (!value) return `${label} الزامی است`;
  if (!allowed.includes(value)) return `${label} معتبر نیست`;
  return null;
}

export function validateSourceLanguage(value: string): string | null {
  if (!value) return 'زبان الزامی است';
  if (!isSourceLanguageCode(value)) return 'زبان باید auto یا کد ISO دو حرفی باشد';
  return null;
}

export const ALLOWED_SOURCE_TYPES = FEED_SOURCE_TYPES;
export const ALLOWED_SOURCE_LANGUAGES = SOURCE_LANGUAGES;
export const ALLOWED_CATALOG_GROUPS = FEED_CATALOG_GROUP_ORDER;
