import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AI_SETTING_KEYS,
  PUBLISHING_SETTING_KEYS,
  type AiSettingKey,
  type PublishingSettingKey,
  type PublishingSettings,
  type UpdatePublishingSettingsDto,
} from './dto/publishing-settings.dto';
import type { UpdatePlatformAiSettingsDto } from '../../platform/admin/dto/platform-ai-settings.dto';
import type { UpdatePlatformSourceFetchSettingsDto } from '../../platform/admin/dto/platform-source-fetch-settings.dto';
import type { UpdatePlatformCatalogHealthSettingsDto } from '../../platform/admin/dto/platform-catalog-health-settings.dto';
import {
  DEFAULT_CATALOG_HEALTH_INTERVAL_HOURS,
  normalizeCatalogHealthIntervalHours,
  parseCatalogHealthEnabled,
} from './platform-feed-health';
import { mergeSourceLanguageCatalog, normalizeSourceLanguage } from '@deska/shared';
import { DEFAULT_NEWS_PROCESSING_PROMPTS } from './news-processing-prompts';
import {
  fallbackCoverTemplateFromSample,
  normalizeInferredCoverTemplate,
  readRasterImageSize,
  resolveCoverCanvasSize,
} from './cover-template-from-sample';
import { GapGptClient } from './gapgpt.client';
import { SecretProtectionService } from './secret-protection.service';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { serializeWordPressCategories } from './wordpress-category';

const SECRET_KEYS = new Set<PublishingSettingKey>([
  'gapgpt_api_key',
  'wp_app_password',
  'is_password',
  'ns_password',
  'telegram_bot_token',
  'social_instagram_access_token',
  'social_linkedin_access_token',
  'social_facebook_page_access_token',
]);

const AI_SETTING_KEY_SET = new Set<PublishingSettingKey>(AI_SETTING_KEYS);

export const SOURCE_FETCH_SETTING_KEYS = ['source_fetch_bridge_url', 'source_fetch_bridge_secret', 'source_fetch_news_via_bridge'] as const;
export type SourceFetchSettingKey = (typeof SOURCE_FETCH_SETTING_KEYS)[number];
export type SourceFetchSettings = Partial<Record<SourceFetchSettingKey, string>>;

const SOURCE_FETCH_SECRET_KEYS = new Set<SourceFetchSettingKey>(['source_fetch_bridge_secret']);

export const SOURCE_FETCH_BRIDGE_MISSING_MESSAGE =
  'آدرس Worker Deska ثبت نشده است. مدیر کل باید از مسیر «پلتفرم → Worker دریافت منبع» (/platform/source-fetch) آدرس Worker را وارد کند.';

const DEFAULT_COVER_TEMPLATE = JSON.stringify({
  version: 1,
  width: 1080,
  height: 1080,
  backgroundColor: '#0f172a',
  layers: [
    { id: 'featured-image', name: 'تصویر شاخص', type: 'featured-image', x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 100, borderRadius: 0, objectFit: 'cover' },
    { id: 'overlay', name: 'پوشش تیره', type: 'text', binding: 'custom', content: '', x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 55, color: '#ffffff', backgroundColor: '#0f172a', fontSize: 16, fontWeight: 400, align: 'right', borderRadius: 0 },
    { id: 'title', name: 'تیتر مطلب', type: 'text', binding: 'title', x: 8, y: 48, width: 84, height: 28, visible: true, opacity: 100, color: '#ffffff', backgroundColor: 'transparent', fontSize: 46, fontWeight: 800, align: 'right', borderRadius: 0 },
    { id: 'lead', name: 'لید مطلب', type: 'text', binding: 'lead', x: 8, y: 77, width: 84, height: 14, visible: true, opacity: 100, color: '#e2e8f0', backgroundColor: 'transparent', fontSize: 24, fontWeight: 400, align: 'right', borderRadius: 0 },
    { id: 'source', name: 'نام منبع', type: 'text', binding: 'source', x: 8, y: 6, width: 40, height: 8, visible: true, opacity: 100, color: '#ffffff', backgroundColor: '#2563eb', fontSize: 20, fontWeight: 700, align: 'center', borderRadius: 18 },
  ],
});

const DEFAULTS: PublishingSettings = {
  gapgpt_model: 'gpt-4o-mini',
  gapgpt_model_news_summary: 'gpt-4o-mini',
  gapgpt_model_news_translation: 'gpt-4o-mini',
  gapgpt_model_social: 'gpt-4o-mini',
  news_poll_interval_minutes: '240',
  news_max_age_days: '10',
  news_auto_poll: 'true',
  news_auto_prepare: 'true',
  news_auto_publish: 'false',
  news_auto_send_social: 'false',
  social_poll_interval_minutes: '240',
  social_max_age_days: '10',
  social_auto_poll: 'true',
  social_auto_prepare: 'false',
  social_auto_generate_image: 'false',
  social_auto_image_template_id: '',
  social_auto_publish_telegram: 'false',
  social_auto_publish_instagram: 'false',
  social_auto_publish_linkedin: 'false',
  social_auto_publish_facebook: 'false',
  social_caption_template: '{title}\n\n{lead}\n\nنویسنده: {author}\nدسته‌بندی: {category}\nزمان مطالعه: {reading_time} دقیقه\n\n{summary}\n\n{link}',
  social_image_template: DEFAULT_COVER_TEMPLATE,
  social_font_library: JSON.stringify([{ id: 'vazirmatn', name: 'Vazirmatn' }]),
  wp_post_status: 'publish',
  wp_login_path: 'wp-admin',
  wp_categories: '[]',
  destination_platform: 'wordpress',
  is_post_status: 'publish',
  ns_post_status: 'publish',
};

// Older releases stored empty strings for fields whose UI showed a default
// value. Treat those stale values as missing, otherwise the form displays one
// value but sends another when saved.
const DEFAULT_WHEN_EMPTY = new Set<PublishingSettingKey>([
  'gapgpt_model',
  'gapgpt_model_news_summary',
  'gapgpt_model_news_translation',
  'gapgpt_model_social',
  'news_poll_interval_minutes',
  'news_max_age_days',
  'news_auto_poll',
  'news_auto_prepare',
  'news_auto_publish',
  'news_auto_send_social',
  'social_poll_interval_minutes',
  'social_max_age_days',
  'social_auto_poll',
  'social_auto_prepare',
  'social_auto_generate_image',
  'social_auto_publish_telegram',
  'social_auto_publish_instagram',
  'social_auto_publish_linkedin',
  'social_auto_publish_facebook',
  'social_caption_template',
  'social_image_template',
  'social_font_library',
  'wp_post_status',
  'wp_login_path',
  'destination_platform',
  'is_post_status',
  'ns_post_status',
  'social_instagram_api_version',
  'social_linkedin_api_version',
  'social_facebook_api_version',
]);

function cleanObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function inputJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

/**
 * Nest + class-transformer creates decorated optional DTO properties with an
 * own value of `undefined`. Therefore `key in input` is not a safe way to
 * decide whether a browser actually submitted a setting. An empty string is
 * intentionally considered provided: it is the user's explicit request to
 * clear a non-secret setting.
 */
function isProvidedSetting(input: UpdatePublishingSettingsDto, key: PublishingSettingKey): boolean {
  return typeof input[key as keyof UpdatePublishingSettingsDto] === 'string';
}

function normalizeHttpUrl(value: string, label: string): string {
  const normalized = value.trim().replace(/\/$/, '');
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new BadRequestException(`${label} معتبر نیست`);
  }
}

/** Compare stored vs submitted site URLs without treating trailing slashes as a host change. */
function normalizeHttpUrlForCompare(value: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  try {
    return normalizeHttpUrl(normalized, 'url');
  } catch {
    return normalized.replace(/\/$/, '');
  }
}

