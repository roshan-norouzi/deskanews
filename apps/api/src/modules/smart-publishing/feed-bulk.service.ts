import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeFeedSourceType, type FeedCatalogGroup, type SourceLanguage } from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformFeedService } from './platform-feed.service';
import { NewsroomService } from './newsroom.service';
import {
  ALLOWED_CATALOG_GROUPS,
  ALLOWED_SOURCE_LANGUAGES,
  ALLOWED_SOURCE_TYPES,
  buildWorkbook,
  parseBooleanCell,
  parseWorkbookRows,
  parseWordsCell,
  PLATFORM_BULK_COLUMNS,
  TENANT_BULK_COLUMNS,
  validateEnum,
} from './feed-bulk-xlsx';

export type BulkImportRowError = { row: number; message: string };

export type BulkImportResult = {
  ok: boolean;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  errors: BulkImportRowError[];
};

function normalizeOptionalId(value: string | undefined): string {
  return String(value || '').trim();
}

function parsePollInterval(value: string | undefined): number | null {
  const text = String(value || '').trim();
  if (!text) return 240;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 1440) return null;
  return parsed;
}

@Injectable()
export class FeedBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformFeeds: PlatformFeedService,
    private readonly newsroom: NewsroomService,
  ) {}

  async exportPlatformWorkbook(): Promise<Buffer> {
    const feeds = await this.platformFeeds.listAll();
    const rows = feeds.map((feed) => ({
      id: feed.id,
      name: feed.name,
      url: feed.url,
      sourceType: feed.sourceType,
      sourceLanguage: feed.sourceLanguage || 'auto',
      catalogGroup: feed.catalogGroup,
      logoUrl: feed.logoUrlOverride || '',
      enabled: feed.enabled,
    }));
    return buildWorkbook(PLATFORM_BULK_COLUMNS, rows, [
      'راهنمای ورود/خروج کاتالوگ منابع پیش‌فرض',
      '• شناسه را برای منابع موجود دست نزنید؛ ردیف جدید با شناسه خالی اضافه می‌شود.',
      '• آدرس، نوع، زبان و دسته قابل ویرایش هستند.',
      '• نوع منبع: rss, website, blog, telegram, twitter',
      `• زبان: ${ALLOWED_SOURCE_LANGUAGES.join(', ')}`,
      `• دسته: ${ALLOWED_CATALOG_GROUPS.join(', ')}`,
      '• فعال: بله / خیر',
      '• پس از آپلود، منابعی که در فایل نیستند حذف می‌شوند.',
    ]);
  }

  async importPlatformWorkbook(buffer: Buffer): Promise<BulkImportResult> {
    if (!buffer?.length) throw new BadRequestException('فایل خالی است');
    const parsedRows = parseWorkbookRows(buffer, PLATFORM_BULK_COLUMNS);
    const errors: BulkImportRowError[] = [];
    const idsKept = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const row of parsedRows) {
      const id = normalizeOptionalId(row.values.id);

      const name = row.values.name?.trim() || '';
      const url = row.values.url?.trim() || '';
      const sourceType = normalizeFeedSourceType(row.values.sourceType || 'rss');
      const sourceLanguage = row.values.sourceLanguage?.trim() || 'auto';
      const catalogGroup = row.values.catalogGroup?.trim() || '';
      const logoUrl = row.values.logoUrl?.trim() || '';
      const enabled = parseBooleanCell(row.values.enabled, true);

      if (name.length < 2) {
        errors.push({ row: row.rowNumber, message: 'نام باید حداقل ۲ نویسه باشد' });
        if (id) idsKept.add(id);
        continue;
      }
      const urlError = this.validateUrl(url);
      if (urlError) {
        errors.push({ row: row.rowNumber, message: urlError });
        if (id) idsKept.add(id);
        continue;
      }
      const typeError = validateEnum(sourceType, ALLOWED_SOURCE_TYPES, 'نوع منبع');
      if (typeError) {
        errors.push({ row: row.rowNumber, message: typeError });
        if (id) idsKept.add(id);
        continue;
      }
      const languageError = validateEnum(sourceLanguage, ALLOWED_SOURCE_LANGUAGES, 'زبان');
      if (languageError) {
        errors.push({ row: row.rowNumber, message: languageError });
        if (id) idsKept.add(id);
        continue;
      }
      const groupError = validateEnum(catalogGroup, ALLOWED_CATALOG_GROUPS, 'دسته');
      if (groupError) {
        errors.push({ row: row.rowNumber, message: groupError });
        if (id) idsKept.add(id);
        continue;
      }

      try {
        if (id) {
          await this.platformFeeds.update(id, {
            name,
            url,
            sourceType,
            sourceLanguage: sourceLanguage as SourceLanguage,
            catalogGroup: catalogGroup as FeedCatalogGroup,
            logoUrl,
            enabled,
          });
          idsKept.add(id);
          updated += 1;
        } else {
          const feed = await this.platformFeeds.create({
            name,
            url,
            sourceType,
            sourceLanguage: sourceLanguage as SourceLanguage,
            catalogGroup: catalogGroup as FeedCatalogGroup,
            logoUrl,
            enabled,
          });
          idsKept.add(feed.id);
          created += 1;
        }
      } catch (error) {
        errors.push({
          row: row.rowNumber,
          message: error instanceof Error ? error.message : 'ذخیره انجام نشد',
        });
        if (id) idsKept.add(id);
      }
    }

    const existing = await this.prisma.platformFeed.findMany({ select: { id: true } });
    let deleted = 0;
    for (const feed of existing) {
      if (idsKept.has(feed.id)) continue;
      try {
        await this.platformFeeds.delete(feed.id);
        deleted += 1;
      } catch (error) {
        errors.push({
          row: 0,
          message: `حذف منبع ${feed.id} انجام نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`,
        });
      }
    }

    return {
      ok: errors.length === 0,
      created,
      updated,
      deleted,
      failed: errors.length,
      errors,
    };
  }

  async exportTenantWorkbook(tenantId: string): Promise<Buffer> {
    const feeds = await this.newsroom.feeds(tenantId, 'news-room');
    const rows = feeds.map((feed) => ({
      id: feed.id,
      name: feed.name,
      url: feed.url,
      sourceType: feed.sourceType,
      sourceLanguage: feed.sourceLanguage || 'auto',
      includeWords: (feed.includeWords || []).join('، '),
      excludeWords: (feed.excludeWords || []).join('، '),
      pollIntervalMinutes: feed.pollIntervalMinutes ?? 240,
      autoPoll: feed.autoPoll ?? true,
      autoPrepare: feed.autoPrepare ?? true,
      autoPublish: feed.autoPublish ?? false,
      autoSendSocial: feed.autoSendSocial ?? false,
      enabled: feed.enabled,
    }));
    return buildWorkbook(TENANT_BULK_COLUMNS, rows, [
      'راهنمای ورود/خروج منابع اختصاصی سازمان',
      '• شناسه را برای منابع موجود دست نزنید؛ ردیف جدید با شناسه خالی اضافه می‌شود.',
      '• کلمات اجباری/ممنوع را با ویرگول فارسی یا انگلیسی جدا کنید.',
      '• فاصله پایش بین ۵ تا ۱۴۴۰ دقیقه است.',
      '• مقادیر بله/خیر برای ستون‌های خودکار و فعال.',
      '• پس از آپلود، منابعی که در فایل نیستند حذف می‌شوند.',
    ]);
  }

  async importTenantWorkbook(tenantId: string, buffer: Buffer): Promise<BulkImportResult> {
    if (!buffer?.length) throw new BadRequestException('فایل خالی است');
    const parsedRows = parseWorkbookRows(buffer, TENANT_BULK_COLUMNS);
    const errors: BulkImportRowError[] = [];
    const idsKept = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const row of parsedRows) {
      const id = normalizeOptionalId(row.values.id);
      const name = row.values.name?.trim() || '';
      const url = row.values.url?.trim() || '';
      const sourceType = normalizeFeedSourceType(row.values.sourceType || 'rss');
      const sourceLanguage = row.values.sourceLanguage?.trim() || 'auto';
      const includeWords = parseWordsCell(row.values.includeWords);
      const excludeWords = parseWordsCell(row.values.excludeWords);
      const pollIntervalMinutes = parsePollInterval(row.values.pollIntervalMinutes);
      const autoPoll = parseBooleanCell(row.values.autoPoll, true);
      const autoPrepare = parseBooleanCell(row.values.autoPrepare, true);
      const autoPublish = parseBooleanCell(row.values.autoPublish, false);
      const autoSendSocial = parseBooleanCell(row.values.autoSendSocial, false);
      const enabled = parseBooleanCell(row.values.enabled, true);

      if (name.length < 2) {
        errors.push({ row: row.rowNumber, message: 'نام باید حداقل ۲ نویسه باشد' });
        if (id) idsKept.add(id);
        continue;
      }
      const urlError = this.validateUrl(url);
      if (urlError) {
        errors.push({ row: row.rowNumber, message: urlError });
        if (id) idsKept.add(id);
        continue;
      }
      if (pollIntervalMinutes === null) {
        errors.push({ row: row.rowNumber, message: 'فاصله پایش باید بین ۵ تا ۱۴۴۰ دقیقه باشد' });
        if (id) idsKept.add(id);
        continue;
      }
      const typeError = validateEnum(sourceType, ALLOWED_SOURCE_TYPES, 'نوع منبع');
      if (typeError) {
        errors.push({ row: row.rowNumber, message: typeError });
        if (id) idsKept.add(id);
        continue;
      }
      const languageError = validateEnum(sourceLanguage, ALLOWED_SOURCE_LANGUAGES, 'زبان');
      if (languageError) {
        errors.push({ row: row.rowNumber, message: languageError });
        if (id) idsKept.add(id);
        continue;
      }

      try {
        if (id) {
          await this.newsroom.updateFeed(tenantId, id, {
            name,
            url,
            sourceType,
            sourceLanguage: sourceLanguage as SourceLanguage,
            includeWords,
            excludeWords,
            pollIntervalMinutes,
            autoPoll,
            autoPrepare,
            autoPublish,
            autoSendSocial,
            purpose: 'news-room',
          });
          await this.prisma.newsFeed.update({ where: { id }, data: { enabled } });
          idsKept.add(id);
          updated += 1;
        } else {
          const feed = await this.newsroom.addFeed(tenantId, {
            name,
            url,
            sourceType,
            sourceLanguage: sourceLanguage as SourceLanguage,
            includeWords,
            excludeWords,
            pollIntervalMinutes,
            autoPoll,
            autoPrepare,
            autoPublish,
            autoSendSocial,
            purpose: 'news-room',
            enabled,
          });
          idsKept.add(feed.id);
          created += 1;
        }
      } catch (error) {
        errors.push({
          row: row.rowNumber,
          message: error instanceof Error ? error.message : 'ذخیره انجام نشد',
        });
        if (id) idsKept.add(id);
      }
    }

    const existing = await this.prisma.newsFeed.findMany({
      where: { tenantId, purpose: 'news-room' },
      select: { id: true },
    });
    let deleted = 0;
    for (const feed of existing) {
      if (idsKept.has(feed.id)) continue;
      try {
        await this.newsroom.deleteFeed(tenantId, feed.id);
        deleted += 1;
      } catch (error) {
        errors.push({
          row: 0,
          message: `حذف منبع ${feed.id} انجام نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`,
        });
      }
    }

    return {
      ok: errors.length === 0,
      created,
      updated,
      deleted,
      failed: errors.length,
      errors,
    };
  }

  private validateUrl(url: string): string | null {
    if (!url) return 'آدرس الزامی است';
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return 'آدرس باید با http یا https شروع شود';
      return null;
    } catch {
      return 'آدرس معتبر نیست';
    }
  }
}
