import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { USAGE_METRIC_KEYS } from '@deska/shared';
import { existsSync } from 'node:fs';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SocialNetworkPublisherService } from './social-network-publisher.service';
import { SourceReaderService } from './source-reader.service';
import { UsageTrackingService } from '../../platform/usage/usage-tracking.service';
import { canonicalMediaPath } from '../../common/media-signature';

type LayerType = 'featured-image' | 'author-image' | 'text' | 'image' | 'gradient' | 'line' | 'rect' | 'circle';
type Binding = 'title' | 'lead' | 'author' | 'category' | 'reading_time' | 'summary' | 'link' | 'source' | 'custom';
interface CoverLayer {
  id: string; type: LayerType; binding?: Binding; content?: string; imageUrl?: string;
  x: number; y: number; width: number; height: number; visible: boolean; opacity: number;
  color?: string; backgroundColor?: string; backgroundOpacity?: number; fontSize?: number;
  fontWeight?: number; fontFamily?: string; align?: 'right' | 'center' | 'left' | 'justify';
  borderRadius?: number; objectFit?: 'cover' | 'contain'; gradientFrom?: string; gradientTo?: string;
  gradientFromOpacity?: number; gradientToOpacity?: number; gradientAngle?: number;
  strokeWidth?: number; lineAngle?: number;
}
interface CoverTemplate { version: 1; width: number; height: number; backgroundColor: string; layers: CoverLayer[] }
interface CoverLibrary { version: 1; defaultTemplateId: string; templates: Array<{ id: string; name: string; template: CoverTemplate }> }
interface FontRecord { name: string; weight?: number; url?: string }

const MAX_QUEUED_COVERS = 6;

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#039;');
}