function normalizeSecureServiceUrl(value: string, label: string): string {
  const normalized = normalizeHttpUrl(value, label);
  if (!normalized) return '';
  const url = new URL(normalized);
  const localDevelopment = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1', '::1'].includes(url.hostname.replace(/^\[|\]$/gu, ''));
  if (url.protocol !== 'https:' && !localDevelopment) {
    throw new BadRequestException(`${label} باید از HTTPS استفاده کند`);
  }
  return normalized;
}

function boundedInteger(value: string, label: string, min: number, max: number): string {
  if (!/^\d+$/.test(value.trim())) throw new BadRequestException(`${label} باید عدد صحیح باشد`);
  const number = Number(value);
  if (number < min || number > max) throw new BadRequestException(`${label} باید بین ${min} و ${max} باشد`);
  return String(number);
}

function normalizeLoginPath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) return 'wp-admin';
  if (normalized.includes('..') || normalized.includes('?') || normalized.includes('#') || normalized.includes('\\') || !/^[a-zA-Z0-9/_-]+$/.test(normalized)) {
    throw new BadRequestException('مسیر ورود WordPress معتبر نیست');
  }
  return normalized;
}

function normalizeCoverTemplate(value: string): string {
  let template: Record<string, unknown>;
  try {
    template = JSON.parse(value) as Record<string, unknown>;
  } catch {
    // Upgrade the former free-text image prompt to the visual template format.
    return DEFAULT_COVER_TEMPLATE;
  }

  const layers = Array.isArray(template.layers) ? template.layers : [];
  if (template.version !== 1 || layers.length > 30) {
    throw new BadRequestException('ساختار قالب تصویری معتبر نیست یا تعداد لایه‌ها بیش از ۳۰ است');
  }

  const allowedTypes = new Set(['featured-image', 'author-image', 'text', 'image', 'gradient']);
  const allowedBindings = new Set(['title', 'lead', 'author', 'category', 'reading_time', 'summary', 'link', 'source', 'custom']);
  for (const item of layers) {
    const layer = cleanObject(item);
    if (typeof layer.id !== 'string' || !layer.id || typeof layer.name !== 'string' || !allowedTypes.has(String(layer.type))) {
      throw new BadRequestException('یکی از لایه‌های قالب تصویری معتبر نیست');
    }
    if (layer.type === 'text' && !allowedBindings.has(String(layer.binding))) {
      throw new BadRequestException('پارامتر متنی یکی از لایه‌ها معتبر نیست');
    }
    for (const key of ['x', 'y', 'width', 'height', 'opacity']) {
      const number = Number(layer[key]);
      if (!Number.isFinite(number) || number < 0 || number > 100) {
        throw new BadRequestException(`مقدار ${key} در قالب تصویری باید بین ۰ تا ۱۰۰ باشد`);
      }
    }
    if (typeof layer.content === 'string' && layer.content.length > 2000) {
      throw new BadRequestException('متن دلخواه هر لایه حداکثر ۲۰۰۰ کاراکتر است');
    }
    if (typeof layer.imageUrl === 'string' && layer.imageUrl) {
      const localImage = layer.imageUrl.startsWith('/publishing/settings/images/file/') && !layer.imageUrl.includes('..');
      if (!localImage) normalizeHttpUrl(layer.imageUrl, 'آدرس تصویر دلخواه');
    }
    if (layer.type === 'gradient') {
      for (const key of ['gradientFromOpacity', 'gradientToOpacity']) {
        const opacity = Number(layer[key] ?? 100);
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) throw new BadRequestException('شفافیت رنگ گرادینت باید بین ۰ تا ۱۰۰ باشد');
      }
      const angle = Number(layer.gradientAngle ?? 135);
      if (!Number.isFinite(angle) || angle < 0 || angle > 360) throw new BadRequestException('زاویهٔ گرادینت باید بین ۰ تا ۳۶۰ درجه باشد');
      for (const key of ['gradientFrom', 'gradientTo']) {
        if (typeof layer[key] !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(String(layer[key]))) throw new BadRequestException('رنگ گرادینت معتبر نیست');
      }
    }
  }

  const width = Number(template.width);
  const height = Number(template.height);
  if (![1080].includes(width) || ![1080, 1350, 1920].includes(height)) {
    throw new BadRequestException('اندازه خروجی قالب تصویری معتبر نیست');
  }
  return JSON.stringify({ ...template, width, height, layers });
}

function normalizeCoverTemplateLibrary(value: string, legacyTemplate: string): string {
  if (!value.trim()) {
    return JSON.stringify({
      version: 1,
      defaultTemplateId: 'default',
      templates: [{ id: 'default', name: 'قالب اصلی', template: JSON.parse(normalizeCoverTemplate(legacyTemplate)) }],
    });
  }
  let library: Record<string, unknown>;
  try { library = JSON.parse(value) as Record<string, unknown>; }
  catch { throw new BadRequestException('ساختار کتابخانه قالب‌های تصویری معتبر نیست'); }
  const rawTemplates = Array.isArray(library.templates) ? library.templates : [];
  if (library.version !== 1 || !rawTemplates.length || rawTemplates.length > 20) {
    throw new BadRequestException('کتابخانه قالب تصویری باید بین ۱ تا ۲۰ قالب معتبر داشته باشد');
  }
  const ids = new Set<string>();
  const templates = rawTemplates.map((raw, index) => {
    const item = cleanObject(raw);
    const id = String(item.id ?? '').trim();
    const name = String(item.name ?? '').trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(id) || ids.has(id)) {
      throw new BadRequestException(`شناسه قالب تصویری شماره ${index + 1} معتبر یا یکتا نیست`);
    }
    if (!name || name.length > 80) throw new BadRequestException(`نام قالب تصویری شماره ${index + 1} معتبر نیست`);
    ids.add(id);
    const template = JSON.parse(normalizeCoverTemplate(JSON.stringify(cleanObject(item.template)))) as Record<string, unknown>;
    return { id, name, template };
  });
  const requestedDefaultId = String(library.defaultTemplateId ?? '').trim();
  const defaultTemplateId = ids.has(requestedDefaultId) ? requestedDefaultId : templates[0].id;
  return JSON.stringify({ version: 1, defaultTemplateId, templates });
}

const FONT_VARIANTS = {
  thin: 100,
  'extra-light': 200,
  light: 300,
  regular: 400,
  medium: 500,
  'semi-bold': 600,
  bold: 700,
  'extra-bold': 800,
  black: 900,
} as const;

type FontVariant = keyof typeof FONT_VARIANTS;
export type FontRecord = { id: string; name: string; variant: FontVariant; weight: number; url?: string };

function normalizeFontVariant(value?: string): FontVariant {
  const normalized = String(value || 'regular').trim().toLowerCase().replace(/[ _]+/gu, '-');
  const aliases: Record<string, FontVariant> = {
    normal: 'regular',
    book: 'regular',
    semibold: 'semi-bold',
    demibold: 'semi-bold',
    extralight: 'extra-light',
    ultralight: 'extra-light',
    extrabold: 'extra-bold',
    ultrabold: 'extra-bold',
    heavy: 'black',
  };
  const variant = aliases[normalized] || normalized;
  if (!(variant in FONT_VARIANTS)) throw new BadRequestException('Variant فونت معتبر نیست');
  return variant as FontVariant;
}

