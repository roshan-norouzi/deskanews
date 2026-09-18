import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import type { SourceType } from './dto/feed.dto';
import {
  SafeHttpClient,
  type SafeHttpRequestOptions,
  type SafeHttpResponse,
} from './safe-http.client';

export type { SafeHttpRequestOptions, SafeHttpResponse } from './safe-http.client';

export interface FeedEntry {
  canonicalUrl: string;
  guid: string;
  title: string;
  summary: string;
  content: string;
  contentIsFull: boolean;
  featuredImageUrl: string;
  authorImageUrl: string;
  author: string;
  category: string;
  publishedAt: Date | null;
}

export interface SourceArticle {
  canonicalUrl: string;
  title: string;
  text: string;
  featuredImageUrl: string;
  authorImageUrl: string;
  author: string;
  category: string;
  shortUrl: string;
  contentSource: 'page' | 'feed';
  isFullText: boolean;
}

export interface SourceArticleFallback {
  text?: string;
  title?: string;
  canonicalUrl?: string;
  featuredImageUrl?: string;
  author?: string;
  category?: string;
  fullTextAvailable?: boolean;
}

export interface SourceArticleMetadata {
  featuredImageUrl: string;
}

const MAX_FEED_BYTES = 3 * 1024 * 1024;
const MAX_ARTICLE_BYTES = 6 * 1024 * 1024;
const MAX_BROWSER_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_QUEUED_BROWSER_JOBS = 6;
const BROWSER_NAVIGATION_TIMEOUT_MS = 25_000;
const BROWSER_RENDER_TIMEOUT_MS = 18_000;

function array<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return text(record['#text'] ?? record.__cdata ?? record._ ?? '');
}

