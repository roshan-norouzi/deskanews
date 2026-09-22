import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { buildTelegramProfilePhotoUrl, parseTelegramUsername } from '@deska/shared';
import {
  PublishingSettingsService,
  SOURCE_FETCH_BRIDGE_MISSING_MESSAGE,
  type SourceFetchSettings,
} from './publishing-settings.service';
import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import type { SourceType } from './dto/feed.dto';

export interface ReadSourceOptions {
  resolvedFeedUrl?: string;
}

export interface ReadSourceResult {
  entries: FeedEntry[];
  resolvedFeedUrl: string;
}

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
const MAX_BRIDGE_HTTP_RESPONSE_BYTES = 10 * 1024 * 1024;
const BRIDGE_JSON_OVERHEAD_BYTES = 512_000;

function bridgeHttpResponseLimit(contentMaxBytes: number): number {
  return Math.min(
    MAX_BRIDGE_HTTP_RESPONSE_BYTES,
    Math.ceil(contentMaxBytes * 1.35) + BRIDGE_JSON_OVERHEAD_BYTES,
  );
}
const MAX_REDIRECTS = 5;
const MAX_BROWSER_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_QUEUED_BROWSER_JOBS = 6;
const BROWSER_NAVIGATION_TIMEOUT_MS = 25_000;
const BROWSER_RENDER_TIMEOUT_MS = 18_000;

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

interface ValidatedTarget {
  url: URL;
  addresses: ResolvedAddress[];
}

export interface SafeHttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array;
  maxResponseBytes?: number;
  timeoutMs?: number;
  acceptedTypes?: string[];
  allowLocalhostInDevelopment?: boolean;
}

export interface SafeHttpResponse {
  ok: boolean;
  status: number;
  headers: IncomingHttpHeaders;
  buffer: Buffer;
  text(): string;
  json<T = unknown>(): T;
}

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

function parseIpv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split('.').map((part) => Number.parseInt(part, 10));
  return octets.length === 4 ? octets : null;
}