function normalizeFontLibrary(value: string): string {
  try {
    const fonts = JSON.parse(value) as unknown;
    if (!Array.isArray(fonts) || fonts.length > 200) throw new Error();
    const normalized: FontRecord[] = [];
    for (const item of fonts) {
      const raw = typeof item === 'string' ? { id: `legacy-${item}`, name: item } : item as Record<string, unknown>;
      const name = String(raw?.name ?? '').trim();
      if (!/^[\w\u0600-\u06ff -]{1,80}$/u.test(name)) continue;
      const id = String(raw?.id ?? `font-${name}`).trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      const rawUrl = raw?.url ? String(raw.url).trim() : '';
      const url = rawUrl.startsWith('/publishing/settings/fonts/file/') && !rawUrl.includes('..') ? rawUrl : (rawUrl ? normalizeHttpUrl(rawUrl, 'آدرس فونت') : undefined);
      if (name.toLowerCase() === 'vazirmatn' || id === 'vazirmatn') continue;
      const variant = normalizeFontVariant(typeof raw?.variant === 'string' ? raw.variant : 'regular');
      const weight = FONT_VARIANTS[variant];
      if (!normalized.some((font) => font.name.toLowerCase() === name.toLowerCase() && font.variant === variant)) {
        normalized.push({ id, name, variant, weight, ...(url ? { url } : {}) });
      }
    }
    return JSON.stringify([{ id: 'vazirmatn', name: 'Vazirmatn', variant: 'regular', weight: 400 }, ...normalized]);
  } catch {
    // A malformed legacy value must never block saving unrelated tabs. Reset it
    // to the safe built-in font; custom fonts can be added again from the UI.
    return JSON.stringify([{ id: 'vazirmatn', name: 'Vazirmatn', variant: 'regular', weight: 400 }]);
  }
}