function normalizeUrl(value: string, base: string): string {
  try {
    const url = new URL(value.trim(), base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function bestSrcset(value: string): string {
  const candidates = value.split(',').map((item) => {
    const [url, descriptor] = item.trim().split(/\s+/u);
    const width = descriptor?.endsWith('w') ? Number.parseInt(descriptor, 10) : 0;
    return { url, width: Number.isFinite(width) ? width : 0 };
  }).filter((item) => item.url);
  return candidates.sort((a, b) => b.width - a.width)[0]?.url || '';
}

function imageValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (Array.isArray(value)) return value.map(imageValue).find(Boolean) || '';
  return imageValue(record.url ?? record.contentUrl ?? record['@_url'] ?? record['#text']);
}

@Injectable()
export class SourceReaderService {
  private readonly logger = new Logger(SourceReaderService.name);

  constructor(private readonly http: SafeHttpClient) {}
  private browserTail: Promise<void> = Promise.resolve();
  private queuedBrowserJobs = 0;
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    processEntities: true,
  });

  async readFeed(feedUrl: string): Promise<FeedEntry[]> {
    const xml = await this.http.safeFetchText(feedUrl, MAX_FEED_BYTES, [
      'application/rss+xml', 'application/atom+xml', 'application/feed+json', 'application/json',
      'application/xml', 'text/xml', 'text/plain',
    ]);
    let parsed: Record<string, unknown>;
    try { parsed = this.parser.parse(xml) as Record<string, unknown>; }
    catch { throw new BadRequestException('ساختار RSS/Atom معتبر نیست'); }

    let entries: Record<string, unknown>[] = [];
    try {
      const jsonFeed = JSON.parse(xml) as Record<string, unknown>;
      const items = jsonFeed && Array.isArray(jsonFeed.items) ? jsonFeed.items : [];
      if (items.length) {
        entries = items.map((item) => {
          const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
          const author = record.author && typeof record.author === 'object' ? record.author as Record<string, unknown> : {};
          return {
            ...record,
            link: record.url ?? record.external_url ?? record.id,
            description: record.summary ?? record.content_text ?? '',
            content: record.content_html ?? record.content_text ?? record.summary ?? '',
            title: record.title ?? '',
            author: author.name ?? record.author ?? '',
            published: record.date_published ?? record.date_modified ?? '',
            image: record.image ?? record.banner_image ?? '',
          };
        });
      }
    } catch { /* XML feeds are handled below. */ }

    if (!entries.length) {
      const rootNamed = (name: string): Record<string, unknown> | undefined => {
        const expected = name.toLowerCase();
        const pair = Object.entries(parsed).find(([key, value]) => key.toLowerCase() === expected && value && typeof value === 'object');
        return pair?.[1] as Record<string, unknown> | undefined;
      };
      const rootWithLocalName = (name: string): Record<string, unknown> | undefined => {
        const expected = name.toLowerCase();
        const pair = Object.entries(parsed).find(([key, value]) => key.split(':').pop()?.toLowerCase() === expected && value && typeof value === 'object');
        return pair?.[1] as Record<string, unknown> | undefined;
      };
      const rss = rootNamed('rss');
      const channel = rss?.channel as Record<string, unknown> | undefined;
      const atomFeed = rootNamed('feed');
      const rdf = rootWithLocalName('rdf');
      const rssItems = channel?.item ?? (channel?.items as Record<string, unknown> | undefined)?.item;
      const atomItems = atomFeed?.entry;
      const rdfItems = rdf?.item;
      entries = array<Record<string, unknown>>((rssItems ?? atomItems ?? rdfItems) as Record<string, unknown> | Record<string, unknown>[] | undefined);
    }

    return entries.slice(0, 50).map((entry) => {
      const linkValue = array(entry.link as unknown[]).map((candidate) => {
        if (typeof candidate === 'string') return candidate;
        const record = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
        const rel = text(record['@_rel']);
        return !rel || rel === 'alternate' ? text(record['@_href'] ?? record['#text']) : '';
      }).find(Boolean) ?? '';
      const canonicalUrl = normalizeUrl(linkValue || text(entry.guid ?? entry.id), feedUrl);
      const title = this.htmlToText(text(entry.title));
      // Publishers use a surprisingly broad mix of RSS, Atom and Media RSS
      // fields. Preserve the richest available feed text so it remains a safe
      // fallback when the linked page is dynamic, blocked, or no longer live.
      const rawSummary = text(
        entry.description
        ?? entry.summary
        ?? entry['content:encoded']
        ?? entry['atom:content']
        ?? entry['media:description']
        ?? entry.content,
      );
      const explicitRawContent = text(
        entry['content:encoded']
        ?? entry['atom:content']
        ?? entry['full-text']
        ?? entry.content,
      );
      const rawContent = explicitRawContent || rawSummary;
      const summaryText = this.htmlToText(rawSummary).slice(0, 12_000);
      const contentText = this.htmlToText(rawContent).slice(0, 80_000);
      // A populated content field is not necessarily a full article: many
      // feeds copy their short description into content:encoded. Mark it as
      // full only when it has enough substance beyond the RSS summary.
      const contentIsFull = Boolean(explicitRawContent) && (
        contentText.length >= 1_200
        || (contentText.length >= 400 && contentText.length >= Math.max(1, summaryText.length) * 1.35)
      );
      const enclosure = entry.enclosure as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const mediaItems = array((entry['media:content'] ?? entry['media:thumbnail']) as unknown).map((item) => item as Record<string, unknown>);
      const enclosureItems = array(enclosure as unknown).map((item) => item as Record<string, unknown>);
      const htmlImage = (rawSummary.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] || '');
      const imageCandidate = [...enclosureItems, ...mediaItems, entry.image]
        .map(imageValue).find(Boolean) || htmlImage;
      const featuredImageUrl = normalizeUrl(imageCandidate, feedUrl);
      const dateValue = text(entry.pubDate ?? entry.published ?? entry.updated ?? entry.date);
      const authorValue = entry.author && typeof entry.author === 'object'
        ? text((entry.author as Record<string, unknown>).name ?? entry.author)
        : text(entry['dc:creator'] ?? entry.creator ?? entry.author);
      const category = array(entry.category as unknown[]).map((item) => text(item)).filter(Boolean).join('، ');
      const date = dateValue ? new Date(dateValue) : null;
      return {
        canonicalUrl,
        guid: text(entry.guid ?? entry.id),
        title,
        summary: summaryText,
        content: contentText,
        contentIsFull,
        featuredImageUrl,
        authorImageUrl: '',
        author: authorValue.slice(0, 300),
        category: category.slice(0, 500),
        publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
      };
    }).filter((entry) => entry.canonicalUrl && entry.title);
  }

  /**
   * Read any supported editorial source. RSS remains the default so records
   * created before source types were introduced keep working unchanged.
   */
  async readSource(sourceType: SourceType | string | undefined, sourceUrl: string): Promise<FeedEntry[]> {
    switch (sourceType || 'rss') {
      case 'rss':
        return this.readFeed(sourceUrl);
      case 'website':
      case 'blog':
        return this.readWebsiteSource(sourceUrl);
      case 'telegram':
        return this.readTelegramChannel(sourceUrl);
      case 'twitter':
        return this.readTwitterAccount(sourceUrl);
      default:
        throw new BadRequestException('نوع منبع پشتیبانی نمی‌شود');
    }
  }

  /**
   * Attempts to locate a standard RSS/Atom/JSON feed URL for a website homepage.
   */
  async discoverFeedUrl(sourceUrl: string): Promise<string | null> {
    const html = await this.http.safeFetchText(sourceUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml']);
    const $ = load(html);
    const discoveredFeed = $('link[rel="alternate"]').map((_, node) => {
      const rel = String($(node).attr('rel') || '').toLowerCase();
      if (rel && rel !== 'alternate') return '';
      const type = String($(node).attr('type') || '').toLowerCase();
      return /rss|atom|json/u.test(type) ? normalizeUrl($(node).attr('href') || '', sourceUrl) : '';
    }).get().find(Boolean);
    if (!discoveredFeed) return null;
    try {
      const entries = await this.readFeed(discoveredFeed);
      return entries.length ? discoveredFeed : null;
    } catch {
      return null;
    }
  }

  private async readWebsiteSource(sourceUrl: string): Promise<FeedEntry[]> {
    const discoveredFeed = await this.discoverFeedUrl(sourceUrl).catch(() => null);
    if (discoveredFeed) {
      try {
        const entries = await this.readFeed(discoveredFeed);
        if (entries.length) return entries;
      } catch {
        // A stale or temporarily unavailable autodiscovered feed must not
        // prevent the HTML index from being scanned below.
      }
    }

    const html = await this.http.safeFetchText(sourceUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml']);
    const $ = load(html);
    const candidates = new Map<string, { title: string; score: number }>();
    $('article a[href], main a[href], [itemprop="itemListElement"] a[href], a[href]').each((_, node) => {
      const href = normalizeUrl($(node).attr('href') || '', sourceUrl);
      const title = this.htmlToText($(node).text()).replace(/\s+/gu, ' ').trim();
      if (!href || !title || title.length < 8 || title.length > 500 || this.isNavigationLink(href, sourceUrl, title)) return;
      const score = ($(node).closest('article, [itemprop="itemListElement"]').length ? 5 : 0)
        + ($(node).closest('main').length ? 2 : 0) + Math.min(3, Math.floor(title.length / 80));
      const current = candidates.get(href);
      if (!current || score > current.score || title.length > current.title.length) candidates.set(href, { title, score });
    });

    const previews = await Promise.all([...candidates.entries()]
      .sort(([, left], [, right]) => right.score - left.score)
      .slice(0, 20)
      .map(async ([url, candidate]) => this.readPagePreview(url, candidate.title)));
    const entries = previews.filter((entry): entry is FeedEntry => Boolean(entry));
    if (entries.length) return entries;

    const pagePreview = await this.readPagePreview(sourceUrl, this.htmlToText($('h1').first().text() || $('title').text()));
    if (pagePreview) return [pagePreview];
    throw new BadRequestException('در صفحه منبع، مطلب قابل پایشی پیدا نشد؛ آدرس RSS یا صفحه فهرست مطالب را وارد کنید');
  }

  private isNavigationLink(candidateUrl: string, sourceUrl: string, title: string): boolean {
    try {
      const candidate = new URL(candidateUrl);
      const source = new URL(sourceUrl);
      if (candidate.origin !== source.origin) return true;
      if (candidate.pathname === source.pathname && candidate.search === source.search) return true;
      if (/^(ورود|ثبت.?نام|خانه|تماس با ما|درباره ما|بیشتر|ادامه|صفحه بعد|next|home|login|sign[ -]?up|about|contact)$/iu.test(title)) return true;
      if (/\.(?:css|js|json|xml|pdf|zip|jpg|jpeg|png|gif|webp)$/iu.test(candidate.pathname)) return true;
      return /(?:\/tag\/|\/category\/|\/author\/|\/page\/|[?&](?:page|paged|s)=)/iu.test(`${candidate.pathname}${candidate.search}`);
    } catch {
      return true;
    }
  }

  private async readPagePreview(articleUrl: string, fallbackTitle: string): Promise<FeedEntry | null> {
    try {
      const html = await this.http.safeFetchText(articleUrl, 2 * 1024 * 1024, ['text/html', 'application/xhtml+xml']);
      const $ = load(html);
      const title = this.htmlToText($('meta[property="og:title"]').attr('content') || $('h1').first().text() || fallbackTitle).slice(0, 1_000);
      const summary = this.htmlToText($('meta[property="og:description"], meta[name="description"]').first().attr('content') || '');
      $('script,style,noscript,svg,iframe,nav,header,footer,aside,form').remove();
      const body = this.htmlToText($('[itemprop="articleBody"], article .entry-content, article .post-content, article, main').first().text()).slice(0, 80_000);
      const content = body || summary;
      const published = $('meta[property="article:published_time"]').attr('content')
        || $('[itemprop="datePublished"]').attr('content')
        || $('time[datetime]').first().attr('datetime') || '';
      const date = published ? new Date(published) : null;
      if (!title || !content) return null;
      return {
        canonicalUrl: normalizeUrl($('link[rel="canonical"]').attr('href') || articleUrl, articleUrl) || articleUrl,
        guid: normalizeUrl($('link[rel="canonical"]').attr('href') || articleUrl, articleUrl) || articleUrl,
        title,
        summary: summary.slice(0, 12_000),
        content,
        contentIsFull: content.length >= 1_200,
        featuredImageUrl: this.extractFeaturedImageUrl(articleUrl, load(html)),
        authorImageUrl: '',
        author: this.htmlToText($('meta[name="author"]').attr('content') || '').slice(0, 300),
        category: this.htmlToText($('meta[property="article:section"]').attr('content') || '').slice(0, 500),
        publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
      };
    } catch {
      return null;
    }
  }

  private async readTelegramChannel(sourceUrl: string): Promise<FeedEntry[]> {
    const channelUrl = this.telegramHistoryUrl(sourceUrl);
    const html = await this.http.safeFetchText(channelUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml']);
    const $ = load(html);
    const entries = $('.tgme_widget_message').map((_, node) => {
      const message = $(node);
      const content = this.htmlToText(message.find('.tgme_widget_message_text').html() || message.text()).slice(0, 80_000);
      const link = normalizeUrl(message.find('.tgme_widget_message_date').attr('href') || '', channelUrl);
      const title = content.split(/\n+/u).map((part) => part.trim()).find(Boolean)?.slice(0, 300) || '';
      const dateValue = message.find('time').attr('datetime') || '';
      const date = dateValue ? new Date(dateValue) : null;
      const style = message.find('.tgme_widget_message_photo_wrap').attr('style') || '';
      const image = style.match(/url\((?:["']?)(.*?)(?:["']?)\)/iu)?.[1] || message.find('img').attr('src') || '';
      if (!content || !link || !title) return null;
      return {
        canonicalUrl: link,
        guid: link,
        title,
        summary: content.slice(0, 12_000),
        content,
        contentIsFull: true,
        featuredImageUrl: normalizeUrl(image, channelUrl),
        authorImageUrl: '',
        author: '',
        category: 'تلگرام',
        publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
      } satisfies FeedEntry;
    }).get().filter(Boolean) as FeedEntry[];
    if (!entries.length) throw new BadRequestException('از کانال تلگرام عمومی مطلبی پیدا نشد؛ کانال باید عمومی باشد و آدرس آن درست وارد شود');
    return entries.slice(-50);
  }

  private telegramHistoryUrl(sourceUrl: string): string {
    try {
      const url = new URL(sourceUrl);
      if (!/(?:^|\.)t\.me$/iu.test(url.hostname)) throw new Error();
      const parts = url.pathname.split('/').filter(Boolean);
      const username = parts[0] === 's' ? parts[1] : parts[0];
      if (!username || !/^[a-z][a-z\d_]{3,31}$/iu.test(username)) throw new Error();
      return `https://t.me/s/${username}`;
    } catch {
      throw new BadRequestException('آدرس کانال تلگرام عمومی معتبر نیست؛ مانند https://t.me/channel');
    }
  }

  private async readTwitterAccount(sourceUrl: string): Promise<FeedEntry[]> {
    const handle = this.twitterHandle(sourceUrl);
    const timelineUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`;
    const html = await this.http.safeFetchText(timelineUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml', 'application/json']);
    const $ = load(html);
    const entries = $('.timeline-Tweet, [data-tweet-id]').map((_, node) => {
      const tweet = $(node);
      const content = this.htmlToText(tweet.find('.timeline-Tweet-text, [data-testid="tweetText"]').html() || tweet.text()).slice(0, 80_000);
      const id = tweet.attr('data-tweet-id') || tweet.find('a[href*="/status/"]').attr('href')?.match(/status\/(\d+)/u)?.[1] || '';
      const link = id ? `https://x.com/${handle}/status/${id}` : normalizeUrl(tweet.find('a[href*="/status/"]').attr('href') || '', timelineUrl);
      const title = content.split(/\n+/u).map((part) => part.trim()).find(Boolean)?.slice(0, 300) || '';
      const dateValue = tweet.find('time').attr('datetime') || '';
      const date = dateValue ? new Date(dateValue) : null;
      const image = tweet.find('img').map((__, imageNode) => $(imageNode).attr('src') || '').get().find(Boolean) || '';
      if (!content || !link || !title) return null;
      return {
        canonicalUrl: link,
        guid: link,
        title,
        summary: content.slice(0, 12_000),
        content,
        contentIsFull: true,
        featuredImageUrl: normalizeUrl(image, timelineUrl),
        authorImageUrl: '',
        author: `@${handle}`,
        category: 'X / Twitter',
        publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
      } satisfies FeedEntry;
    }).get().filter(Boolean) as FeedEntry[];
    if (!entries.length) throw new BadRequestException('از حساب عمومی X/Twitter مطلبی دریافت نشد؛ حساب باید عمومی باشد یا از API رسمی استفاده شود');
    return entries.slice(-50);
  }

  private twitterHandle(sourceUrl: string): string {
    try {
      const url = new URL(sourceUrl);
      if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase())) throw new Error();
      const handle = url.pathname.split('/').filter(Boolean)[0] || '';
      if (!/^[a-z\d_]{1,50}$/iu.test(handle) || ['home', 'explore', 'search', 'i', 'intent'].includes(handle.toLowerCase())) throw new Error();
      return handle;
    } catch {
      throw new BadRequestException('آدرس حساب عمومی X/Twitter معتبر نیست؛ مانند https://x.com/username');
    }
  }

  async readAuthorImage(articleUrl: string): Promise<string> {
    try {
      const html = await this.http.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
      const $ = load(html);
      const selector = '[itemprop="author"] img, [rel="author"] img, a[href*="/author/"] img, .author img, .author-avatar img, .avatar img, [class*="author"] img, [class*="avatar"] img, img[alt*="author" i], img[alt*="نویسنده"]';
      const srcset = $(selector).map((_, node) => bestSrcset($(node).attr('srcset') || $(node).attr('data-srcset') || '')).get().find(Boolean);
      const candidate = srcset
        || $('meta[property="article:author:image"]').attr('content')
        || $('meta[name="author:image"]').attr('content')
        || $('meta[property="profile:image"], meta[name="profile:image"]').attr('content')
        || $(selector).map((_, node) => $(node).attr('src') || $(node).attr('data-src') || '').get().find(Boolean)
        || '';
      return normalizeUrl(candidate, articleUrl);
    } catch {
      return '';
    }
  }

  /**
   * Read only page metadata when preparation needs an image. This deliberately
   * does not require a full article body, so a short page, paywall shell, or
   * dynamically rendered article cannot prevent the title/summary workflow
   * from saving a usable featured image discovered in the HTML head.
   */
  async readArticleMetadata(articleUrl: string): Promise<SourceArticleMetadata> {
    try {
      const html = await this.http.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
      const $ = load(html);
      return { featuredImageUrl: this.extractFeaturedImageUrl(articleUrl, $) };
    } catch {
      return { featuredImageUrl: '' };
    }
  }

  async readArticle(articleUrl: string): Promise<SourceArticle> {
    let directError: unknown;
    try {
      const html = await this.http.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
      return this.extractArticleHtml(articleUrl, html);
    } catch (error) {
      directError = error;
    }

    try {
      const rendered = await this.renderArticlePage(articleUrl);
      return this.extractArticleHtml(rendered.url, rendered.html);
    } catch (browserError) {
      const directMessage = directError instanceof Error ? directError.message : 'استخراج مستقیم ناموفق بود';
      const browserMessage = browserError instanceof Error ? browserError.message : 'استخراج مرورگری ناموفق بود';
      this.logger.warn(`Article extraction failed after direct and browser attempts: ${directMessage}; ${browserMessage}`);
      throw new BadRequestException(`${directMessage}؛ بازیابی مرورگری نیز ناموفق بود: ${browserMessage}`);
    }
  }

  private extractArticleHtml(articleUrl: string, html: string): SourceArticle {
    if (html.length < 100_000 && /(?:Transferring to the website|در حال انتقال)/iu.test(html)) {
      throw new BadRequestException('صفحه منبع به‌جای متن خبر، صفحه انتقال یا محافظت ضدربات برگرداند');
    }
    // Keep an untouched DOM for metadata and title-block extraction. The
    // cleaned DOM below intentionally removes <header>, but many Elementor
    // themes render ACF `uptitle` and the post title inside that element.
    const metadata$ = load(html);
    const $ = load(html);
    $('script,style,noscript,svg,iframe,form,nav,header,footer,aside,.advertisement,.ads,.social-share,.related-posts').remove();

    const selectors = [
      '[itemprop="articleBody"]',
      'article .entry-content',
      'article .post-content',
      'article .article-content',
      '.entry-content',
      '.post-content',
      '.article-content',
      '[class*="article-body"]',
      '[class*="article__body"]',
      '[class*="news-body"]',
      '[class*="news__body"]',
      '[class*="news-text"]',
      '[class*="story-body"]',
      'article',
      'main',
    ];
    let articleText = '';
    let structuredTitle = '';
    for (const selector of selectors) {
      $(selector).each((_, element) => {
        const candidate = $(element).find('p,h2,h3,blockquote,li').map((__, node) => $(node).text().replace(/\s+/g, ' ').trim()).get().filter((part) => part.length > 20).join('\n\n');
        if (candidate.length > articleText.length) articleText = candidate;
      });
      if (articleText.length >= 800) break;
    }
    // Many modern publishers keep their article body only in JSON-LD. Read
    // it before declaring extraction impossible, without executing scripts.
    metadata$('script[type="application/ld+json"]').each((_, node) => {
      try {
        const scan = (value: unknown): void => {
          if (!value || typeof value !== 'object') return;
          if (Array.isArray(value)) { value.forEach(scan); return; }
          const record = value as Record<string, unknown>;
          const type = String(record['@type'] || '').toLowerCase();
          const body = this.htmlToText(text(record.articleBody));
          const description = this.htmlToText(text(record.description));
          const candidate = body || (type.includes('article') ? description : '');
          if (!structuredTitle && type.includes('article')) {
            structuredTitle = this.htmlToText(text(record.headline ?? record.name));
          }
          if (candidate.length > articleText.length) articleText = candidate;
          Object.values(record).forEach(scan);
        };
        scan(JSON.parse(metadata$(node).text()) as unknown);
      } catch { /* malformed JSON-LD is ignored */ }
    });
    if (articleText.length < 200) throw new BadRequestException('متن کامل خبر از صفحه منبع قابل استخراج نبود');

    const title = (metadata$('meta[property="og:title"]').attr('content') || structuredTitle || metadata$('h1').first().text() || metadata$('title').text()).replace(/\s+/g, ' ').trim();
    const canonicalUrl = normalizeUrl(metadata$('link[rel="canonical"]').attr('href') || articleUrl, articleUrl) || articleUrl;
    const featuredImageUrl = this.extractFeaturedImageUrl(articleUrl, metadata$);
    const author = (metadata$('meta[name="author"]').attr('content')
      || metadata$('[rel="author"]').first().text()
      || metadata$('[itemprop="author"]').first().text()).replace(/\s+/g, ' ').trim();
    const category = (metadata$('meta[property="article:section"]').attr('content')
      || metadata$('[itemprop="articleSection"]').first().text()).replace(/\s+/g, ' ').trim();
    const shortUrl = normalizeUrl(metadata$('link[rel="shortlink"]').attr('href') || '', articleUrl);
    const authorMetadata$ = metadata$;
    const authorImageSelector = '[itemprop="author"] img, [rel="author"] img, a[href*="/author/"] img, .author img, .author-avatar img, .avatar img, [class*="author"] img, [class*="avatar"] img, img[alt*="author" i], img[alt*="نویسنده"]';
    const authorSrcsetImage = authorMetadata$(authorImageSelector).map((_, node) => bestSrcset(authorMetadata$(node).attr('srcset') || authorMetadata$(node).attr('data-srcset') || '')).get().find(Boolean);
    const authorImageCandidate = authorSrcsetImage
      || $('meta[property="article:author:image"]').attr('content')
      || $('meta[name="author:image"]').attr('content')
      || $('meta[property="profile:image"], meta[name="profile:image"]').attr('content')
      || authorMetadata$(authorImageSelector).map((_, node) => authorMetadata$(node).attr('src') || authorMetadata$(node).attr('data-src') || '').get().find(Boolean)
      || (() => {
        let found = '';
        $('script[type="application/ld+json"]').each((_, node) => {
          if (found) return;
          try {
            const root = JSON.parse($(node).text()) as unknown;
            const scan = (value: unknown): void => {
              if (found || !value || typeof value !== 'object') return;
              if (Array.isArray(value)) { value.forEach(scan); return; }
              const record = value as Record<string, unknown>;
              const type = String(record['@type'] || '').toLowerCase();
              if (type.includes('person')) {
                if (typeof record.image === 'string') { found = record.image; return; }
                if (record.image && typeof record.image === 'object' && typeof (record.image as Record<string, unknown>).url === 'string') { found = String((record.image as Record<string, unknown>).url); return; }
              }
              if (record.author) scan(record.author);
              if (record.image && typeof record.image === 'object') scan(record.image);
            };
            scan(root);
          } catch { /* malformed JSON-LD is ignored */ }
        });
        return found;
      })()
      || '';
    const authorImageUrl = normalizeUrl(authorImageCandidate, articleUrl);
    return { canonicalUrl, title, text: articleText.slice(0, 120_000), featuredImageUrl, authorImageUrl, author: author.slice(0, 300), category: category.slice(0, 500), shortUrl, contentSource: 'page', isFullText: true };
  }

  private extractFeaturedImageUrl(articleUrl: string, $: ReturnType<typeof load>): string {
    const imageSrcset = $('article img, main img, [itemprop="image"]').map((_, node) => bestSrcset($(node).attr('srcset') || $(node).attr('data-srcset') || '')).get().find(Boolean);
    const imageAttribute = $('article img, main img, [itemprop="image"], img').map((_, node) => $(node).attr('src')
      || $(node).attr('data-src')
      || $(node).attr('data-lazy-src')
      || $(node).attr('data-original')
      || '').get().find(Boolean);
    let structuredImage = '';
    $('script[type="application/ld+json"]').each((_, node) => {
      if (structuredImage) return;
      try {
        const scan = (value: unknown): void => {
          if (structuredImage || !value || typeof value !== 'object') return;
          if (Array.isArray(value)) { value.forEach(scan); return; }
          const record = value as Record<string, unknown>;
          const type = String(record['@type'] || '').toLowerCase();
          if (type.includes('article') || type.includes('imageobject')) {
            structuredImage = imageValue(record.image ?? record.thumbnailUrl ?? record.contentUrl);
          }
          if (!structuredImage) Object.values(record).forEach(scan);
        };
        scan(JSON.parse($(node).text()) as unknown);
      } catch { /* malformed JSON-LD is ignored */ }
    });
    const candidate = $('meta[property="og:image:secure_url"]').attr('content')
      || $('meta[property="og:image"]').attr('content')
      || $('meta[name="twitter:image"], meta[name="twitter:image:src"]').attr('content')
      || $('meta[itemprop="image"], meta[name="image"]').attr('content')
      || $('link[rel="image_src"]').attr('href')
      || structuredImage
      || imageSrcset
      || imageAttribute
      || '';
    return normalizeUrl(candidate, articleUrl);
  }

  /**
   * Final extraction tier for JavaScript-rendered publishers. Browser jobs are
   * serialized to cap memory, run in a fresh context, reject non-public URLs,
   * block downloads/heavy assets, and close the process after every article.
   */
  private async renderArticlePage(articleUrl: string): Promise<{ html: string; url: string }> {
    if (String(process.env.NEWS_BROWSER_RENDERING || 'true').toLowerCase() === 'false') {
      throw new Error('بازیابی مرورگری در تنظیمات سرور غیرفعال است');
    }
    const executablePath = this.browserExecutablePath();
    if (!executablePath) throw new Error('مرورگر Chromium روی سرور در دسترس نیست');
    if (this.queuedBrowserJobs >= MAX_QUEUED_BROWSER_JOBS) {
      throw new Error('صف بازیابی مرورگری موقتاً پر است؛ کمی بعد دوباره تلاش کنید');
    }

    this.queuedBrowserJobs += 1;
    const previous = this.browserTail;
    let release!: () => void;
    this.browserTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await this.renderArticlePageNow(articleUrl, executablePath);
    } finally {
      this.queuedBrowserJobs -= 1;
      release();
    }
  }

  private browserExecutablePath(): string {
    const candidates = [
      String(process.env.CHROMIUM_EXECUTABLE_PATH || '').trim(),
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      process.platform === 'win32' ? `${process.env.PROGRAMFILES || ''}\\Google\\Chrome\\Application\\chrome.exe` : '',
      process.platform === 'win32' ? `${process.env['PROGRAMFILES(X86)'] || ''}\\Microsoft\\Edge\\Application\\msedge.exe` : '',
    ].filter(Boolean);
    return candidates.find((candidate) => existsSync(candidate)) || '';
  }

  private async renderArticlePageNow(articleUrl: string, executablePath: string): Promise<{ html: string; url: string }> {
    const initialTarget = await this.http.assertPublicUrl(articleUrl);
    const pinnedAddress = initialTarget.addresses[0];
    if (!pinnedAddress) throw new Error('نشانی عمومی معتبری برای منبع پیدا نشد');

    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      chromiumSandbox: false,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--no-first-run',
        `--host-resolver-rules=MAP ${initialTarget.url.hostname} ${pinnedAddress.address}`,
      ],
    });
    try {
      const context = await browser.newContext({
        acceptDownloads: false,
        bypassCSP: false,
        javaScriptEnabled: true,
        locale: 'fa-IR',
        timezoneId: 'Asia/Tehran',
        serviceWorkers: 'block',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      });
      try {
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(BROWSER_NAVIGATION_TIMEOUT_MS);
        page.setDefaultTimeout(5_000);
        page.on('dialog', (dialog) => { void dialog.dismiss(); });
        page.on('popup', (popup) => { void popup.close(); });

        const validatedHosts = new Set([initialTarget.url.hostname]);
        let requestCount = 0;
        await page.route('**/*', async (route) => {
          const request = route.request();
          if (['image', 'media', 'font', 'stylesheet', 'websocket'].includes(request.resourceType())) {
            await route.abort('blockedbyclient').catch(() => undefined);
            return;
          }
          requestCount += 1;
          if (requestCount > 100) {
            await route.abort('blockedbyclient').catch(() => undefined);
            return;
          }
          let requestUrl: URL;
          try { requestUrl = new URL(request.url()); }
          catch { await route.abort('blockedbyclient').catch(() => undefined); return; }
          if (!['http:', 'https:'].includes(requestUrl.protocol)) {
            await route.abort('blockedbyclient').catch(() => undefined);
            return;
          }
          try {
            if (!validatedHosts.has(requestUrl.hostname)) {
              await this.http.assertPublicUrl(requestUrl.toString());
              validatedHosts.add(requestUrl.hostname);
            }
            await route.continue();
          } catch {
            await route.abort('blockedbyclient').catch(() => undefined);
          }
        });

        await page.goto(initialTarget.url.toString(), { waitUntil: 'domcontentloaded' });
        const deadline = Date.now() + BROWSER_RENDER_TIMEOUT_MS;
        let latestHtml = '';
        let latestUrl = initialTarget.url.toString();
        while (Date.now() < deadline) {
          try {
            latestHtml = await page.content();
            latestUrl = page.url() || latestUrl;
            if (Buffer.byteLength(latestHtml, 'utf8') > MAX_BROWSER_RESPONSE_BYTES) {
              throw new Error('حجم صفحه رندرشده بیش از حد مجاز است');
            }
            this.extractArticleHtml(latestUrl, latestHtml);
            return { html: latestHtml, url: latestUrl };
          } catch (error) {
            if (error instanceof Error && error.message.includes('حجم صفحه رندرشده')) throw error;
          }
          await page.waitForTimeout(500);
        }
        if (!latestHtml) throw new Error('مرورگر پاسخی از صفحه منبع دریافت نکرد');
        return { html: latestHtml, url: latestUrl };
      } finally {
        await context.close().catch(() => undefined);
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  /**
   * Page extraction is best-effort: publishers may require JavaScript or
   * challenge automated requests. The RSS payload was already obtained from
   * that publisher, so retaining it is a safer and more useful fallback than
   * failing the news workflow outright.
   */
  async readArticleOrFallback(articleUrl: string, fallback: SourceArticleFallback): Promise<SourceArticle> {
    try {
      return await this.readArticle(articleUrl);
    } catch (error) {
      const fallbackText = this.htmlToText(fallback.text || '');
      if (!fallbackText) throw error;
      let hostname = 'source';
      try { hostname = new URL(articleUrl).hostname; } catch { /* keep a safe generic log label */ }
      this.logger.warn(`Full-page extraction failed for ${hostname}; using RSS text instead.`);
      const canonicalUrl = normalizeUrl(fallback.canonicalUrl || articleUrl, articleUrl) || articleUrl;
      return {
        canonicalUrl,
        title: (fallback.title || '').trim().slice(0, 1_000),
        text: fallbackText.slice(0, 120_000),
        featuredImageUrl: normalizeUrl(fallback.featuredImageUrl || '', articleUrl),
        authorImageUrl: '',
        author: (fallback.author || '').trim().slice(0, 300),
        category: (fallback.category || '').trim().slice(0, 500),
        shortUrl: '',
        contentSource: 'feed',
        isFullText: Boolean(fallback.fullTextAvailable),
      };
    }
  }

  async proxyImage(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    return this.http.proxyImage(imageUrl);
  }

  private htmlToText(value: string): string {
    if (!value) return '';
    const $ = load(`<body>${value}</body>`);
    $('script,style,noscript').remove();
    return $('body').text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  }

  async safeRequest(value: string, options: SafeHttpRequestOptions = {}): Promise<SafeHttpResponse> {
    return this.http.safeRequest(value, options);
  }
}