function clamp(value: unknown, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function rgba(hex: string | undefined, opacity: number | undefined, fallback = '#0f172a'): string {
  const clean = String(hex || fallback).replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean;
  const number = Number.parseInt(full, 16);
  if (!Number.isFinite(number)) return 'rgba(15,23,42,1)';
  return `rgba(${number >> 16},${(number >> 8) & 255},${number & 255},${clamp(opacity ?? 100, 0, 100) / 100})`;
}

@Injectable()
export class SocialCoverRendererService {
  private readonly logger = new Logger(SocialCoverRendererService.name);
  private renderTail: Promise<void> = Promise.resolve();
  private queuedRenders = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: PublishingSettingsService,
    private readonly sourceReader: SourceReaderService,
    private readonly publisher: SocialNetworkPublisherService,
    private readonly usageTracking: UsageTrackingService,
  ) {}

  async generate(tenantId: string, articleId: string, settings: PublishingSettings, requestedTemplateId?: string) {
    const article = await this.prisma.socialArticle.findFirst({
      where: { id: articleId, tenantId },
      include: { feed: { select: { name: true } } },
    });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const library = this.templateLibrary(settings);
    const templateId = requestedTemplateId || settings.social_auto_image_template_id || library.defaultTemplateId;
    const selected = library.templates.find((item) => item.id === templateId)
      || library.templates.find((item) => item.id === library.defaultTemplateId)
      || library.templates[0];
    if (!selected) throw new BadRequestException('هیچ قالب تصویری معتبری برای تولید خودکار وجود ندارد');

    const values: Record<Binding, string> = {
      title: article.title,
      lead: article.leadText || '',
      author: article.author || 'نامشخص',
      category: article.category || 'نامشخص',
      reading_time: article.readingTime ? `${article.readingTime} دقیقه مطالعه` : 'نامشخص',
      summary: article.summaryText || '',
      link: article.shortUrl || article.link,
      source: article.feed?.name || '',
      custom: '',
    };
    const imageUrls = new Set<string>();
    for (const layer of selected.template.layers) {
      if (!layer.visible || !['featured-image', 'author-image', 'image'].includes(layer.type)) continue;
      const url = layer.type === 'featured-image' ? article.featuredImageUrl
        : layer.type === 'author-image' ? article.authorImageUrl
          : layer.imageUrl;
      if (url) imageUrls.add(url);
    }
    const assets = new Map<string, string>();
    await Promise.all([...imageUrls].map(async (url) => {
      try { assets.set(url, await this.imageDataUrl(tenantId, url)); }
      catch (error) { this.logger.warn(`Cover asset could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }));
    const fontCss = await this.fontCss(tenantId, selected.template, settings.social_font_library);
    const html = this.coverHtml(selected.template, values, assets, article.featuredImageUrl || '', article.authorImageUrl || '', fontCss);
    const buffer = await this.queuedScreenshot(html, selected.template.width, selected.template.height);
    const stored = await this.publisher.storeGeneratedMedia(buffer);
    const updated = await this.prisma.socialArticle.update({
      where: { id: article.id },
      data: { generatedImageUrl: canonicalMediaPath(stored.url), generatedImageTemplateId: selected.id, lastError: '' },
    });
    await this.usageTracking.record(tenantId, USAGE_METRIC_KEYS.SOCIAL_COVER, 1);
    return updated;
  }

  private templateLibrary(settings: PublishingSettings): CoverLibrary {
    try {
      const parsed = JSON.parse(settings.social_image_templates || '') as CoverLibrary;
      if (parsed?.version === 1 && Array.isArray(parsed.templates) && parsed.templates.length) return parsed;
    } catch { /* fall through to the legacy single template */ }
    try {
      const template = JSON.parse(settings.social_image_template || '') as CoverTemplate;
      if (template?.version === 1 && Array.isArray(template.layers)) {
        return { version: 1, defaultTemplateId: 'default', templates: [{ id: 'default', name: 'قالب اصلی', template }] };
      }
    } catch { /* invalid settings are reported below */ }
    throw new BadRequestException('کتابخانه قالب‌های تصویری معتبر نیست');
  }

  private async imageDataUrl(tenantId: string, url: string): Promise<string> {
    if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/iu.test(url)) return url;
    const pathOnly = canonicalMediaPath(url);
    const tenantMatch = pathOnly.match(/^\/publishing\/settings\/images\/file\/([^/]+)\/([a-f0-9-]+\.(?:jpe?g|png|webp|avif))$/iu);
    if (tenantMatch) {
      if (tenantMatch[1] !== tenantId) throw new BadRequestException('تصویر قالب متعلق به سازمان دیگری است');
      const image = await this.settingsService.imageFile(tenantId, tenantMatch[2]);
      return `data:${image.contentType};base64,${image.buffer.toString('base64')}`;
    }
    const legacyMatch = pathOnly.match(/^\/publishing\/settings\/images\/file\/([a-f0-9-]+\.(?:jpe?g|png|webp|avif))$/iu);
    if (legacyMatch) {
      const image = await this.settingsService.legacyImageFile(legacyMatch[1]);
      return `data:${image.contentType};base64,${image.buffer.toString('base64')}`;
    }
    const image = await this.sourceReader.proxyImage(url);
    return `data:${image.contentType};base64,${image.buffer.toString('base64')}`;
  }

  private async fontCss(tenantId: string, template: CoverTemplate, value?: string): Promise<string> {
    let fonts: FontRecord[] = [];
    try { const parsed = JSON.parse(value || '[]'); if (Array.isArray(parsed)) fonts = parsed as FontRecord[]; }
    catch { return ''; }
    const requested = new Map<string, number>();
    for (const layer of template.layers) {
      if (layer.type === 'text' && layer.fontFamily) requested.set(layer.fontFamily, layer.fontWeight || 400);
    }
    const rules: string[] = [];
    for (const [family, weight] of requested) {
      const candidates = fonts.filter((font) => font.name === family && font.url);
      const font = candidates.find((item) => item.weight === weight)
        || candidates.sort((a, b) => Math.abs((a.weight || 400) - weight) - Math.abs((b.weight || 400) - weight))[0];
      if (!font?.url) continue;
      try {
        const fontPath = canonicalMediaPath(font.url);
        const tenantMatch = fontPath.match(/^\/publishing\/settings\/fonts\/file\/([^/]+)\/([a-f0-9-]+\.(?:woff2?|ttf|otf))$/iu);
        const legacyMatch = fontPath.match(/^\/publishing\/settings\/fonts\/file\/([a-f0-9-]+\.(?:woff2?|ttf|otf))$/iu);
        const file = tenantMatch && tenantMatch[1] === tenantId
          ? await this.settingsService.fontFile(tenantId, tenantMatch[2])
          : legacyMatch ? await this.settingsService.legacyFontFile(legacyMatch[1]) : null;
        if (!file) continue;
        rules.push(`@font-face{font-family:"${escapeHtml(family)}";font-style:normal;font-weight:${font.weight || weight};src:url(data:${file.contentType};base64,${file.buffer.toString('base64')})}`);
      } catch { /* unavailable custom fonts fall back to Noto Sans Arabic */ }
    }
    return rules.join('\n');
  }

  private coverHtml(template: CoverTemplate, values: Record<Binding, string>, assets: Map<string, string>, featuredImageUrl: string, authorImageUrl: string, fontCss: string): string {
    const layers = template.layers.filter((layer) => layer.visible).map((layer) => {
      const x = clamp(layer.x, 0, 100); const y = clamp(layer.y, 0, 100);
      const width = clamp(layer.width, 0, 100); const height = clamp(layer.height, 0, 100);
      const radius = Math.min(template.width, template.height) * clamp(layer.borderRadius || 0, 0, 100) / 100;
      const common = `position:absolute;left:${x}%;top:${y}%;width:${width}%;height:${height}%;opacity:${clamp(layer.opacity ?? 100, 0, 100) / 100};border-radius:${radius}px;overflow:hidden;box-sizing:border-box`;
      if (layer.type === 'gradient') {
        return `<div style="${common};background:linear-gradient(${clamp(layer.gradientAngle ?? 135, 0, 360)}deg,${rgba(layer.gradientFrom, layer.gradientFromOpacity)},${rgba(layer.gradientTo, layer.gradientToOpacity)})"></div>`;
      }
      if (layer.type === 'line') {
        const stroke = escapeHtml(layer.color || '#ffffff');
        const strokeWidth = Math.max(1, Number(layer.strokeWidth) || 4);
        const angle = clamp(layer.lineAngle ?? 0, 0, 360);
        return `<div style="${common};background:transparent;overflow:visible"><svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><line x1="5" y1="50" x2="95" y2="50" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" transform="rotate(${angle} 50 50)"/></svg></div>`;
      }
      if (layer.type === 'rect') {
        const radius = Math.min(template.width, template.height) * clamp(layer.borderRadius || 0, 0, 100) / 100;
        const fill = rgba(layer.backgroundColor, layer.backgroundOpacity);
        return `<div style="${common};background:${fill};border-radius:${radius}px"></div>`;
      }
      if (layer.type === 'circle') {
        const fill = rgba(layer.backgroundColor, layer.backgroundOpacity);
        return `<div style="${common};background:${fill};border-radius:50%"></div>`;
      }
      if (layer.type === 'text') {
        const content = layer.binding === 'custom' ? layer.content || '' : values[layer.binding || 'custom'];
        const align = ['right', 'center', 'left', 'justify'].includes(layer.align || '') ? layer.align : 'right';
        const background = layer.backgroundColor && layer.backgroundColor !== 'transparent' ? rgba(layer.backgroundColor, layer.backgroundOpacity) : 'transparent';
        return `<div dir="rtl" style="${common};display:flex;align-items:center;padding:8px 16px;white-space:pre-wrap;overflow-wrap:anywhere;background:${background};color:${escapeHtml(layer.color || '#ffffff')};font-family:&quot;${escapeHtml(layer.fontFamily || 'Noto Sans Arabic')}&quot;,&quot;Noto Sans Arabic&quot;,sans-serif;font-size:${Math.max(8, Number(layer.fontSize) || 24)}px;font-weight:${Number(layer.fontWeight) || 500};line-height:1.35;text-align:${align};justify-content:${align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end'}">${escapeHtml(content)}</div>`;
      }
      const originalUrl = layer.type === 'featured-image' ? featuredImageUrl : layer.type === 'author-image' ? authorImageUrl : layer.imageUrl || '';
      const source = assets.get(originalUrl);
      return source ? `<img alt="" src="${source}" style="${common};object-fit:${layer.objectFit || 'cover'}">` : '';
    }).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}*{box-sizing:border-box}html,body{margin:0;background:transparent}#cover{position:relative;overflow:hidden;width:${template.width}px;height:${template.height}px;background:${escapeHtml(template.backgroundColor || '#0f172a')}}</style></head><body><div id="cover">${layers}</div></body></html>`;
  }

  private chromiumPath(): string {
    const candidates = [
      String(process.env.CHROMIUM_EXECUTABLE_PATH || '').trim(), '/usr/bin/chromium-browser', '/usr/bin/chromium',
      process.platform === 'win32' ? `${process.env.PROGRAMFILES || ''}\\Google\\Chrome\\Application\\chrome.exe` : '',
      process.platform === 'win32' ? `${process.env['PROGRAMFILES(X86)'] || ''}\\Microsoft\\Edge\\Application\\msedge.exe` : '',
    ].filter(Boolean);
    return candidates.find((candidate) => existsSync(candidate)) || '';
  }

  private async queuedScreenshot(html: string, width: number, height: number): Promise<Buffer> {
    if (this.queuedRenders >= MAX_QUEUED_COVERS) throw new BadRequestException('صف تولید تصویر موقتاً پر است؛ کمی بعد دوباره تلاش کنید');
    this.queuedRenders += 1;
    const previous = this.renderTail;
    let release!: () => void;
    this.renderTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await this.screenshot(html, width, height); }
    finally { this.queuedRenders -= 1; release(); }
  }

  private async screenshot(html: string, width: number, height: number): Promise<Buffer> {
    const executablePath = this.chromiumPath();
    if (!executablePath) throw new BadRequestException('مرورگر Chromium برای تولید تصویر روی سرور در دسترس نیست');
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: false, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--no-first-run'] });
    try {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      try {
        const page = await context.newPage();
        await page.route('**/*', (route) => route.abort('blockedbyclient'));
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10_000 });
        await page.evaluate(async () => {
          if (document.fonts) await document.fonts.ready;
          await Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : image.decode().catch(() => undefined)));
        });
        return await page.locator('#cover').screenshot({ type: 'png', animations: 'disabled' });
      } finally { await context.close().catch(() => undefined); }
    } finally { await browser.close().catch(() => undefined); }
  }
}