@Injectable()
export class PublishingSettingsService implements OnModuleInit {
  private readonly logger = new Logger(PublishingSettingsService.name);
  /**
   * Settings are edited from several independent tabs. Serialize writes per
   * tenant so two quick requests cannot both read the same old JSON and then
   * erase one another's changes. The lock is deliberately scoped to this
   * service instance; the database transaction remains the source of truth.
   */
  private readonly saveLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretProtectionService,
    @Optional() private readonly gapGpt?: GapGptClient,
  ) {}

  async onModuleInit() {
    await this.ensurePlatformAiSettings().catch((error) => {
      this.logger.warn(`Platform AI settings bootstrap skipped: ${error instanceof Error ? error.message : error}`);
    });
    await this.ensurePlatformSourceFetchSettings().catch((error) => {
      this.logger.warn(`Platform source-fetch settings bootstrap skipped: ${error instanceof Error ? error.message : error}`);
    });
  }

  private storagePath() { return process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'); }

  async addFont(tenantId: string, file: { originalname: string; buffer: Buffer }, requestedName?: string, requestedVariant?: string): Promise<FontRecord> {
    if (!file) throw new BadRequestException('فایل فونت انتخاب نشده است');
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.woff2', '.woff', '.ttf', '.otf'].includes(ext)) throw new BadRequestException('فرمت فونت باید woff2، woff، ttf یا otf باشد');
    if (!file.buffer?.length || file.buffer.length > 10 * 1024 * 1024) throw new BadRequestException('حجم فونت حداکثر ۱۰ مگابایت است');
    const name = (requestedName || path.basename(file.originalname, ext)).trim();
    if (!/^[\w\u0600-\u06ff -]{1,80}$/u.test(name) || name.toLowerCase() === 'vazirmatn') throw new BadRequestException('نام فونت معتبر نیست');
    const variant = normalizeFontVariant(requestedVariant);
    const id = randomUUID();
    const filename = `${id}${ext}`;
    const dir = this.tenantAssetDirectory('fonts', tenantId);
    await this.writeTenantAsset(dir, filename, file.buffer, 'فونت');
    const current = await this.getRaw(tenantId);
    const library = JSON.parse(normalizeFontLibrary(current.social_font_library || DEFAULTS.social_font_library!)) as FontRecord[];
    const record: FontRecord = { id, name, variant, weight: FONT_VARIANTS[variant], url: `/publishing/settings/fonts/file/${tenantId}/${filename}` };
    const replaced = library.find((font) => font.name.toLowerCase() === name.toLowerCase() && font.variant === variant);
    const next = [...library.filter((font) => font.name.toLowerCase() !== name.toLowerCase() || font.variant !== variant), record];
    await this.save(tenantId, { social_font_library: JSON.stringify(next) });
    if (replaced?.url?.startsWith(`/publishing/settings/fonts/file/${tenantId}/`)) {
      await fs.rm(path.join(dir, path.basename(replaced.url)), { force: true }).catch(() => undefined);
    }
    return record;
  }

  async removeFont(tenantId: string, id: string): Promise<void> {
    if (id === 'vazirmatn') throw new BadRequestException('فونت Vazirmatn قابل حذف نیست');
    const current = await this.getRaw(tenantId);
    const library = JSON.parse(normalizeFontLibrary(current.social_font_library || DEFAULTS.social_font_library!)) as FontRecord[];
    const found = library.find((font) => font.id === id);
    if (!found) throw new NotFoundException('فونت پیدا نشد');
    await this.save(tenantId, { social_font_library: JSON.stringify(library.filter((font) => font.id !== id)) });
    if (found.url) {
      const tenantPrefix = `/publishing/settings/fonts/file/${tenantId}/`;
      // Legacy assets were stored in a shared directory without ownership
      // metadata. Keep them readable rather than risking deletion of a file
      // referenced by another organization.
      if (found.url.startsWith(tenantPrefix)) {
        await fs.rm(path.join(this.tenantAssetDirectory('fonts', tenantId), path.basename(found.url)), { force: true }).catch(() => undefined);
      }
    }
  }

  async renameFontFamily(tenantId: string, id: string, requestedName: string): Promise<FontRecord[]> {
    if (id === 'vazirmatn') throw new BadRequestException('نام فونت Vazirmatn قابل ویرایش نیست');
    const name = requestedName.trim();
    if (!/^[\w\u0600-\u06ff -]{1,80}$/u.test(name) || name.toLowerCase() === 'vazirmatn') throw new BadRequestException('نام فونت معتبر نیست');
    const current = await this.getRaw(tenantId);
    const library = JSON.parse(normalizeFontLibrary(current.social_font_library || DEFAULTS.social_font_library!)) as FontRecord[];
    const found = library.find((font) => font.id === id);
    if (!found) throw new NotFoundException('فونت پیدا نشد');
    const oldName = found.name;
    if (oldName.toLowerCase() === name.toLowerCase()) return library;
    if (library.some((font) => font.name.toLowerCase() === name.toLowerCase() && font.name.toLowerCase() !== oldName.toLowerCase())) {
      throw new BadRequestException('خانواده فونتی با این نام وجود دارد');
    }
    const next = library.map((font) => font.name.toLowerCase() === oldName.toLowerCase() ? { ...font, name } : font);
    await this.save(tenantId, { social_font_library: JSON.stringify(next) });
    return next;
  }

  async fontFile(tenantId: string, filename: string): Promise<{ buffer: Buffer; contentType: string }> {
    this.assertAssetPath(tenantId, filename, /\.(woff2?|ttf|otf)$/i);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.woff2' ? 'font/woff2' : ext === '.woff' ? 'font/woff' : ext === '.ttf' ? 'font/ttf' : 'font/otf';
    try { return { buffer: await fs.readFile(path.join(this.tenantAssetDirectory('fonts', tenantId), filename)), contentType }; } catch { throw new NotFoundException(); }
  }

  async legacyFontFile(filename: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!/^[a-f0-9-]+\.(woff2?|ttf|otf)$/i.test(filename)) throw new NotFoundException();
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.woff2' ? 'font/woff2' : ext === '.woff' ? 'font/woff' : ext === '.ttf' ? 'font/ttf' : 'font/otf';
    try { return { buffer: await fs.readFile(path.join(this.storagePath(), 'fonts', filename)), contentType }; } catch { throw new NotFoundException(); }
  }

  async addImage(tenantId: string, file: { originalname: string; mimetype?: string; buffer: Buffer }): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('فایل تصویر انتخاب نشده است');
    const ext = path.extname(file.originalname).toLowerCase();
    const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
    if (!contentTypes[ext]) throw new BadRequestException('فرمت تصویر باید JPG، PNG، WebP یا AVIF باشد');
    if (!file.buffer?.length || file.buffer.length > 15 * 1024 * 1024) throw new BadRequestException('حجم تصویر حداکثر ۱۵ مگابایت است');
    if (file.mimetype && file.mimetype.toLowerCase() !== contentTypes[ext]) throw new BadRequestException('پسوند و نوع فایل تصویر با یکدیگر سازگار نیستند');
    if (!this.hasImageSignature(file.buffer, contentTypes[ext])) throw new BadRequestException('محتوای فایل تصویر معتبر نیست');
    const filename = `${randomUUID()}${ext}`;
    const dir = this.tenantAssetDirectory('cover-images', tenantId);
    await this.writeTenantAsset(dir, filename, file.buffer, 'تصویر');
    return { url: `/publishing/settings/images/file/${tenantId}/${filename}` };
  }

  async inferCoverTemplateFromSample(
    tenantId: string,
    imageUrl: string,
  ): Promise<{ name: string; template: ReturnType<typeof normalizeInferredCoverTemplate>; usedAi: boolean }> {
    const prefix = `/publishing/settings/images/file/${tenantId}/`;
    if (!imageUrl.startsWith(prefix) || imageUrl.includes('..')) {
      throw new BadRequestException('تصویر نمونه باید از فایل‌های همین سازمان باشد');
    }
    const filename = imageUrl.slice(prefix.length);
    const file = await this.imageFile(tenantId, filename);
    const measured = readRasterImageSize(file.buffer, file.contentType);
    const canvas = resolveCoverCanvasSize(measured?.width || 1080, measured?.height || 1080);
    const fallback = fallbackCoverTemplateFromSample(canvas);

    try {
      const dataUrl = `data:${file.contentType};base64,${file.buffer.toString('base64')}`;
      if (dataUrl.length > 3_500_000) {
        return { name: 'قالب از تصویر نمونه', template: fallback, usedAi: false };
      }
      const settings = await this.getRaw(tenantId);
      if (!this.gapGpt) {
        return { name: 'قالب از تصویر نمونه', template: fallback, usedAi: false };
      }
      const inferred = await this.gapGpt.inferCoverTemplateFromSample(settings, { imageDataUrl: dataUrl, canvas });
      return {
        name: 'قالب از تصویر نمونه',
        template: normalizeInferredCoverTemplate(inferred, canvas),
        usedAi: true,
      };
    } catch (error) {
      this.logger.warn(`Cover template inference fell back: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { name: 'قالب از تصویر نمونه', template: fallback, usedAi: false };
    }
  }

  async removeImage(tenantId: string, url: string | null | undefined): Promise<void> {
    const prefix = `/publishing/settings/images/file/${tenantId}/`;
    if (!url?.startsWith(prefix)) return;
    const [articleReferences, settings] = await Promise.all([
      this.prisma.socialArticle.count({
        where: {
          tenantId,
          OR: [{ featuredImageUrl: url }, { generatedImageUrl: url }, { authorImageUrl: url }],
        },
      }),
      this.getRaw(tenantId),
    ]);
    if (articleReferences > 0 || Object.values(settings).some((value) => typeof value === 'string' && value.includes(url))) return;
    const filename = url.slice(prefix.length);
    this.assertAssetPath(tenantId, filename, /\.(jpe?g|png|webp|avif)$/i);
    try {
      await fs.unlink(path.join(this.tenantAssetDirectory('cover-images', tenantId), filename));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'ENOENT') throw error;
    }
  }

  async imageFile(tenantId: string, filename: string): Promise<{ buffer: Buffer; contentType: string }> {
    this.assertAssetPath(tenantId, filename, /\.(jpe?g|png|webp|avif)$/i);
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
    try { return { buffer: await fs.readFile(path.join(this.tenantAssetDirectory('cover-images', tenantId), filename)), contentType: contentTypes[ext] }; } catch { throw new NotFoundException(); }
  }

  async legacyImageFile(filename: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!/^[a-f0-9-]+\.(jpe?g|png|webp|avif)$/i.test(filename)) throw new NotFoundException();
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
    try { return { buffer: await fs.readFile(path.join(this.storagePath(), 'cover-images', filename)), contentType: contentTypes[ext] }; } catch { throw new NotFoundException(); }
  }

  private hasImageSignature(buffer: Buffer, contentType: string): boolean {
    if (contentType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (contentType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (contentType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (contentType === 'image/avif') return buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp' && /(?:avif|avis)/u.test(buffer.toString('ascii', 8, Math.min(buffer.length, 40)));
    return false;
  }

  private tenantAssetDirectory(kind: 'fonts' | 'cover-images', tenantId: string): string {
    if (!/^[a-zA-Z0-9_-]{10,64}$/u.test(tenantId)) throw new NotFoundException();
    return path.join(this.storagePath(), kind, tenantId);
  }

  private async writeTenantAsset(directory: string, filename: string, buffer: Buffer, label: 'فونت' | 'تصویر'): Promise<void> {
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, filename), buffer);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (['EACCES', 'EPERM', 'EROFS', 'ENOSPC'].includes(code)) {
        throw new BadRequestException(`ذخیره‌سازی ${label} در سرور ممکن نیست. دسترسی و فضای STORAGE_PATH را بررسی کنید.`);
      }
      throw new BadRequestException(`آپلود ${label} در سرور انجام نشد. دوباره تلاش کنید.`);
    }
  }

  private assertAssetPath(tenantId: string, filename: string, extension: RegExp): void {
    if (!/^[a-zA-Z0-9_-]{10,64}$/u.test(tenantId) || !/^[a-f0-9-]+\.[a-z0-9]+$/iu.test(filename) || !extension.test(filename)) {
      throw new NotFoundException();
    }
  }

  private async loadPublishingSources(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const tenantSettings = cleanObject(tenant?.settings);
    const publishing = cleanObject(tenantSettings.publishing);
    const legacyFlat = tenantSettings;
    let moduleSettings: Record<string, unknown> = {};
    try {
      const moduleRow = await (this.prisma as PrismaService & {
        tenantModule?: { findUnique: (args: unknown) => Promise<{ settings?: unknown } | null> };
      }).tenantModule?.findUnique({
        where: { tenantId_moduleId: { tenantId, moduleId: 'smart-publishing' } },
        select: { settings: true },
      });
      moduleSettings = cleanObject(moduleRow?.settings);
    } catch {
      moduleSettings = {};
    }
    return { publishing, legacyFlat, moduleSettings };
  }

  async getRaw(tenantId: string): Promise<PublishingSettings> {
    const tenant = await this.getTenantStoredRaw(tenantId);
    const globalAi = await this.getGlobalAiRaw();
    const hasPlatformAi = Boolean(globalAi.gapgpt_base_url?.trim() || globalAi.gapgpt_api_key?.trim());
    const aiSettings: PublishingSettings = {};
    for (const key of AI_SETTING_KEYS) {
      aiSettings[key] = hasPlatformAi ? globalAi[key] : tenant[key];
    }
    const withoutAi = { ...tenant };
    for (const key of AI_SETTING_KEYS) delete withoutAi[key];
    return { ...withoutAi, ...aiSettings };
  }

  async getTenantStoredRaw(tenantId: string): Promise<PublishingSettings> {
    const { publishing, legacyFlat, moduleSettings } = await this.loadPublishingSources(tenantId);
    const result: PublishingSettings = { ...DEFAULTS };
    for (const key of PUBLISHING_SETTING_KEYS) {
      const publishingValue = publishing[key];
      const moduleValue = moduleSettings[key];
      const moduleValueIsEmptyDefault = typeof moduleValue === 'string'
        && !moduleValue.trim()
        && typeof legacyFlat[key] === 'string'
        && Boolean(legacyFlat[key]?.trim());
      const legacyValue = moduleValueIsEmptyDefault ? legacyFlat[key] : (moduleValue ?? legacyFlat[key]);
      const value = publishingValue ?? legacyValue;
      if (typeof value !== 'string') continue;
      if (!SECRET_KEYS.has(key) && DEFAULT_WHEN_EMPTY.has(key) && !value.trim()) continue;
      result[key] = SECRET_KEYS.has(key) ? this.secrets.decrypt(value) : value;
    }
    const legacyPrompt = moduleSettings.news_translation_prompt ?? legacyFlat.news_translation_prompt;
    if (typeof legacyPrompt === 'string') {
      result.news_summary_prompt ||= legacyPrompt;
      result.news_full_translation_prompt ||= legacyPrompt;
    }
    return result;
  }

  async getPublic(tenantId: string): Promise<Record<string, string>> {
    const raw = await this.getRaw(tenantId);
    const result: Record<string, string> = {};
    for (const key of PUBLISHING_SETTING_KEYS) {
      const value = raw[key] ?? '';
      result[key] = SECRET_KEYS.has(key) ? '' : value;
      if (SECRET_KEYS.has(key)) result[`${key}_configured`] = value ? 'true' : 'false';
    }
    return result;
  }

  private async loadPlatformAiStored(): Promise<Record<string, string>> {
    if (!this.prisma.platformConfig?.findUnique) return {};
    let row: { settings?: unknown } | null = null;
    try {
      row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
    } catch (error) {
      this.logger.warn(`Platform AI settings could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`);
      return {};
    }
    const ai = cleanObject(cleanObject(row?.settings).ai);
    const result: Record<string, string> = {};
    for (const key of AI_SETTING_KEYS) {
      const value = ai[key];
      if (typeof value !== 'string') continue;
      result[key] = SECRET_KEYS.has(key) ? this.secrets.decrypt(value) : value;
    }
    return result;
  }

  async getGlobalAiRaw(): Promise<PublishingSettings> {
    const stored = await this.loadPlatformAiStored();
    const result: PublishingSettings = {};
    for (const key of AI_SETTING_KEYS) {
      const value = stored[key];
      if (typeof value === 'string' && (!SECRET_KEYS.has(key) || value.trim())) {
        if (!value.trim() && DEFAULT_WHEN_EMPTY.has(key)) continue;
        result[key] = value;
      }
    }
    for (const key of AI_SETTING_KEYS) {
      if (result[key] === undefined && DEFAULTS[key]) result[key] = DEFAULTS[key];
    }
    for (const [key, value] of Object.entries(DEFAULT_NEWS_PROCESSING_PROMPTS)) {
      if (!String(result[key as AiSettingKey] ?? '').trim()) {
        result[key as AiSettingKey] = value;
      }
    }
    return result;
  }

  async getGlobalAiPublic(): Promise<Record<string, string>> {
    const raw = await this.getGlobalAiRaw();
    const result: Record<string, string> = {};
    for (const key of AI_SETTING_KEYS) {
      const value = raw[key] ?? '';
      result[key] = SECRET_KEYS.has(key) ? '' : value;
      if (SECRET_KEYS.has(key)) result[`${key}_configured`] = value ? 'true' : 'false';
    }
    return result;
  }

  async saveGlobalAi(input: UpdatePlatformAiSettingsDto): Promise<Record<string, string>> {
    const current = await this.getGlobalAiRaw();
    const next: PublishingSettings = { ...current };

    for (const key of AI_SETTING_KEYS) {
      if (typeof input[key as keyof UpdatePlatformAiSettingsDto] !== 'string') continue;
      const value = String(input[key as keyof UpdatePlatformAiSettingsDto] ?? '').trim();
      if (SECRET_KEYS.has(key) && !value) continue;
      next[key] = value;
    }

    const has = (key: AiSettingKey) => typeof input[key as keyof UpdatePlatformAiSettingsDto] === 'string';
    if (has('gapgpt_base_url')) next.gapgpt_base_url = normalizeSecureServiceUrl(next.gapgpt_base_url ?? '', 'آدرس GapGPT');

    const secretsToClear = new Set<PublishingSettingKey>();
    const gapGptHostChanged = has('gapgpt_base_url')
      && String(next.gapgpt_base_url ?? '').trim() !== String(current.gapgpt_base_url ?? '').trim();
    const gapGptSecretProvided = has('gapgpt_api_key') && Boolean(String(input.gapgpt_api_key ?? '').trim());
    if (gapGptHostChanged && !gapGptSecretProvided) {
      next.gapgpt_api_key = '';
      secretsToClear.add('gapgpt_api_key');
    }

    let row: { settings?: unknown } | null = null;
    if (this.prisma.platformConfig?.findUnique) {
      try {
        row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
      } catch (error) {
        this.logger.warn(`Platform AI settings could not be read before save: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    const settings = cleanObject(row?.settings);
    const storedAi: Record<string, string> = { ...cleanObject(settings.ai) as Record<string, string> };
    for (const key of AI_SETTING_KEYS) {
      if (secretsToClear.has(key)) {
        delete storedAi[key];
        continue;
      }
      if (typeof input[key as keyof UpdatePlatformAiSettingsDto] !== 'string') continue;
      const value = next[key] ?? '';
      if (SECRET_KEYS.has(key) && !value) continue;
      storedAi[key] = SECRET_KEYS.has(key) ? this.secrets.encrypt(value) : value;
    }

    await this.prisma.platformConfig?.upsert?.({
      where: { id: 'default' },
      create: { settings: inputJson({ ...settings, ai: storedAi }) },
      update: { settings: inputJson({ ...settings, ai: storedAi }) },
    });
    return this.getGlobalAiPublic();
  }

  private async loadPlatformSourceFetchStored(): Promise<Record<string, string>> {
    if (!this.prisma.platformConfig?.findUnique) return {};
    let row: { settings?: unknown } | null = null;
    try {
      row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
    } catch (error) {
      this.logger.warn(`Platform source-fetch settings could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`);
      return {};
    }
    const sourceFetch = cleanObject(cleanObject(row?.settings).source_fetch);
    const result: Record<string, string> = {};
    for (const key of SOURCE_FETCH_SETTING_KEYS) {
      const value = sourceFetch[key];
      if (typeof value !== 'string') continue;
      result[key] = SOURCE_FETCH_SECRET_KEYS.has(key) ? this.secrets.decrypt(value) : value;
    }
    return result;
  }

  private envSourceFetchFallback(): SourceFetchSettings {
    const url = String(process.env.SOURCE_FETCH_BRIDGE_URL || '').trim();
    const secret = String(process.env.SOURCE_FETCH_BRIDGE_SECRET || '').trim();
    const result: SourceFetchSettings = {};
    if (url) result.source_fetch_bridge_url = url;
    if (secret) result.source_fetch_bridge_secret = secret;
    return result;
  }

  async getGlobalSourceFetchRaw(): Promise<SourceFetchSettings> {
    const stored = await this.loadPlatformSourceFetchStored();
    return {
      source_fetch_bridge_url: stored.source_fetch_bridge_url || '',
      source_fetch_bridge_secret: stored.source_fetch_bridge_secret || '',
      source_fetch_news_via_bridge: stored.source_fetch_news_via_bridge === 'true' ? 'true' : 'false',
    };
  }

  async getResolvedSourceFetchBridge(): Promise<{ url: string; secret: string }> {
    const policy = await this.getSourceFetchPolicy();
    return { url: policy.url, secret: policy.secret };
  }

  async getSourceFetchPolicy(): Promise<{ url: string; secret: string; newsViaBridge: boolean }> {
    const raw = await this.getGlobalSourceFetchRaw();
    const url = String(raw.source_fetch_bridge_url || '').trim().replace(/\/+$/u, '');
    const secret = String(raw.source_fetch_bridge_secret || '').trim();
    return { url, secret, newsViaBridge: raw.source_fetch_news_via_bridge === 'true' };
  }

  async getGlobalSourceFetchPublic(): Promise<Record<string, string>> {
    const raw = await this.getGlobalSourceFetchRaw();
    const result: Record<string, string> = {};
    for (const key of SOURCE_FETCH_SETTING_KEYS) {
      const value = raw[key] ?? '';
      result[key] = SOURCE_FETCH_SECRET_KEYS.has(key) ? '' : value;
      if (SOURCE_FETCH_SECRET_KEYS.has(key)) {
        result[`${key}_configured`] = value ? 'true' : 'false';
      }
    }
    return result;
  }

  async saveGlobalSourceFetch(input: UpdatePlatformSourceFetchSettingsDto): Promise<Record<string, string>> {
    const stored = await this.loadPlatformSourceFetchStored();
    const next: SourceFetchSettings = { ...stored };

    for (const key of SOURCE_FETCH_SETTING_KEYS) {
      if (typeof input[key as keyof UpdatePlatformSourceFetchSettingsDto] !== 'string') continue;
      const value = String(input[key as keyof UpdatePlatformSourceFetchSettingsDto] ?? '').trim();
      if (SOURCE_FETCH_SECRET_KEYS.has(key) && !value) continue;
      next[key] = key === 'source_fetch_news_via_bridge' ? (value === 'true' ? 'true' : 'false') : value;
    }

    if (typeof input.source_fetch_bridge_url === 'string') {
      next.source_fetch_bridge_url = normalizeSecureServiceUrl(next.source_fetch_bridge_url ?? '', 'آدرس Worker دریافت منبع');
    }

    let row: { settings?: unknown } | null = null;
    if (this.prisma.platformConfig?.findUnique) {
      try {
        row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
      } catch (error) {
        this.logger.warn(`Platform source-fetch settings could not be read before save: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    const settings = cleanObject(row?.settings);
    const storedSourceFetch: Record<string, string> = { ...cleanObject(settings.source_fetch) as Record<string, string> };
    for (const key of SOURCE_FETCH_SETTING_KEYS) {
      if (typeof input[key as keyof UpdatePlatformSourceFetchSettingsDto] !== 'string') continue;
      const value = next[key] ?? '';
      if (SOURCE_FETCH_SECRET_KEYS.has(key) && !value) continue;
      storedSourceFetch[key] = SOURCE_FETCH_SECRET_KEYS.has(key) ? this.secrets.encrypt(value) : value;
    }

    await this.prisma.platformConfig?.upsert?.({
      where: { id: 'default' },
      create: { settings: inputJson({ ...settings, source_fetch: storedSourceFetch }) },
      update: { settings: inputJson({ ...settings, source_fetch: storedSourceFetch }) },
    });
    return this.getGlobalSourceFetchPublic();
  }

  mergeForGlobalSourceFetchTest(
    current: SourceFetchSettings,
    input: UpdatePlatformSourceFetchSettingsDto,
  ): SourceFetchSettings {
    const merged: SourceFetchSettings = { ...current };
    for (const key of SOURCE_FETCH_SETTING_KEYS) {
      const candidate = input[key as keyof UpdatePlatformSourceFetchSettingsDto];
      if (typeof candidate !== 'string') continue;
      const value = candidate.trim();
      if (SOURCE_FETCH_SECRET_KEYS.has(key) && !value) continue;
      merged[key] = value;
    }
    if (typeof input.source_fetch_bridge_url === 'string' && merged.source_fetch_bridge_url) {
      merged.source_fetch_bridge_url = normalizeSecureServiceUrl(merged.source_fetch_bridge_url, 'آدرس Worker دریافت منبع');
    }
    return merged;
  }

  private async loadPlatformCatalogHealthStored(): Promise<Record<string, unknown>> {
    if (!this.prisma.platformConfig?.findUnique) return {};
    try {
      const row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
      const settings = cleanObject(row?.settings);
      return cleanObject(settings.catalog_health);
    } catch (error) {
      this.logger.warn(`Platform catalog health settings could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`);
      return {};
    }
  }

  async getGlobalCatalogHealthPublic(): Promise<Record<string, string>> {
    const stored = await this.loadPlatformCatalogHealthStored();
    return {
      catalog_health_enabled: parseCatalogHealthEnabled(stored.enabled) ? 'true' : 'false',
      catalog_health_interval_hours: String(normalizeCatalogHealthIntervalHours(stored.interval_hours)),
      catalog_health_last_run_at: typeof stored.last_run_at === 'string' ? stored.last_run_at : '',
    };
  }

  async saveGlobalCatalogHealth(input: UpdatePlatformCatalogHealthSettingsDto): Promise<Record<string, string>> {
    const stored = await this.loadPlatformCatalogHealthStored();
    const current = await this.getGlobalCatalogHealthPublic();
    const next = {
      enabled: input.catalog_health_enabled !== undefined
        ? input.catalog_health_enabled === 'true'
        : parseCatalogHealthEnabled(stored.enabled),
      interval_hours: input.catalog_health_interval_hours !== undefined
        ? normalizeCatalogHealthIntervalHours(input.catalog_health_interval_hours)
        : normalizeCatalogHealthIntervalHours(stored.interval_hours ?? current.catalog_health_interval_hours),
      last_run_at: typeof stored.last_run_at === 'string' ? stored.last_run_at : '',
    };

    let row: { settings?: unknown } | null = null;
    if (this.prisma.platformConfig?.findUnique) {
      try {
        row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
      } catch {
        row = null;
      }
    }
    const settings = cleanObject(row?.settings);
    await this.prisma.platformConfig?.upsert?.({
      where: { id: 'default' },
      create: { settings: inputJson({ ...settings, catalog_health: next }) },
      update: { settings: inputJson({ ...settings, catalog_health: next }) },
    });
    return this.getGlobalCatalogHealthPublic();
  }

  async markCatalogHealthLastRun(at = new Date()) {
    const stored = await this.loadPlatformCatalogHealthStored();
    const current = await this.getGlobalCatalogHealthPublic();
    const next = {
      enabled: parseCatalogHealthEnabled(stored.enabled),
      interval_hours: normalizeCatalogHealthIntervalHours(stored.interval_hours ?? current.catalog_health_interval_hours),
      last_run_at: at.toISOString(),
    };
    let row: { settings?: unknown } | null = null;
    if (this.prisma.platformConfig?.findUnique) {
      try {
        row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
      } catch {
        row = null;
      }
    }
    const settings = cleanObject(row?.settings);
    await this.prisma.platformConfig?.upsert?.({
      where: { id: 'default' },
      create: { settings: inputJson({ ...settings, catalog_health: next }) },
      update: { settings: inputJson({ ...settings, catalog_health: next }) },
    });
  }

  private async loadLearnedSourceLanguagesStored(): Promise<string[]> {
    if (!this.prisma.platformConfig?.findUnique) return [];
    try {
      const row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
      const settings = cleanObject(row?.settings);
      const stored = Array.isArray(settings.source_languages) ? settings.source_languages : [];
      return stored.map((item) => normalizeSourceLanguage(item)).filter((code) => code !== 'auto');
    } catch (error) {
      this.logger.warn(`Learned source languages could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`);
      return [];
    }
  }

  async listLearnedSourceLanguages(): Promise<string[]> {
    return this.loadLearnedSourceLanguagesStored();
  }

  async rememberSourceLanguages(codes: string[]): Promise<string[]> {
    const incoming = codes.map((code) => normalizeSourceLanguage(code)).filter((code) => code !== 'auto');
    if (!incoming.length) return this.listLearnedSourceLanguages();

    const learned = mergeSourceLanguageCatalog([...(await this.loadLearnedSourceLanguagesStored()), ...incoming])
      .filter((code) => code !== 'auto');
    let row: { settings?: unknown } | null = null;
    if (this.prisma.platformConfig?.findUnique) {
      try {
        row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
      } catch {
        row = null;
      }
    }
    const settings = cleanObject(row?.settings);
    await this.prisma.platformConfig?.upsert?.({
      where: { id: 'default' },
      create: { settings: inputJson({ ...settings, source_languages: learned }) },
      update: { settings: inputJson({ ...settings, source_languages: learned }) },
    });
    return learned;
  }

  async ensurePlatformSourceFetchSettings() {
    if (!this.prisma.platformConfig?.findUnique || !this.prisma.platformConfig?.upsert) return;
    const stored = await this.loadPlatformSourceFetchStored();
    if (stored.source_fetch_bridge_url?.trim()) return;

    const envFallback = this.envSourceFetchFallback();
    if (!envFallback.source_fetch_bridge_url?.trim()) return;

    await this.saveGlobalSourceFetch({
      source_fetch_bridge_url: envFallback.source_fetch_bridge_url,
      source_fetch_bridge_secret: envFallback.source_fetch_bridge_secret,
    });
    this.logger.log('Migrated SOURCE_FETCH_BRIDGE_* env vars to platform Deska worker config');
  }

  async ensurePlatformAiSettings() {
    if (!this.prisma.platformConfig?.findUnique || !this.prisma.platformConfig?.upsert) return;
    const stored = await this.loadPlatformAiStored();
    if (stored.gapgpt_base_url?.trim() || stored.gapgpt_api_key?.trim()) return;

    const tenants = await this.prisma.tenant.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const tenant of tenants) {
      const legacy = await this.getTenantStoredRaw(tenant.id);
      if (legacy.gapgpt_base_url?.trim() || legacy.gapgpt_api_key?.trim()) {
        await this.saveGlobalAi({
          gapgpt_base_url: legacy.gapgpt_base_url,
          gapgpt_api_key: legacy.gapgpt_api_key,
          gapgpt_model: legacy.gapgpt_model,
          gapgpt_model_news_summary: legacy.gapgpt_model_news_summary,
          gapgpt_model_news_translation: legacy.gapgpt_model_news_translation,
          gapgpt_model_social: legacy.gapgpt_model_social,
          news_summary_prompt: legacy.news_summary_prompt,
          news_full_translation_prompt: legacy.news_full_translation_prompt,
          news_persian_rewrite_prompt: legacy.news_persian_rewrite_prompt,
          news_persian_full_rewrite_prompt: legacy.news_persian_full_rewrite_prompt,
        });
        this.logger.log(`Migrated AI settings from tenant ${tenant.id} to platform config`);
        return;
      }
    }
  }

  async save(tenantId: string, input: UpdatePublishingSettingsDto): Promise<Record<string, string>> {
    const previous = this.saveLocks.get(tenantId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.saveLocks.set(tenantId, queued);
    await previous;

    try {
      return await this.saveUnlocked(tenantId, input);
    } finally {
      release();
      if (this.saveLocks.get(tenantId) === queued) this.saveLocks.delete(tenantId);
    }
  }

  private async saveUnlocked(tenantId: string, input: UpdatePublishingSettingsDto): Promise<Record<string, string>> {
    const current = await this.getRaw(tenantId);
    const next: PublishingSettings = { ...current };

    for (const key of PUBLISHING_SETTING_KEYS) {
      if (AI_SETTING_KEY_SET.has(key)) continue;
      if (!isProvidedSetting(input, key)) continue;
      const value = String(input[key as keyof UpdatePublishingSettingsDto] ?? '').trim();
      if (SECRET_KEYS.has(key) && !value) continue;
      next[key] = value;
    }

    const has = (key: PublishingSettingKey) => isProvidedSetting(input, key) && !AI_SETTING_KEY_SET.has(key);
    if (has('wp_site_url')) next.wp_site_url = normalizeSecureServiceUrl(next.wp_site_url ?? '', 'آدرس WordPress');
    if (has('is_site_url')) next.is_site_url = normalizeSecureServiceUrl(next.is_site_url ?? '', 'آدرس سایت ایران‌سامانه');
    if (has('is_webservice_url')) next.is_webservice_url = normalizeSecureServiceUrl(next.is_webservice_url ?? '', 'آدرس وب‌سرویس ایران‌سامانه');
    if (has('ns_site_url')) next.ns_site_url = normalizeSecureServiceUrl(next.ns_site_url ?? '', 'آدرس سایت نستوه');
    if (has('ns_api_base_url')) next.ns_api_base_url = normalizeSecureServiceUrl(next.ns_api_base_url ?? '', 'آدرس REST API نستوه');
    if (has('destination_platform') && !['wordpress', 'iransamaneh', 'nastooh'].includes(String(next.destination_platform || 'wordpress'))) {
      throw new BadRequestException('پلتفرم سایت مقصد معتبر نیست');
    }
    if (has('social_public_media_base_url')) next.social_public_media_base_url = normalizeSecureServiceUrl(next.social_public_media_base_url ?? '', 'آدرس عمومی رسانه‌های اجتماعی');
    if (has('wp_login_path')) next.wp_login_path = normalizeLoginPath(next.wp_login_path ?? 'wp-admin');
    if (has('news_poll_interval_minutes')) next.news_poll_interval_minutes = boundedInteger(next.news_poll_interval_minutes?.trim() || '240', 'فاصله پایش', 5, 1440);
    if (has('news_max_age_days')) next.news_max_age_days = boundedInteger(next.news_max_age_days?.trim() || '10', 'حداکثر قدمت خبر', 1, 90);
    if (has('social_poll_interval_minutes')) next.social_poll_interval_minutes = boundedInteger(next.social_poll_interval_minutes?.trim() || '240', 'فاصله پایش استودیوی اجتماعی', 5, 1440);
    if (has('social_max_age_days')) next.social_max_age_days = boundedInteger(next.social_max_age_days?.trim() || '10', 'حداکثر قدمت مطلب اجتماعی', 1, 90);
    if (has('social_image_template')) next.social_image_template = normalizeCoverTemplate(next.social_image_template ?? DEFAULT_COVER_TEMPLATE);
    if (has('social_image_templates')) next.social_image_templates = normalizeCoverTemplateLibrary(next.social_image_templates ?? '', current.social_image_template ?? DEFAULT_COVER_TEMPLATE);
    if (has('social_auto_image_template_id') || has('social_image_templates')) {
      const library = JSON.parse(normalizeCoverTemplateLibrary(next.social_image_templates ?? '', next.social_image_template ?? DEFAULT_COVER_TEMPLATE)) as { defaultTemplateId: string; templates: Array<{ id: string }> };
      const requestedTemplateId = String(next.social_auto_image_template_id || '').trim();
      next.social_auto_image_template_id = library.templates.some((template) => template.id === requestedTemplateId)
        ? requestedTemplateId
        : library.defaultTemplateId;
    }
    if (has('wp_categories')) next.wp_categories = serializeWordPressCategories(next.wp_categories);
    // Canonicalize the font library only when that subtab is being saved.
    // Normalizing it during an unrelated save could silently replace a custom
    // or legacy library while the user is editing another tab.
    if (has('social_font_library')) {
      next.social_font_library = normalizeFontLibrary(next.social_font_library ?? DEFAULTS.social_font_library!);
    }
    if (has('wp_category_id') && next.wp_category_id && !/^\d+$/.test(next.wp_category_id)) {
      throw new BadRequestException('شناسه دسته‌بندی WordPress باید عدد صحیح باشد');
    }
    if (next.news_auto_publish === 'true' && next.news_auto_send_social === 'true') {
      throw new BadRequestException('انتشار خودکار در سایت و ارسال خودکار به استودیوی اجتماعی نمی‌توانند هم‌زمان فعال باشند');
    }

    const secretsToClear = new Set<PublishingSettingKey>();
    const wordPressHostChanged = has('wp_site_url')
      && normalizeHttpUrlForCompare(next.wp_site_url ?? '') !== normalizeHttpUrlForCompare(current.wp_site_url ?? '');
    const wordPressSecretProvided = has('wp_app_password') && Boolean(String(input.wp_app_password ?? '').trim());
    if (wordPressHostChanged && !wordPressSecretProvided) {
      next.wp_app_password = '';
      secretsToClear.add('wp_app_password');
    }

    const instagramAccountChanged = has('social_instagram_account_id')
      && String(next.social_instagram_account_id ?? '').trim() !== String(current.social_instagram_account_id ?? '').trim();
    const instagramSecretProvided = has('social_instagram_access_token') && Boolean(String(input.social_instagram_access_token ?? '').trim());
    if (instagramAccountChanged && !instagramSecretProvided) {
      next.social_instagram_access_token = '';
      secretsToClear.add('social_instagram_access_token');
    }

    const linkedinAuthorChanged = has('social_linkedin_author_urn')
      && String(next.social_linkedin_author_urn ?? '').trim() !== String(current.social_linkedin_author_urn ?? '').trim();
    const linkedinSecretProvided = has('social_linkedin_access_token') && Boolean(String(input.social_linkedin_access_token ?? '').trim());
    if (linkedinAuthorChanged && !linkedinSecretProvided) {
      next.social_linkedin_access_token = '';
      secretsToClear.add('social_linkedin_access_token');
    }

    const facebookPageChanged = has('social_facebook_page_id')
      && String(next.social_facebook_page_id ?? '').trim() !== String(current.social_facebook_page_id ?? '').trim();
    const facebookSecretProvided = has('social_facebook_page_access_token') && Boolean(String(input.social_facebook_page_access_token ?? '').trim());
    if (facebookPageChanged && !facebookSecretProvided) {
      next.social_facebook_page_access_token = '';
      secretsToClear.add('social_facebook_page_access_token');
    }

    const { publishing, legacyFlat, moduleSettings } = await this.loadPublishingSources(tenantId);
    const stored: Record<string, string | unknown> = {
      ...moduleSettings,
      ...publishing,
    };
    for (const key of PUBLISHING_SETTING_KEYS) {
      if (secretsToClear.has(key)) continue;
      const storedValue = stored[key];
      const storedValueIsEmptyDefault = typeof storedValue === 'string'
        && !storedValue.trim()
        && typeof legacyFlat[key] === 'string'
        && Boolean(legacyFlat[key]?.trim());
      if ((!(key in stored) || storedValueIsEmptyDefault) && typeof legacyFlat[key] === 'string') {
        const legacyValue = String(legacyFlat[key]);
        stored[key] = SECRET_KEYS.has(key) ? this.secrets.encrypt(legacyValue) : legacyValue;
      }
    }
    for (const key of PUBLISHING_SETTING_KEYS) {
      if (AI_SETTING_KEY_SET.has(key)) continue;
      if (secretsToClear.has(key)) {
        delete stored[key];
        continue;
      }
      if (!has(key)) continue;
      const value = next[key] ?? '';
      if (SECRET_KEYS.has(key) && !value) continue;
      stored[key] = SECRET_KEYS.has(key) ? this.secrets.encrypt(value) : value;
    }
    delete stored.news_translation_prompt;
    const remainingTenantSettings = { ...legacyFlat };
    for (const key of [...PUBLISHING_SETTING_KEYS, 'news_translation_prompt']) delete remainingTenantSettings[key];
    delete remainingTenantSettings.publishing;
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: inputJson({
          ...remainingTenantSettings,
          publishing: stored,
        }),
      },
    });
    return this.getPublic(tenantId);
  }

  mergeForGlobalAiTest(current: PublishingSettings, input: UpdatePlatformAiSettingsDto): PublishingSettings {
    const merged = { ...current };
    for (const key of AI_SETTING_KEYS) {
      const candidate = input[key as keyof UpdatePlatformAiSettingsDto];
      if (typeof candidate === 'string' && candidate.trim()) merged[key] = candidate.trim();
    }
    const gapGptHostChanged = Boolean(
      input.gapgpt_base_url?.trim()
      && input.gapgpt_base_url.trim() !== String(current.gapgpt_base_url ?? '').trim(),
    );
    if (gapGptHostChanged && !input.gapgpt_api_key?.trim()) merged.gapgpt_api_key = '';
    return merged;
  }

  mergeForTest(current: PublishingSettings, input: UpdatePublishingSettingsDto): PublishingSettings {
    const merged = { ...current };
    for (const key of PUBLISHING_SETTING_KEYS) {
      const candidate = input[key as keyof UpdatePublishingSettingsDto];
      if (typeof candidate === 'string' && candidate.trim()) merged[key] = candidate.trim();
    }
    if (typeof input.wp_site_url === 'string' && input.wp_site_url.trim()) {
      try {
        merged.wp_site_url = normalizeHttpUrl(input.wp_site_url.trim(), 'آدرس WordPress');
      } catch {
        merged.wp_site_url = input.wp_site_url.trim().replace(/\/$/, '');
      }
    }
    const gapGptHostChanged = Boolean(
      input.gapgpt_base_url?.trim()
      && input.gapgpt_base_url.trim() !== String(current.gapgpt_base_url ?? '').trim(),
    );
    if (gapGptHostChanged && !input.gapgpt_api_key?.trim()) merged.gapgpt_api_key = '';

    const submittedWpSiteUrl = typeof input.wp_site_url === 'string' ? normalizeHttpUrlForCompare(input.wp_site_url) : '';
    const storedWpSiteUrl = normalizeHttpUrlForCompare(current.wp_site_url ?? '');
    const wordPressHostChanged = Boolean(submittedWpSiteUrl && submittedWpSiteUrl !== storedWpSiteUrl);
    const wordPressSecretProvided = Boolean(String(input.wp_app_password ?? '').trim());
    if (wordPressHostChanged && !wordPressSecretProvided) merged.wp_app_password = '';
    const iranSamanehHostChanged = Boolean(
      input.is_site_url?.trim()
      && input.is_site_url.trim() !== String(current.is_site_url ?? '').trim(),
    );
    if (iranSamanehHostChanged && !input.is_password?.trim()) merged.is_password = '';
    const nastoohHostChanged = Boolean(
      input.ns_site_url?.trim()
      && input.ns_site_url.trim() !== String(current.ns_site_url ?? '').trim(),
    );
    if (nastoohHostChanged && !input.ns_password?.trim()) merged.ns_password = '';
    return merged;
  }

  async testDestinationSite(settings: PublishingSettings) {
    const platform = settings.destination_platform || 'wordpress';
    if (platform === 'iransamaneh') {
      const siteUrl = String(settings.is_site_url || '').trim();
      const webserviceUrl = String(settings.is_webservice_url || '').trim();
      const username = String(settings.is_username || '').trim();
      const password = String(settings.is_password || '').trim();
      if (!siteUrl || !webserviceUrl || !username || !password) {
        throw new BadRequestException('آدرس سایت، وب‌سرویس، نام کاربری و رمز عبور ایران‌سامانه الزامی است.');
      }
      normalizeSecureServiceUrl(siteUrl, 'آدرس سایت ایران‌سامانه');
      normalizeSecureServiceUrl(webserviceUrl, 'آدرس وب‌سرویس ایران‌سامانه');
      await this.pingPublicUrl(siteUrl, 'سایت ایران‌سامانه');
      return {
        ok: true as const,
        message: 'اطلاعات اتصال ایران‌سامانه تأیید شد. انتشار خودکار از این مسیر در به‌روزرسانی بعدی تکمیل می‌شود.',
      };
    }
    if (platform === 'nastooh') {
      const siteUrl = String(settings.ns_site_url || '').trim();
      const apiBaseUrl = String(settings.ns_api_base_url || '').trim();
      const username = String(settings.ns_username || '').trim();
      const password = String(settings.ns_password || '').trim();
      if (!siteUrl || !apiBaseUrl || !username || !password) {
        throw new BadRequestException('آدرس سایت، REST API، نام کاربری و رمز عبور نستوه الزامی است.');
      }
      normalizeSecureServiceUrl(siteUrl, 'آدرس سایت نستوه');
      normalizeSecureServiceUrl(apiBaseUrl, 'آدرس REST API نستوه');
      await this.pingPublicUrl(siteUrl, 'سایت نستوه');
      return {
        ok: true as const,
        message: 'اطلاعات اتصال نستوه تأیید شد. انتشار خودکار از این مسیر در به‌روزرسانی بعدی تکمیل می‌شود.',
      };
    }
    throw new BadRequestException('پلتفرم سایت مقصد پشتیبانی نمی‌شود.');
  }

  private async pingPublicUrl(url: string, label: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
      if (!response.ok && ![401, 403, 405].includes(response.status)) {
        throw new BadRequestException(`${label} پاسخ ${response.status} برگرداند.`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`اتصال به ${label} برقرار نشد. آدرس و دسترسی شبکه را بررسی کنید.`);
    } finally {
      clearTimeout(timer);
    }
  }

}
