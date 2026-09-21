import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { USAGE_METRIC_KEYS } from '@deska/shared';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishingSettingsService, SOURCE_FETCH_BRIDGE_MISSING_MESSAGE } from './publishing-settings.service';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { SourceReaderService } from './source-reader.service';
import { IntegrationHealthService } from '../../common/services/integration-health.service';
import { ContentWorkflowService } from '../../common/services/content-workflow.service';
import { UsageTrackingService } from '../../platform/usage/usage-tracking.service';

export type SocialNetwork = 'telegram' | 'instagram' | 'linkedin' | 'facebook';
type ImagePayload = { buffer: Buffer; contentType: string; extension: string };

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function graphVersion(value: string | undefined, fallback: string): string {
  const version = String(value || fallback).trim();
  if (!/^v?\d+\.\d+$/u.test(version)) throw new BadRequestException('نسخه Graph API معتبر نیست');
  return version.startsWith('v') ? version : `v${version}`;
}

function readImageDataUrl(value: string): ImagePayload {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/u.exec(value.trim());
  if (!match) throw new BadRequestException('تصویر باید PNG، JPEG یا WebP و به‌صورت data URL باشد');
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException('حجم تصویر بیش از ۱۵ مگابایت است');
  return { buffer, contentType, extension: contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg' };
}

function remoteImagePayload(buffer: Buffer, contentType: string): ImagePayload {
  const normalized = contentType.toLowerCase().split(';')[0];
  const extension = normalized === 'image/png' ? 'png' : normalized === 'image/webp' ? 'webp' : normalized === 'image/jpeg' ? 'jpg' : '';
  if (!extension) throw new BadRequestException('برای انتشار خودکار، تصویر شاخص باید PNG، JPEG یا WebP باشد');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException('حجم تصویر بیش از ۱۵ مگابایت است');
  return { buffer, contentType: normalized, extension };
}

async function publishableFeaturedImage(buffer: Buffer): Promise<ImagePayload> {
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException('حجم تصویر بیش از ۱۵ مگابایت است');
  const convert = (quality: number) => sharp(buffer, {
    animated: false,
    failOn: 'error',
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  try {
    let normalized = await convert(86);
    if (normalized.length > 9_000_000) normalized = await convert(65);
    const metadata = await sharp(normalized).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (!width || !height) throw new Error('invalid image dimensions');
    if (width / height > 20 || height / width > 20) {
      const targetWidth = Math.max(width, Math.ceil(height / 20));
      const targetHeight = Math.max(height, Math.ceil(width / 20));
      normalized = await sharp(normalized).extend({
        left: Math.floor((targetWidth - width) / 2),
        right: Math.ceil((targetWidth - width) / 2),
        top: Math.floor((targetHeight - height) / 2),
        bottom: Math.ceil((targetHeight - height) / 2),
        background: '#ffffff',
      }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
    if (!normalized.length || normalized.length > MAX_IMAGE_BYTES) throw new Error('normalized image is too large');
    return { buffer: normalized, contentType: 'image/jpeg', extension: 'jpg' };
  } catch {
    throw new BadRequestException('فرمت یا ابعاد تصویر شاخص برای انتشار قابل تبدیل نیست');
  }
}

function asArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}

const TELEGRAM_HTML_TAG = /<\/?(?:b|strong|i|em|u|ins|s|del|strike|code|pre|tg-spoiler|blockquote)\s*\/?>|<a\s+href=["']https?:\/\/[^"']+["']\s*>|<\/a>/giu;

function telegramHtml(value: string): string {
  // Preserve only Telegram's harmless formatting tags. Values such as a
  // title or summary are escaped unless they are part of the template itself.
  const tags: string[] = [];
  const tokenized = value.replace(TELEGRAM_HTML_TAG, (tag) => {
    tags.push(tag);
    return `__DESKA_TELEGRAM_TAG_${tags.length - 1}__`;
  });
  const escaped = tokenized.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
  return escaped.replace(/__DESKA_TELEGRAM_TAG_(\d+)__/gu, (_, index: string) => tags[Number(index)] || '');
}

function renderCaptionTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/giu, (match, key: string) => values[key] ?? match).trim();
}

function persianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

@Injectable()
export class SocialNetworkPublisherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly outbound: SourceReaderService,
    private readonly integrationHealth: IntegrationHealthService,
    private readonly workflow: ContentWorkflowService,
    private readonly usageTracking: UsageTrackingService,
  ) {}

  private storagePath() { return path.join(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'), 'social-publishing'); }

  async storePublicMedia(image: ImagePayload): Promise<{ filename: string }> {
    return this.storeMedia(image, true);
  }

  async storeGeneratedMedia(buffer: Buffer): Promise<{ filename: string; url: string }> {
    const image = remoteImagePayload(buffer, 'image/png');
    const stored = await this.storeMedia(image, false);
    return { ...stored, url: `/api/publishing/social/media/${stored.filename}` };
  }

  private async storeMedia(image: ImagePayload, temporary: boolean): Promise<{ filename: string }> {
    const filename = `${randomUUID()}.${image.extension}`;
    await fs.mkdir(this.storagePath(), { recursive: true });
    await fs.writeFile(path.join(this.storagePath(), filename), image.buffer, { mode: 0o600 });
    if (temporary) {
      const cleanup = () => void fs.rm(path.join(this.storagePath(), filename), { force: true });
      setTimeout(cleanup, 30 * 60 * 1000).unref();
    }
    return { filename };
  }

  async publicMedia(filename: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!/^[a-f0-9-]+\.(?:png|jpg|webp)$/iu.test(filename)) throw new NotFoundException();
    const extension = path.extname(filename).toLowerCase();
    const contentType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    try { return { buffer: await fs.readFile(path.join(this.storagePath(), path.basename(filename))), contentType }; }
    catch { throw new NotFoundException(); }
  }

  async publish(tenantId: string, articleId: string, network: string, caption: string, imageDataUrl: string): Promise<{ ok: true; network: SocialNetwork; message: string }> {
    if (!['telegram', 'instagram', 'linkedin', 'facebook'].includes(network)) throw new BadRequestException('شبکه اجتماعی معتبر نیست');
    const article = await this.prisma.socialArticle.findFirst({
      where: { id: articleId, tenantId },
      select: {
        id: true, title: true, link: true, captionText: true, author: true, category: true, status: true,
        readingTime: true, leadText: true, summaryText: true, shortUrl: true, feed: { select: { name: true } },
      },
    });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const preserveArchive = article.status === 'archived';
    const image = readImageDataUrl(imageDataUrl);
    const submittedCaption = caption.trim();
    const settings = await this.settings.getRaw(tenantId);
    // A prepared article keeps the caption generated with the old template.
    // If the user submits that unchanged caption, rebuild it from the current
    // template. A changed caption is treated as an intentional manual edit.
    const normalizedCaption = !submittedCaption || submittedCaption === article.captionText?.trim()
      ? renderCaptionTemplate(String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}'), {
        title: article.title,
        lead: article.leadText || '',
        author: article.author || 'نامشخص',
        category: article.category || 'نامشخص',
        reading_time: article.readingTime ? persianDigits(article.readingTime) : 'نامشخص',
        summary: article.summaryText || '',
        link: article.shortUrl || article.link,
        source: article.feed?.name || '',
      })
      : submittedCaption;
    if (!normalizedCaption) throw new BadRequestException('کپشن نمی‌تواند خالی باشد');
    const startedAt = Date.now();
    const networkName = ({ telegram: 'تلگرام', instagram: 'اینستاگرام', linkedin: 'لینکدین', facebook: 'فیسبوک' } as Record<string, string>)[network] || network;
    try {
      if (network === 'telegram') await this.publishTelegram(settings, normalizedCaption, image);
      if (network === 'facebook') await this.publishFacebook(settings, normalizedCaption, image);
      if (network === 'linkedin') await this.publishLinkedIn(settings, article.title, normalizedCaption, image);
      if (network === 'instagram') await this.publishInstagram(settings, normalizedCaption, image);
      const sentAt = new Date();
      const delivery = network === 'telegram' ? { telegramSentAt: sentAt }
        : network === 'instagram' ? { instagramSentAt: sentAt }
          : network === 'linkedin' ? { linkedinSentAt: sentAt }
            : { facebookSentAt: sentAt };
      await this.prisma.socialArticle.update({
        where: { id: article.id },
        data: { captionText: normalizedCaption, rewrittenText: normalizedCaption, status: preserveArchive ? 'archived' : 'ready', lastError: '', ...delivery },
      });
      // Operational telemetry is deliberately best-effort. A message that was
      // accepted by the destination must never be reported as failed merely
      // because health/history recording had a transient problem.
      await Promise.allSettled([
        this.integrationHealth.success({ tenantId, key: `social:${network}`, type: 'social', name: networkName, latencyMs: Date.now() - startedAt, metadata: { operation: 'publish' } }),
        this.workflow.record({ tenantId, entityType: 'social-article', entityId: article.id, fromStatus: article.status, toStatus: `${network}_published`, action: 'published', actorType: 'system', title: `مطلب «${article.title}» در ${networkName} منتشر شد`, metadata: { network } }),
        this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.SOCIAL_PUBLISHED, 1),
      ]);
      return { ok: true, network: network as SocialNetwork, message: 'انتشار با موفقیت انجام شد.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای انتشار در شبکه اجتماعی';
      // Preserve the original delivery error even when a secondary status,
      // health or history write also fails.
      await Promise.allSettled([
        this.prisma.socialArticle.update({ where: { id: article.id }, data: { status: preserveArchive ? 'archived' : 'failed', lastError: message.slice(0, 1000) } }),
        this.integrationHealth.failure({ tenantId, key: `social:${network}`, type: 'social', name: networkName, latencyMs: Date.now() - startedAt, metadata: { operation: 'publish' }, error }),
        this.workflow.record({ tenantId, entityType: 'social-article', entityId: article.id, fromStatus: article.status, toStatus: `${network}_failed`, action: 'publishing-failed', actorType: 'system', title: `انتشار مطلب «${article.title}» در ${networkName} ناموفق بود`, metadata: { network, error: message.slice(0, 1000) } }),
      ]);
      throw error;
    }
  }

  async publishAutomatically(tenantId: string, articleId: string, networks: SocialNetwork[], useFeaturedImage = false) {
    const article = await this.prisma.socialArticle.findFirst({
      where: { id: articleId, tenantId },
      select: {
        id: true, status: true, featuredImageUrl: true, generatedImageUrl: true, captionText: true,
        telegramSentAt: true, instagramSentAt: true, linkedinSentAt: true, facebookSentAt: true,
      },
    });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const sentAtByNetwork: Record<SocialNetwork, Date | null> = {
      telegram: article.telegramSentAt,
      instagram: article.instagramSentAt,
      linkedin: article.linkedinSentAt,
      facebook: article.facebookSentAt,
    };
    const pending = Array.from(new Set(networks)).filter((network) => !sentAtByNetwork[network]);
    if (!pending.length) return { published: [] as SocialNetwork[], failed: [] as Array<{ network: SocialNetwork; error: string }> };

    let imageDataUrl = '';
    try {
      const generatedFilename = useFeaturedImage
        ? undefined
        : article.generatedImageUrl?.match(/\/publishing\/social\/media\/([a-f0-9-]+\.(?:png|jpg|webp))$/iu)?.[1];
      let image: ImagePayload | null = null;
      let generatedImageFailed = !useFeaturedImage && Boolean(article.generatedImageUrl) && !generatedFilename;
      if (generatedFilename) {
        try {
          const generated = await this.publicMedia(generatedFilename);
          image = remoteImagePayload(generated.buffer, generated.contentType);
        } catch {
          generatedImageFailed = true;
        }
      }
      if (!image && article.featuredImageUrl) {
        const featured = await this.outbound.proxyImage(article.featuredImageUrl);
        image = await publishableFeaturedImage(featured.buffer);
      }
      if (!image) throw new BadRequestException(generatedImageFailed
        ? 'تصویر قالبی قابل دریافت نیست و مطلب تصویر شاخص جایگزین ندارد'
        : 'مطلب تصویر شاخص یا تصویر قالبی ندارد و قابل انتشار خودکار نیست');
      if (generatedImageFailed) {
        await this.prisma.socialArticle.update({
          where: { id: article.id },
          data: { generatedImageUrl: null, generatedImageTemplateId: null },
        }).catch(() => undefined);
      }
      imageDataUrl = `data:${image.contentType};base64,${image.buffer.toString('base64')}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تصویر شاخص برای انتشار خودکار قابل دریافت نیست';
      await this.prisma.socialArticle.update({
        where: { id: article.id },
        data: { status: article.status === 'archived' ? 'archived' : 'failed', lastError: message.slice(0, 1000) },
      });
      return { published: [] as SocialNetwork[], failed: pending.map((network) => ({ network, error: message })) };
    }

    const published: SocialNetwork[] = [];
    const failed: Array<{ network: SocialNetwork; error: string }> = [];
    for (const network of pending) {
      try {
        await this.publish(tenantId, article.id, network, article.captionText || '', imageDataUrl);
        published.push(network);
      } catch (error) {
        failed.push({ network, error: error instanceof Error ? error.message : 'خطای انتشار خودکار' });
      }
    }
    if (failed.length) {
      const message = failed.map((item) => `${item.network}: ${item.error}`).join(' | ');
      await this.prisma.socialArticle.update({
        where: { id: article.id },
        data: { status: article.status === 'archived' ? 'archived' : 'failed', lastError: message.slice(0, 1000) },
      });
    }
    return { published, failed };
  }

  async testConnection(tenantId: string, network: string, settings: PublishingSettings): Promise<{ ok: true; network: SocialNetwork; message: string }> {
    if (!['telegram', 'instagram', 'linkedin', 'facebook'].includes(network)) throw new BadRequestException('شبکه اجتماعی معتبر نیست');
    if (network === 'telegram') await this.testTelegram(settings);
    if (network === 'instagram') await this.testInstagram(settings);
    if (network === 'linkedin') await this.testLinkedIn(settings);
    if (network === 'facebook') await this.testFacebook(settings);
    void tenantId;
    return { ok: true, network: network as SocialNetwork, message: 'اتصال و دسترسی شبکه با موفقیت تأیید شد.' };
  }

  private async resolvePlatformBridge(): Promise<{ url: string; secret: string }> {
    return this.settings.getResolvedSourceFetchBridge();
  }

  private platformBridgeHeaders(secret: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (secret) headers['X-Bridge-Secret'] = secret;
    return headers;
  }

  private normalizeBridgeUrl(url: string): string {
    return String(url || '').trim().replace(/\/+$/u, '');
  }

  private async publishTelegram(settings: PublishingSettings, caption: string, image: ImagePayload) {
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) throw new BadRequestException('تنظیمات تلگرام کامل نیست');
    const bridge = await this.resolvePlatformBridge();
    if (bridge.url) {
      const response = await this.telegramBridgeRequest(this.normalizeBridgeUrl(bridge.url), bridge.secret, {
        token: settings.telegram_bot_token,
        chat_id: settings.telegram_chat_id,
        caption: telegramHtml(caption.slice(0, 1024)),
        parse_mode: 'HTML',
        photo_base64: image.buffer.toString('base64'),
      });
      if (!response.ok) {
        throw new BadRequestException(response.error || 'Worker تلگرام انتشار مطلب را تأیید نکرد');
      }
      return;
    }
    const form = new FormData();
    form.set('chat_id', settings.telegram_chat_id);
    form.set('caption', telegramHtml(caption.slice(0, 1024)));
    form.set('parse_mode', 'HTML');
    form.set('photo', new Blob([asArrayBuffer(image.buffer)], { type: image.contentType }), `social.${image.extension}`);
    const response = await this.telegramRequest(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new BadRequestException(`تلگرام درخواست انتشار را با خطای ${response.status} رد کرد`);
    const result = await response.json() as { ok?: boolean };
    if (!result.ok) throw new BadRequestException('تلگرام انتشار مطلب را تأیید نکرد');
  }

  private async testTelegram(settings: PublishingSettings) {
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) throw new BadRequestException('تنظیمات تلگرام کامل نیست');
    const bridge = await this.resolvePlatformBridge();
    if (bridge.url) {
      const response = await this.telegramBridgeRequest(this.normalizeBridgeUrl(bridge.url), bridge.secret, {
        action: 'telegram_test',
        token: settings.telegram_bot_token,
        chat_id: settings.telegram_chat_id,
      });
      if (!response.ok) {
        throw new BadRequestException(response.error || 'Worker تلگرام اتصال ربات را تأیید نکرد');
      }
      return;
    }
    const base = `https://api.telegram.org/bot${settings.telegram_bot_token}`;
    const me = await this.telegramRequest(`${base}/getMe`, { signal: AbortSignal.timeout(15_000) });
    if (!me.ok) throw new BadRequestException(`توکن تلگرام با خطای ${me.status} رد شد`);
    const meResult = await me.json() as { ok?: boolean };
    if (!meResult.ok) throw new BadRequestException('توکن تلگرام معتبر نیست');
    const chat = await this.telegramRequest(`${base}/getChat?chat_id=${encodeURIComponent(settings.telegram_chat_id)}`, { signal: AbortSignal.timeout(15_000) });
    if (!chat.ok) throw new BadRequestException(`دسترسی ربات تلگرام به مقصد با خطای ${chat.status} رد شد`);
    const chatResult = await chat.json() as { ok?: boolean };
    if (!chatResult.ok) throw new BadRequestException('ربات تلگرام به مقصد انتخاب‌شده دسترسی ندارد یا شناسه مقصد صحیح نیست');
  }

  private async telegramRequest(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new BadRequestException(timedOut
        ? 'تلگرام در مهلت مقرر پاسخ نداد. Worker Deska را در تنظیمات مدیر کل (پلتفرم → Worker دریافت منبع) ثبت کنید یا دسترسی خروجی HTTPS سرور را بررسی کنید.'
        : `${SOURCE_FETCH_BRIDGE_MISSING_MESSAGE.replace('دریافت منبع', 'دریافت منبع و انتشار تلگرام')} در غیر این صورت دسترسی مستقیم سرور به api.telegram.org لازم است.`);
    }
  }

  private async telegramBridgeRequest(
    url: string,
    secret: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok?: boolean; error?: string }> {
    try {
      const response = await this.outbound.safeRequest(`${url}/`, {
        method: 'POST',
        headers: this.platformBridgeHeaders(secret),
        body: JSON.stringify(payload),
        timeoutMs: 30_000,
        acceptedTypes: ['application/json'],
        allowLocalhostInDevelopment: true,
      });
      let body: { ok?: boolean; error?: string; detail?: string; description?: string } = {};
      try { body = response.json<typeof body>(); } catch { /* Preserve the HTTP status below. */ }
      if (!response.ok) {
        return {
          ok: false,
          error: body.description || body.error || body.detail || `Worker Deska با خطای ${response.status} پاسخ داد`,
        };
      }
      return body;
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new BadRequestException(timedOut
        ? 'Worker Deska در مهلت مقرر پاسخ نداد؛ وضعیت Worker و آدرس ثبت‌شده در تنظیمات مدیر کل را بررسی کنید.'
        : 'ارتباط با Worker Deska برقرار نشد؛ آدرس Worker را در پلتفرم → Worker دریافت منبع بررسی کنید.');
    }
  }

  private async publishFacebook(settings: PublishingSettings, caption: string, image: ImagePayload) {
    if (!settings.social_facebook_page_access_token || !settings.social_facebook_page_id) throw new BadRequestException('تنظیمات فیسبوک کامل نیست');
    const version = graphVersion(settings.social_facebook_api_version, 'v23.0');
    const form = new FormData();
    form.set('access_token', settings.social_facebook_page_access_token);
    form.set('message', caption);
    form.set('published', 'true');
    form.set('source', new Blob([asArrayBuffer(image.buffer)], { type: image.contentType }), `social.${image.extension}`);
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_facebook_page_id)}/photos`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new BadRequestException(`فیسبوک درخواست انتشار را با خطای ${response.status} رد کرد`);
  }

  private async testFacebook(settings: PublishingSettings) {
    if (!settings.social_facebook_page_access_token || !settings.social_facebook_page_id) throw new BadRequestException('تنظیمات فیسبوک کامل نیست');
    const version = graphVersion(settings.social_facebook_api_version, 'v23.0');
    const query = new URLSearchParams({ fields: 'id,name', access_token: settings.social_facebook_page_access_token });
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_facebook_page_id)}?${query}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new BadRequestException(`اتصال صفحه فیسبوک با خطای ${response.status} رد شد`);
  }

  private async publishInstagram(settings: PublishingSettings, caption: string, image: ImagePayload) {
    if (!settings.social_instagram_access_token || !settings.social_instagram_account_id) throw new BadRequestException('تنظیمات اینستاگرام کامل نیست');
    if (!settings.social_public_media_base_url) throw new BadRequestException('برای اینستاگرام ابتدا آدرس عمومی API رسانه را تنظیم کنید');
    const stored = await this.storePublicMedia(image);
    const version = graphVersion(settings.social_instagram_api_version, 'v23.0');
    const mediaUrl = `${settings.social_public_media_base_url.replace(/\/$/u, '')}/api/publishing/social/media/${stored.filename}`;
    const create = new URLSearchParams({ image_url: mediaUrl, caption, access_token: settings.social_instagram_access_token });
    const containerResponse = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_instagram_account_id)}/media`, { method: 'POST', body: create, signal: AbortSignal.timeout(30_000) });
    if (!containerResponse.ok) throw new BadRequestException(`اینستاگرام ساخت محفظه انتشار را با خطای ${containerResponse.status} رد کرد`);
    const container = await containerResponse.json() as { id?: string };
    if (!container.id) throw new BadRequestException('اینستاگرام شناسه محفظه انتشار را برنگرداند');
    const publish = new URLSearchParams({ creation_id: container.id, access_token: settings.social_instagram_access_token });
    const publishResponse = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_instagram_account_id)}/media_publish`, { method: 'POST', body: publish, signal: AbortSignal.timeout(30_000) });
    if (!publishResponse.ok) throw new BadRequestException(`اینستاگرام انتشار مطلب را با خطای ${publishResponse.status} رد کرد`);
  }

  private async testInstagram(settings: PublishingSettings) {
    if (!settings.social_instagram_access_token || !settings.social_instagram_account_id) throw new BadRequestException('تنظیمات اینستاگرام کامل نیست');
    const version = graphVersion(settings.social_instagram_api_version, 'v23.0');
    const query = new URLSearchParams({ fields: 'id,username', access_token: settings.social_instagram_access_token });
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_instagram_account_id)}?${query}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new BadRequestException(`اتصال حساب اینستاگرام با خطای ${response.status} رد شد`);
  }

  private async publishLinkedIn(settings: PublishingSettings, title: string, caption: string, image: ImagePayload) {
    if (!settings.social_linkedin_access_token || !settings.social_linkedin_author_urn) throw new BadRequestException('تنظیمات لینکدین کامل نیست');
    const version = String(settings.social_linkedin_api_version || '202501').trim();
    if (!/^\d{6}$/u.test(version)) throw new BadRequestException('نسخه API لینکدین معتبر نیست');
    const headers = { Authorization: `Bearer ${settings.social_linkedin_access_token}`, 'LinkedIn-Version': version, 'X-Restli-Protocol-Version': '2.0.0' };
    const initResponse = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ initializeUploadRequest: { owner: settings.social_linkedin_author_urn } }), signal: AbortSignal.timeout(30_000) });
    if (!initResponse.ok) throw new BadRequestException(`لینکدین آماده‌سازی تصویر را با خطای ${initResponse.status} رد کرد`);
    const init = await initResponse.json() as { value?: { uploadUrl?: string; image?: string } };
    if (!init.value?.uploadUrl || !init.value.image) throw new BadRequestException('لینکدین اطلاعات بارگذاری تصویر را برنگرداند');
    const uploadResponse = await fetch(init.value.uploadUrl, { method: 'PUT', headers: { 'Content-Type': image.contentType }, body: asArrayBuffer(image.buffer), signal: AbortSignal.timeout(30_000) });
    if (!uploadResponse.ok) throw new BadRequestException(`لینکدین بارگذاری تصویر را با خطای ${uploadResponse.status} رد کرد`);
    const postResponse = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ author: settings.social_linkedin_author_urn, commentary: caption, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, content: { media: { id: init.value.image, title: { text: title } } } }), signal: AbortSignal.timeout(30_000) });
    if (!postResponse.ok) throw new BadRequestException(`لینکدین انتشار مطلب را با خطای ${postResponse.status} رد کرد`);
  }

  private async testLinkedIn(settings: PublishingSettings) {
    if (!settings.social_linkedin_access_token || !settings.social_linkedin_author_urn) throw new BadRequestException('تنظیمات لینکدین کامل نیست');
    const version = String(settings.social_linkedin_api_version || '202501').trim();
    if (!/^\d{6}$/u.test(version)) throw new BadRequestException('نسخه API لینکدین معتبر نیست');
    const response = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${settings.social_linkedin_access_token}`, 'LinkedIn-Version': version }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new BadRequestException(`اتصال لینکدین با خطای ${response.status} رد شد`);
  }
}