function parseIpv6(address: string): number[] | null {
  let normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.includes('%') || isIP(normalized) !== 6) return null;

  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (ipv4Tail) {
    const octets = parseIpv4(ipv4Tail);
    if (!octets) return null;
    normalized = `${normalized.slice(0, -ipv4Tail.length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || (halves.length === 2 && omitted < 1)) return null;

  const groups = [...left, ...Array.from({ length: omitted }, () => '0'), ...right]
    .map((part) => Number.parseInt(part, 16));
  return groups.length === 8 && groups.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? groups
    : null;
}

function embeddedIpv4(groups: number[], offset: number): string {
  return `${groups[offset] >> 8}.${groups[offset] & 0xff}.${groups[offset + 1] >> 8}.${groups[offset + 1] & 0xff}`;
}

/** Reject every address that is not globally routable unicast. */
function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = parseIpv4(normalized);
  if (ipv4) {
    const [a, b, c, d] = ipv4;
    return a === 0
      || a === 10
      || a === 127
      || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || (a === 168 && b === 63 && c === 129 && d === 16);
  }

  const ipv6 = parseIpv6(normalized);
  if (!ipv6) return true;

  // IPv4-compatible and IPv4-mapped forms, including hexadecimal tails such
  // as ::ffff:7f00:1, must be classified using their embedded IPv4 address.
  const firstFiveZero = ipv6.slice(0, 5).every((part) => part === 0);
  if (firstFiveZero && ipv6[5] === 0xffff) return isBlockedAddress(embeddedIpv4(ipv6, 6));
  if (ipv6.slice(0, 6).every((part) => part === 0)) return true;
  const isIsatap = (ipv6[4] === 0 || ipv6[4] === 0x0200) && ipv6[5] === 0x5efe;
  if (isIsatap && isBlockedAddress(embeddedIpv4(ipv6, 6))) return true;

  // Globally routed IPv6 unicast currently lives in 2000::/3. This excludes
  // ULA, link-local, site-local, multicast, discard-only and translation-only
  // ranges before checking special allocations inside global unicast space.
  if ((ipv6[0] & 0xe000) !== 0x2000) return true;
  return (ipv6[0] === 0x2001 && ipv6[1] === 0x0000) // Teredo
    || (ipv6[0] === 0x2001 && ipv6[1] === 0x0002) // benchmarking
    || (ipv6[0] === 0x2001 && ipv6[1] === 0x0db8) // documentation
    || (ipv6[0] === 0x2002) // 6to4
    || (ipv6[0] === 0x3fff && (ipv6[1] & 0xf000) === 0x0000); // documentation
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function httpErrorMessage(error: unknown): string {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;
      return Array.isArray(message) ? message.join(' ') : String(message || '');
    }
  }
  return error instanceof Error ? error.message : String(error);
}

const SOURCE_BRIDGE_HOSTS = ['t.me', 'telegram.me', 'x.com', 'twitter.com', 'syndication.twitter.com'];
function hostRequiresSourceBridge(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/u, '');
  return SOURCE_BRIDGE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Hosts on .ir are usually reachable directly from Iran; other news CDNs often are not. */
function isDomesticSourceHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/u, '');
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (isIP(host)) return false;
  return host.endsWith('.ir');
}

function shouldPreferSourceBridgeFirst(hostname: string, bridgeConfigured: boolean): boolean {
  if (!bridgeConfigured) return false;
  if (hostRequiresSourceBridge(hostname)) return true;
  return !isDomesticSourceHost(hostname);
}

function isRetryableDirectFetchError(error: unknown): boolean {
  const message = httpErrorMessage(error);
  return /HTTP (401|403|407|408|429|451|500|502|503|504)|نوع محتوای دریافتی|مهلت|timeout|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|certificate|SSL|TLS|fetch failed|socket|EPROTO|blocked|مسدود|ارتباط|اتصال امن/u.test(message);
}

function isDirectConnectionBlockedError(error: unknown): boolean {
  const message = httpErrorMessage(error);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPROTO|certificate|SSL|TLS|socket hang up|fetch failed/u.test(message);
}

function bodyMatchesAcceptedTypes(body: string, acceptedTypes: string[]): boolean {
  const start = body.replace(/^\uFEFF/u, '').trimStart().slice(0, 800);
  const wantsHtml = acceptedTypes.some((type) => type.includes('html') || type.includes('xhtml'));
  const wantsXml = acceptedTypes.some((type) => /xml|rss|atom|xhtml/u.test(type));
  const wantsJson = acceptedTypes.some((type) => type.includes('json'));
  if (wantsXml && /<(?:\?xml|rss|feed|rdf:RDF)\b/iu.test(start)) return true;
  if (wantsJson && start.startsWith('{') && /"items"|"version"/u.test(start)) return true;
  if (wantsHtml && /<(?:html|head|body|article|div)\b/iu.test(start)) return true;
  return false;
}

function contentTypeIsAccepted(contentType: string, acceptedTypes: string[]): boolean {
  if (!contentType) return true;
  return acceptedTypes.some((type) => contentType.includes(type));
}

@Injectable()
export class SourceReaderService {
  private readonly logger = new Logger(SourceReaderService.name);
  private readonly bridgePreferredHosts = new Set<string>();

  constructor(@Optional() private readonly publishingSettings?: PublishingSettingsService) {}

  private browserTail: Promise<void> = Promise.resolve();
  private queuedBrowserJobs = 0;
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    processEntities: true,
  });

  async readFeed(feedUrl: string): Promise<FeedEntry[]> {
    const xml = await this.safeFetchText(feedUrl, MAX_FEED_BYTES, [
      'application/rss+xml', 'application/atom+xml', 'application/feed+json', 'application/json',
      'application/xml', 'text/xml', 'text/plain', 'application/xhtml+xml', 'text/html',
      'application/octet-stream',
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
  async readSource(
    sourceType: SourceType | string | undefined,
    sourceUrl: string,
    options?: ReadSourceOptions,
  ): Promise<FeedEntry[]> {
    return (await this.readSourceWithMeta(sourceType, sourceUrl, options)).entries;
  }

  async readSourceWithMeta(
    sourceType: SourceType | string | undefined,
    sourceUrl: string,
    options?: ReadSourceOptions,
  ): Promise<ReadSourceResult> {
    switch (sourceType || 'rss') {
      case 'rss':
        return { entries: await this.readFeed(sourceUrl), resolvedFeedUrl: sourceUrl };
      case 'website':
      case 'blog':
        return this.readWebsiteSource(sourceUrl, options?.resolvedFeedUrl || '');
      case 'telegram':
        return { entries: await this.readTelegramChannel(sourceUrl), resolvedFeedUrl: '' };
      case 'twitter':
        return { entries: await this.readTwitterAccount(sourceUrl), resolvedFeedUrl: '' };
      default:
        throw new BadRequestException('نوع منبع پشتیبانی نمی‌شود');
    }
  }

  /**
   * Attempts to locate a standard RSS/Atom/JSON feed URL for a website homepage.
   */
  async discoverFeedUrl(sourceUrl: string): Promise<string | null> {
    const candidates = await this.collectFeedUrlCandidates(sourceUrl);
    for (const candidate of candidates) {
      try {
        const entries = await this.readFeed(candidate);
        if (entries.length) return candidate;
      } catch {
        // Try the next candidate.
      }
    }
    return null;
  }

  private async collectFeedUrlCandidates(sourceUrl: string): Promise<string[]> {
    const candidates = new Set<string>();
    for (const path of this.commonFeedPathCandidates(sourceUrl)) candidates.add(path);

    try {
      const html = await this.safeFetchText(sourceUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml']);
      const $ = load(html);
      $('link[rel="alternate"], link[type*="rss"], link[type*="atom"], link[type*="json"]').each((_, node) => {
        const rel = String($(node).attr('rel') || '').toLowerCase();
        if (rel && rel !== 'alternate') return;
        const type = String($(node).attr('type') || '').toLowerCase();
        const href = normalizeUrl($(node).attr('href') || '', sourceUrl);
        if (!href) return;
        if (!type || /rss|atom|json|xml/u.test(type) || /(?:feed|rss|atom)/iu.test(href)) candidates.add(href);
      });
      $('a[href]').each((_, node) => {
        const href = normalizeUrl($(node).attr('href') || '', sourceUrl);
        if (href && /(?:feed|rss|atom)(?:\.xml)?(?:$|[/?#])/iu.test(href)) candidates.add(href);
      });
    } catch {
      // Homepage HTML is optional; common feed paths are still attempted below.
    }

    return [...candidates];
  }

  private commonFeedPathCandidates(sourceUrl: string): string[] {
    try {
      const base = new URL(sourceUrl);
      return [
        '/feed',
        '/rss',
        '/feed.xml',
        '/rss.xml',
        '/atom.xml',
        '/index.xml',
        '/feeds/posts/default',
        '/?feed=rss2',
        '/rss/index.xml',
        '/rss/latest.xml',
        '/rss/allnews',
        '/fa/rss/allnews',
        '/rss/search',
        '/rss/latest',
        '/rss/news',
        '/news/rss',
        '/news/rss.xml',
        '/export/rss',
        '/service/news.rss',
        '/feeds/rss',
        '/rss/tp',
      ].map((path) => new URL(path, base).toString());
    } catch {
      return [];
    }
  }

  private homepageFallbackTitle(html: string, sourceUrl: string): string {
    const $ = load(html);
    return this.htmlToText($('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('title').text() || sourceUrl).slice(0, 1_000);
  }

  private collectArticleLinkCandidates(sourceUrl: string, html: string): Map<string, { title: string; score: number }> {
    const $ = load(html);
    const candidates = new Map<string, { title: string; score: number }>();
    const selectors = [
      'article a[href]',
      'main a[href]',
      '[itemprop="itemListElement"] a[href]',
      '.news-list a[href], .list-news a[href], .news-item a[href], .news-box a[href]',
      '.title a[href], h2 a[href], h3 a[href], h4 a[href]',
      '.card a[href], .post a[href], .story a[href], .item a[href]',
      'a[href]',
    ];

    for (const selector of selectors) {
      $(selector).each((_, node) => {
        const href = normalizeUrl($(node).attr('href') || '', sourceUrl);
        const title = this.htmlToText($(node).text()).replace(/\s+/gu, ' ').trim();
        if (!href || !title || title.length < 6 || title.length > 500 || this.isNavigationLink(href, sourceUrl, title)) return;
        const score = ($(node).closest('article, [itemprop="itemListElement"]').length ? 5 : 0)
          + ($(node).closest('main').length ? 2 : 0)
          + Math.min(3, Math.floor(title.length / 80));
        const current = candidates.get(href);
        if (!current || score > current.score || title.length > current.title.length) {
          candidates.set(href, { title, score });
        }
      });
    }

    $('script[type="application/ld+json"]').each((_, node) => {
      try {
        const scan = (value: unknown): void => {
          if (!value || typeof value !== 'object') return;
          if (Array.isArray(value)) { value.forEach(scan); return; }
          const record = value as Record<string, unknown>;
          const type = String(record['@type'] || '').toLowerCase();
          if (type.includes('itemlist') && Array.isArray(record.itemListElement)) {
            for (const item of record.itemListElement) {
              if (!item || typeof item !== 'object') continue;
              const row = item as Record<string, unknown>;
              const nested = row.item && typeof row.item === 'object' ? row.item as Record<string, unknown> : row;
              const href = normalizeUrl(text(nested.url ?? nested['@id']), sourceUrl);
              const title = this.htmlToText(text(nested.name ?? nested.headline)).slice(0, 500);
              if (!href || !title || title.length < 6 || this.isNavigationLink(href, sourceUrl, title)) continue;
              candidates.set(href, { title, score: 6 });
            }
          }
          if (type.includes('newsarticle') || type.includes('article')) {
            const href = normalizeUrl(text(record.url ?? record.mainEntityOfPage ?? record['@id']), sourceUrl);
            const title = this.htmlToText(text(record.headline ?? record.name)).slice(0, 500);
            if (href && title && title.length >= 6 && !this.isNavigationLink(href, sourceUrl, title)) {
              candidates.set(href, { title, score: 7 });
            }
          }
          Object.values(record).forEach(scan);
        };
        scan(JSON.parse($(node).text()) as unknown);
      } catch { /* ignore malformed JSON-LD */ }
    });

    return candidates;
  }

  private async extractWebsiteEntriesFromHtml(sourceUrl: string, html: string): Promise<FeedEntry[]> {
    const candidates = this.collectArticleLinkCandidates(sourceUrl, html);
    const previews = await Promise.all([...candidates.entries()]
      .sort(([, left], [, right]) => right.score - left.score)
      .slice(0, 20)
      .map(async ([url, candidate]) => this.readPagePreview(url, candidate.title)));
    return previews.filter((entry): entry is FeedEntry => Boolean(entry));
  }

  private async readWebsiteSource(sourceUrl: string, cachedFeedUrl = ''): Promise<ReadSourceResult> {
    let resolvedFeedUrl = String(cachedFeedUrl || '').trim();

    const tryResolvedFeed = async (feedUrl: string): Promise<FeedEntry[] | null> => {
      if (!feedUrl) return null;
      try {
        const entries = await this.readFeed(feedUrl);
        return entries.length ? entries : null;
      } catch (error) {
        this.logger.warn(`Feed URL failed for ${sourceUrl}: ${error instanceof Error ? error.message : 'unknown error'}`);
        return null;
      }
    };

    let entries = await tryResolvedFeed(resolvedFeedUrl);
    if (entries) return { entries, resolvedFeedUrl };

    if (!resolvedFeedUrl) {
      resolvedFeedUrl = (await this.discoverFeedUrl(sourceUrl).catch(() => null)) || '';
      entries = await tryResolvedFeed(resolvedFeedUrl);
      if (entries) return { entries, resolvedFeedUrl };
    }

    let html = '';
    try {
      html = await this.safeFetchText(sourceUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml']);
    } catch (directError) {
      try {
        const rendered = await this.renderArticlePage(sourceUrl);
        html = rendered.html;
      } catch {
        throw directError;
      }
    }

    entries = await this.extractWebsiteEntriesFromHtml(sourceUrl, html);
    if (!entries.length) {
      try {
        const rendered = await this.renderArticlePage(sourceUrl);
        entries = await this.extractWebsiteEntriesFromHtml(rendered.url || sourceUrl, rendered.html);
      } catch (error) {
        this.logger.warn(`Browser homepage scrape failed for ${sourceUrl}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    if (entries.length) return { entries, resolvedFeedUrl };

    const pagePreview = await this.readPagePreview(sourceUrl, this.homepageFallbackTitle(html, sourceUrl));
    if (pagePreview) return { entries: [pagePreview], resolvedFeedUrl };

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
      let html = '';
      try {
        html = await this.safeFetchText(articleUrl, 2 * 1024 * 1024, ['text/html', 'application/xhtml+xml']);
      } catch {
        const rendered = await this.renderArticlePage(articleUrl);
        html = rendered.html;
      }
      const $ = load(html);
      const title = this.htmlToText($('meta[property="og:title"]').attr('content') || $('h1').first().text() || fallbackTitle).slice(0, 1_000);
      let summary = this.htmlToText($('meta[property="og:description"], meta[name="description"]').first().attr('content') || '');
      $('script,style,noscript,svg,iframe,nav,header,footer,aside,form').remove();
      let body = this.htmlToText($([
        '[itemprop="articleBody"]',
        'article .entry-content',
        'article .post-content',
        'article .content',
        '.news-body',
        '.news-content',
        '.article-body',
        '.text',
        'article',
        'main',
      ].join(', ')).first().text()).slice(0, 80_000);

      $('script[type="application/ld+json"]').each((_, node) => {
        if (body.length >= 200) return;
        try {
          const scan = (value: unknown): void => {
            if (!value || typeof value !== 'object') return;
            if (Array.isArray(value)) { value.forEach(scan); return; }
            const record = value as Record<string, unknown>;
            const type = String(record['@type'] || '').toLowerCase();
            const candidate = this.htmlToText(text(record.articleBody ?? record.description));
            if (type.includes('article') && candidate.length > body.length) body = candidate.slice(0, 80_000);
            if (!summary && type.includes('article')) {
              summary = this.htmlToText(text(record.description)).slice(0, 12_000);
            }
            Object.values(record).forEach(scan);
          };
          scan(JSON.parse($(node).text()) as unknown);
        } catch { /* ignore malformed JSON-LD */ }
      });

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
    const html = await this.safeFetchText(channelUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml']);
    const $ = load(html);
    const entries = $('.tgme_widget_message, .tgme_widget_message_wrap').map((_, node) => {
      const message = $(node);
      const content = this.htmlToText(
        message.find('.tgme_widget_message_text, .js-message_text').html() || message.text(),
      ).slice(0, 80_000);
      const link = normalizeUrl(
        message.find('.tgme_widget_message_date, .tgme_widget_message_date_wrap a').attr('href') || '',
        channelUrl,
      );
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

  private unescapeTwitterJsonString(value: string): string {
    try {
      return JSON.parse(`"${value}"`) as string;
    } catch {
      return value
        .replace(/\\n/gu, '\n')
        .replace(/\\"/gu, '"')
        .replace(/\\\//gu, '/')
        .replace(/\\\\/gu, '\\');
    }
  }

  /** Parses embedded tweet JSON from X syndication HTML when DOM selectors miss. */
  private extractTwitterEntriesFromSyndicationPayload(html: string, handle: string): FeedEntry[] {
    const tweets: FeedEntry[] = [];
    const seen = new Set<string>();
    const idRe = /"id_str":"(\d{5,})"/gu;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = idRe.exec(html)) && tweets.length < 50) {
      const id = idMatch[1];
      if (seen.has(id)) continue;
      const start = Math.max(0, idMatch.index - 500);
      const end = Math.min(html.length, idMatch.index + 2500);
      const window = html.slice(start, end);
      const textMatch = window.match(/"full_text":"((?:\\.|[^"\\])*)"/u);
      if (!textMatch) continue;
      const content = this.unescapeTwitterJsonString(textMatch[1]).trim();
      if (!content) continue;
      const title = content.split(/\n+/u).map((part) => part.trim()).find(Boolean)?.slice(0, 300) || '';
      if (!title) continue;
      const permalinkMatch = window.match(/"permalink":"((?:\\.|[^"\\])*)"/u);
      let link = '';
      if (permalinkMatch) {
        const permalink = this.unescapeTwitterJsonString(permalinkMatch[1]);
        link = permalink.startsWith('http')
          ? permalink
          : `https://x.com${permalink.startsWith('/') ? '' : '/'}${permalink}`;
      } else {
        link = `https://x.com/${handle}/status/${id}`;
      }
      seen.add(id);
      tweets.push({
        canonicalUrl: link,
        guid: link,
        title,
        summary: content.slice(0, 12_000),
        content,
        contentIsFull: true,
        featuredImageUrl: '',
        authorImageUrl: '',
        author: `@${handle}`,
        category: 'X / Twitter',
        publishedAt: null,
      });
    }
    return tweets;
  }

  private async readTwitterAccount(sourceUrl: string): Promise<FeedEntry[]> {
    const handle = this.twitterHandle(sourceUrl);
    const timelineUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`;
    const html = await this.safeFetchText(timelineUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml', 'application/json', 'text/plain']);
    const $ = load(html);
    let entries = $('.timeline-Tweet, [data-tweet-id], article[data-tweet-id]').map((_, node) => {
      const tweet = $(node);
      const content = this.htmlToText(
        tweet.find('.timeline-Tweet-text, [data-testid="tweetText"], .tweet-text').html() || tweet.text(),
      ).slice(0, 80_000);
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
    if (!entries.length) {
      entries = this.extractTwitterEntriesFromSyndicationPayload(html, handle);
    }
    if (!entries.length) {
      throw new BadRequestException(
        'از حساب عمومی X/Twitter مطلبی دریافت نشد؛ Worker دریافت منبع را در پلتفرم بررسی کنید یا چند دقیقه بعد دوباره تلاش کنید',
      );
    }
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

  private extractTwitterProfilePhotoFromHtml(html: string): string {
    const profileImageMatch = html.match(/"profile_image_url_https"\s*:\s*"((?:\\.|[^"\\])*)"/u)
      || html.match(/"profile_image_url"\s*:\s*"((?:\\.|[^"\\])*)"/u);
    if (profileImageMatch) {
      const url = this.unescapeTwitterJsonString(profileImageMatch[1]).trim();
      if (url.startsWith('http')) {
        return url.replace(/_(?:normal|bigger|mini|reasonably_small)(?=\.[a-z]+$)/iu, '_400x400');
      }
    }
    const $ = load(html);
    const candidate = $('img[src*="profile_images"], .ProfileCanopy-avatar img, .Avatar-image').first().attr('src') || '';
    return normalizeUrl(candidate, 'https://x.com');
  }

  async resolveFeedProfilePhoto(sourceUrl: string, sourceType: SourceType): Promise<string> {
    if (sourceType === 'telegram') {
      const direct = buildTelegramProfilePhotoUrl(sourceUrl);
      if (direct) return direct;
      const username = parseTelegramUsername(sourceUrl);
      if (!username) return '';
      try {
        const html = await this.safeFetchText(`https://t.me/${username}`, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml']);
        const $ = load(html);
        return normalizeUrl($('meta[property="og:image"], meta[property="twitter:image"]').attr('content') || '', sourceUrl);
      } catch {
        return '';
      }
    }
    if (sourceType === 'twitter') {
      try {
        const handle = this.twitterHandle(sourceUrl);
        const timelineUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`;
        const html = await this.safeFetchText(timelineUrl, MAX_FEED_BYTES, ['text/html', 'application/xhtml+xml', 'application/json', 'text/plain']);
        return this.extractTwitterProfilePhotoFromHtml(html);
      } catch {
        return '';
      }
    }
    return '';
  }

  async readAuthorImage(articleUrl: string): Promise<string> {
    try {
      const html = await this.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
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
      const html = await this.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
      const $ = load(html);
      return { featuredImageUrl: this.extractFeaturedImageUrl(articleUrl, $) };
    } catch {
      return { featuredImageUrl: '' };
    }
  }

  async readArticle(articleUrl: string): Promise<SourceArticle> {
    let directError: unknown;
    try {
      const html = await this.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
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
    const initialTarget = await this.assertPublicUrl(articleUrl);
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
              await this.assertPublicUrl(requestUrl.toString());
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
    let target = await this.assertPublicUrl(imageUrl);
    const maxBytes = 15 * 1024 * 1024;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const response = await this.requestPinned(target, {
        Accept: 'image/*',
        'User-Agent': 'DESKA-News/1.0',
      });
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headerValue(response.headers, 'location');
        response.resume();
        if (!location || redirect === MAX_REDIRECTS) throw new BadRequestException('تعداد تغییر مسیرهای تصویر بیش از حد مجاز است');
        target = await this.assertRedirect(location, target.url);
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new BadRequestException(`تصویر با خطای HTTP ${status} پاسخ داد`);
      }
      const contentType = headerValue(response.headers, 'content-type').split(';')[0].toLowerCase();
      const allowedImageTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
      if (!allowedImageTypes.has(contentType)) {
        response.resume();
        throw new BadRequestException('نوع تصویر قابل قبول نیست');
      }
      const buffer = await this.readResponse(response, maxBytes, 'حجم تصویر بیش از حد مجاز است');
      if (!buffer.length) throw new BadRequestException('پاسخ تصویر خالی است');
      return { buffer, contentType };
    }
    throw new BadRequestException('دریافت تصویر انجام نشد');
  }

  private htmlToText(value: string): string {
    if (!value) return '';
    const $ = load(`<body>${value}</body>`);
    $('script,style,noscript').remove();
    return $('body').text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  }

  private async resolveAddresses(hostname: string): Promise<ResolvedAddress[]> {
    if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses
      .filter((item): item is ResolvedAddress => item.family === 4 || item.family === 6)
      .map((item) => ({ address: item.address, family: item.family }))
      .sort((left, right) => left.family - right.family);
  }

  private async assertPublicUrl(value: string, allowLocalhostInDevelopment = false): Promise<ValidatedTarget> {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('آدرس منبع معتبر نیست'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('آدرس منبع معتبر نیست');
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/u, '');
    if (!hostname) throw new BadRequestException('آدرس منبع معتبر نیست');
    const allowLocalhost = allowLocalhostInDevelopment
      && process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1', '::1'].includes(hostname);
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      if (!allowLocalhost) throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    }
    if (isIP(hostname) && isBlockedAddress(hostname) && !allowLocalhost) throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    try {
      const addresses = await this.resolveAddresses(hostname);
      if (!addresses.length || (!allowLocalhost && addresses.some((item) => isBlockedAddress(item.address)))) {
        throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
      }
      // Canonicalize a trailing DNS dot so Host and TLS SNI use the same name
      // that was validated above. IP literals are already normalized by URL.
      if (!isIP(hostname)) url.hostname = hostname;
      return { url, addresses };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('نام میزبان منبع قابل شناسایی نیست');
    }
  }

  private async assertRedirect(location: string, currentUrl: URL): Promise<ValidatedTarget> {
    try {
      return await this.assertPublicUrl(new URL(location, currentUrl).toString());
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('آدرس تغییر مسیر معتبر نیست');
    }
  }

  private createPinnedRequestOptions(
    url: URL,
    address: ResolvedAddress,
    headers: Record<string, string>,
    signal: AbortSignal = AbortSignal.timeout(30_000),
    method = 'GET',
  ): RequestOptions {
    const originalHostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return {
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port: url.port || undefined,
      method,
      path: `${url.pathname}${url.search}`,
      headers: { ...headers, Host: url.host, 'Accept-Encoding': 'identity' },
      signal,
      ...(url.protocol === 'https:' && isIP(originalHostname) === 0 ? { servername: originalHostname } : {}),
    };
  }

  private requestAddress(
    url: URL,
    address: ResolvedAddress,
    headers: Record<string, string>,
    signal: AbortSignal,
    method = 'GET',
    body?: Buffer,
  ): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const options = this.createPinnedRequestOptions(url, address, headers, signal, method);
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(options, resolve);
      request.once('error', reject);
      if (body?.length) request.write(body);
      request.end();
    });
  }

  private async requestPinned(
    target: ValidatedTarget,
    headers: Record<string, string>,
    method = 'GET',
    body?: Buffer,
    timeoutMs = 30_000,
  ): Promise<IncomingMessage> {
    let lastError: unknown;
    for (const address of target.addresses) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        // The socket connects to this exact validated IP. For HTTPS, SNI and
        // certificate validation still use the original hostname.
        return await this.requestAddress(target.url, address, headers, signal, method, body);
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : 'connection failed';
    throw new BadRequestException(`اتصال امن به منبع برقرار نشد: ${reason}`);
  }

  private async readResponse(response: IncomingMessage, maxBytes: number, sizeError: string): Promise<Buffer> {
    const declaredLength = Number(headerValue(response.headers, 'content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      response.destroy();
      throw new BadRequestException(sizeError);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const rawChunk of response) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy();
        throw new BadRequestException(sizeError);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  }

  /**
   * Send credentials or request bodies only after DNS validation, then pin the
   * socket to that exact public address. Redirects are intentionally not
   * followed because forwarding secrets to a second origin is unsafe.
   */
  async safeRequest(value: string, options: SafeHttpRequestOptions = {}): Promise<SafeHttpResponse> {
    const method = String(options.method || 'GET').trim().toUpperCase();
    if (!/^[A-Z]{3,10}$/u.test(method)) throw new BadRequestException('روش درخواست خروجی معتبر نیست');
    const body = options.body === undefined
      ? undefined
      : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(options.body);
    if (body && body.length > 25 * 1024 * 1024) throw new BadRequestException('حجم درخواست خروجی بیش از حد مجاز است');

    const target = await this.assertPublicUrl(value, options.allowLocalhostInDevelopment);
    const headers = { ...(options.headers ?? {}) };
    if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
      headers['Content-Length'] = String(body.length);
    }
    const response = await this.requestPinned(
      target,
      headers,
      method,
      body,
      Math.min(120_000, Math.max(1_000, options.timeoutMs ?? 30_000)),
    );
    const status = response.statusCode || 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.resume();
      throw new BadRequestException('مقصد خروجی تغییر مسیر داد؛ آدرس نهایی سرویس را وارد کنید');
    }
    const contentType = headerValue(response.headers, 'content-type').toLowerCase();
    if (contentType && options.acceptedTypes?.length && !options.acceptedTypes.some((type) => contentType.includes(type))) {
      response.resume();
      throw new BadRequestException('نوع محتوای پاسخ سرویس قابل قبول نیست');
    }
    const buffer = await this.readResponse(
      response,
      options.maxResponseBytes ?? 2 * 1024 * 1024,
      'حجم پاسخ سرویس بیش از حد مجاز است',
    );
    const text = () => new TextDecoder('utf-8').decode(buffer);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: response.headers,
      buffer,
      text,
      json: <T = unknown>() => JSON.parse(text()) as T,
    };
  }

  private async resolveSourceFetchBridge(config?: SourceFetchSettings): Promise<{ url: string; secret: string }> {
    if (config?.source_fetch_bridge_url) {
      return {
        url: String(config.source_fetch_bridge_url).trim().replace(/\/+$/u, ''),
        secret: String(config.source_fetch_bridge_secret || '').trim(),
      };
    }
    if (!this.publishingSettings) {
      return { url: '', secret: '' };
    }
    return this.publishingSettings.getResolvedSourceFetchBridge();
  }

  async testSourceFetchBridge(config?: SourceFetchSettings): Promise<{ ok: boolean; message: string }> {
    const { url, secret } = await this.resolveSourceFetchBridge(config);
    if (!url) return { ok: false, message: SOURCE_FETCH_BRIDGE_MISSING_MESSAGE };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (secret) headers['X-Bridge-Secret'] = secret;

    try {
      const response = await this.safeRequest(`${url}/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'probe' }),
        acceptedTypes: ['application/json'],
        timeoutMs: 30_000,
        maxResponseBytes: 32_000,
        allowLocalhostInDevelopment: true,
      });
      const payload = response.json<{ ok?: boolean; error?: string; worker?: string }>();
      if (!response.ok || !payload.ok) {
        return { ok: false, message: payload.error || `Worker با خطای HTTP ${response.status} پاسخ داد` };
      }
      return {
        ok: true,
        message: payload.worker === 'deska'
          ? 'اتصال Worker Deska با موفقیت تأیید شد.'
          : 'اتصال Worker دریافت منبع با موفقیت تأیید شد.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تست Worker ناموفق بود';
      return { ok: false, message };
    }
  }

  private async safeFetchTextViaBridge(
    initialUrl: string,
    maxBytes: number,
    acceptedTypes: string[],
  ): Promise<string> {
    const { url: bridgeUrl, secret } = await this.resolveSourceFetchBridge();
    if (!bridgeUrl) throw new BadRequestException(SOURCE_FETCH_BRIDGE_MISSING_MESSAGE);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (secret) headers['X-Bridge-Secret'] = secret;

    const response = await this.safeRequest(`${bridgeUrl}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: initialUrl,
        accept: `${acceptedTypes.join(', ')}, */*;q=0.1`,
        user_agent: 'Mozilla/5.0 (compatible; DESKA-Newsroom/1.0; +https://pixad.ir)',
      }),
      acceptedTypes: ['application/json'],
      timeoutMs: 45_000,
      maxResponseBytes: bridgeHttpResponseLimit(maxBytes),
      allowLocalhostInDevelopment: true,
    });

    const payload = response.json<{
      ok?: boolean;
      error?: string;
      body?: string;
      content_type?: string;
    }>();
    if (!response.ok || !payload.ok) {
      const code = String(payload.error || '');
      if (code === 'upstream_http_429') {
        throw new BadRequestException(
          'محدودیت موقت دریافت از X/Twitter؛ چند دقیقه بعد دوباره تلاش کنید یا Worker دریافت منبع را در پلتفرم بررسی کنید',
        );
      }
      const detail = code || `Worker منبع با خطای HTTP ${response.status} پاسخ داد`;
      throw new BadRequestException(`دریافت منبع از طریق Worker ناموفق بود: ${detail}`);
    }

    const body = String(payload.body || '');
    if (!body) throw new BadRequestException('Worker منبع پاسخ خالی برگرداند');
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
      throw new BadRequestException('حجم محتوای منبع بیش از حد مجاز است');
    }

    const contentType = String(payload.content_type || '').toLowerCase();
    const typeAllowed = contentTypeIsAccepted(contentType, acceptedTypes)
      || bodyMatchesAcceptedTypes(body, acceptedTypes);
    if (!typeAllowed) {
      throw new BadRequestException('نوع محتوای دریافتی از Worker منبع قابل قبول نیست');
    }
    return body;
  }

  private async safeFetchTextDirect(initialUrl: string, maxBytes: number, acceptedTypes: string[]): Promise<string> {
    let target = await this.assertPublicUrl(initialUrl);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const response = await this.requestPinned(target, {
        'user-agent': 'Mozilla/5.0 (compatible; DESKA-Newsroom/1.0; +https://pixad.ir)',
        Accept: `${acceptedTypes.join(', ')}, */*;q=0.1`,
        'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      });
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headerValue(response.headers, 'location');
        response.resume();
        if (!location || redirect === MAX_REDIRECTS) throw new BadRequestException('تعداد تغییر مسیرهای منبع بیش از حد مجاز است');
        target = await this.assertRedirect(location, target.url);
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new BadRequestException(`منبع با خطای HTTP ${status} پاسخ داد`);
      }
      const contentType = headerValue(response.headers, 'content-type').toLowerCase();
      const bytes = await this.readResponse(response, maxBytes, 'حجم محتوای منبع بیش از حد مجاز است');
      const body = new TextDecoder('utf-8').decode(bytes);
      if (!contentTypeIsAccepted(contentType, acceptedTypes) && !bodyMatchesAcceptedTypes(body, acceptedTypes)) {
        throw new BadRequestException('نوع محتوای دریافتی از منبع قابل قبول نیست');
      }
      return body;
    }
    throw new BadRequestException('دریافت منبع انجام نشد');
  }

  private rememberBridgeHost(hostname: string) {
    const host = hostname.toLowerCase();
    this.bridgePreferredHosts.add(host);
    if (this.bridgePreferredHosts.size <= 300) return;
    const first = this.bridgePreferredHosts.values().next().value;
    if (first) this.bridgePreferredHosts.delete(first);
  }

  private async safeFetchText(initialUrl: string, maxBytes: number, acceptedTypes: string[]): Promise<string> {
    let hostname = '';
    try {
      hostname = new URL(initialUrl).hostname;
    } catch {
      throw new BadRequestException('آدرس منبع معتبر نیست');
    }

    const { url: bridgeUrl } = await this.resolveSourceFetchBridge();
    const bridgeConfigured = Boolean(bridgeUrl);
    const mustUseBridge = hostRequiresSourceBridge(hostname);
    const preferBridge = this.bridgePreferredHosts.has(hostname.toLowerCase());
    const bridgeFirst = shouldPreferSourceBridgeFirst(hostname, bridgeConfigured) || preferBridge;

    if (mustUseBridge) {
      if (bridgeConfigured) {
        return this.safeFetchTextViaBridge(initialUrl, maxBytes, acceptedTypes);
      }
      this.logger.warn(`Source fetch bridge is not configured for ${hostname}; trying direct fetch`);
    } else if (bridgeFirst) {
      try {
        return await this.safeFetchTextViaBridge(initialUrl, maxBytes, acceptedTypes);
      } catch (bridgeError) {
        this.logger.warn(
          `Worker fetch failed for ${hostname}; trying direct fetch: ${httpErrorMessage(bridgeError)}`,
        );
      }
    }

    try {
      return await this.safeFetchTextDirect(initialUrl, maxBytes, acceptedTypes);
    } catch (directError) {
      if (!mustUseBridge && bridgeConfigured && isRetryableDirectFetchError(directError)) {
        this.logger.warn(`Direct fetch failed for ${hostname}; retrying through Worker`);
        this.rememberBridgeHost(hostname);
        try {
          return await this.safeFetchTextViaBridge(initialUrl, maxBytes, acceptedTypes);
        } catch (bridgeError) {
          this.logger.warn(`Worker fetch also failed for ${hostname}: ${httpErrorMessage(bridgeError)}`);
          throw bridgeError instanceof BadRequestException
            ? bridgeError
            : new BadRequestException(httpErrorMessage(bridgeError));
        }
      }
      if (!bridgeConfigured && isDirectConnectionBlockedError(directError) && !isDomesticSourceHost(hostname)) {
        throw new BadRequestException(
          `${httpErrorMessage(directError)} ${SOURCE_FETCH_BRIDGE_MISSING_MESSAGE}`,
        );
      }
      throw directError;
    }
  }
}
