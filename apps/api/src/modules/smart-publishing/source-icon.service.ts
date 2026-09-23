import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { extractFeedDomain } from '@deska/shared';
import { RedisCache } from '../../common/redis/redis-cache';
import { SourceReaderService } from './source-reader.service';

const FETCH_TIMEOUT_MS = 2000;
const MAX_ICON_BYTES = 200_000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
const DOMAIN_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/iu;
const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.arpa'];
const ICON_TYPES = ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream', ''];

export function sanitizeSourceIconDomain(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(String(value || '').trim());
  } catch {
    return '';
  }
  const raw = decoded.toLowerCase().replace(/^www\./u, '');
  if (!DOMAIN_PATTERN.test(raw)) return '';
  if (isIP(raw) || /^[\d.]+$/u.test(raw)) return '';
  if (!/[a-z]/u.test(raw.split('.').pop() || '')) return '';
  if (INTERNAL_SUFFIXES.some((suffix) => raw.endsWith(suffix))) return '';
  return raw;
}

type Icon = { buffer: Buffer; contentType: string };

@Injectable()
export class SourceIconService {
  private readonly logger = new Logger(SourceIconService.name);
  private readonly inflight = new Map<string, Promise<Icon | null>>();

  constructor(
    private readonly sourceReader: SourceReaderService,
    @Optional() private readonly cache?: RedisCache,
  ) {}

  async getIcon(domainOrUrl: string): Promise<Icon | null> {
    const domain = sanitizeSourceIconDomain(domainOrUrl) || extractFeedDomain(domainOrUrl);
    const safeDomain = sanitizeSourceIconDomain(domain);
    if (!safeDomain) return null;

    const existing = this.inflight.get(safeDomain);
    if (existing) return existing;

    const task = this.loadIcon(safeDomain).finally(() => this.inflight.delete(safeDomain));
    this.inflight.set(safeDomain, task);
    return task;
  }

  private storageDir() {
    return path.join(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'), 'source-icons');
  }

  private cachePath(domain: string, ext: string) {
    return path.join(this.storageDir(), `${domain}${ext}`);
  }

  private async loadIcon(domain: string): Promise<Icon | null> {
    const cached = await this.readCached(domain);
    if (cached) return cached;
    if (await this.hasRecentNegativeCache(domain)) return null;

    const { icon, resolvable } = await this.fetchIcon(domain);
    await fs.mkdir(this.storageDir(), { recursive: true }).catch(() => undefined);
    if (!icon) {
      const stamp = String(Date.now());
      await this.cache?.set(`deska:icon-miss:${domain}`, stamp, 24 * 60 * 60);
      // Unresolvable or internal names must not grow the disk cache without bound.
      if (resolvable) await fs.writeFile(this.cachePath(domain, '.missing'), stamp).catch(() => undefined);
      return null;
    }
    await fs.writeFile(this.cachePath(domain, this.extensionFor(icon.contentType)), icon.buffer).catch((error) => {
      this.logger.warn(`Could not cache source icon for ${domain}: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
    return icon;
  }

  private async readCached(domain: string): Promise<Icon | null> {
    for (const [ext, contentType] of [
      ['.png', 'image/png'],
      ['.ico', 'image/x-icon'],
      ['.jpg', 'image/jpeg'],
      ['.webp', 'image/webp'],
      ['.gif', 'image/gif'],
    ] as const) {
      try {
        const buffer = await fs.readFile(this.cachePath(domain, ext));
        if (buffer.length) return { buffer, contentType };
      } catch {
        continue;
      }
    }
    return null;
  }

  private async hasRecentNegativeCache(domain: string): Promise<boolean> {
    const redisStamp = Number(await this.cache?.get(`deska:icon-miss:${domain}`));
    if (Number.isFinite(redisStamp) && redisStamp > 0 && Date.now() - redisStamp < NEGATIVE_TTL_MS) return true;
    try {
      const stamp = Number(await fs.readFile(this.cachePath(domain, '.missing'), 'utf8'));
      return Number.isFinite(stamp) && Date.now() - stamp < NEGATIVE_TTL_MS;
    } catch {
      return false;
    }
  }

  private extensionFor(contentType: string): string {
    if (contentType.includes('png')) return '.png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
    if (contentType.includes('webp')) return '.webp';
    if (contentType.includes('gif')) return '.gif';
    return '.ico';
  }

  private async fetchIcon(domain: string): Promise<{ icon: Icon | null; resolvable: boolean }> {
    const direct = await this.fetchBuffer(`https://${domain}/favicon.ico`);
    if (direct.icon) return { icon: direct.icon, resolvable: true };
    // Third-party favicon services are only asked about domains that passed the public-address check.
    if (direct.blocked) return { icon: null, resolvable: false };
    for (const url of [
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
    ]) {
      const result = await this.fetchBuffer(url);
      if (result.icon) return { icon: result.icon, resolvable: true };
    }
    return { icon: null, resolvable: true };
  }

  private async fetchBuffer(url: string): Promise<{ icon: Icon | null; blocked: boolean }> {
    try {
      const response = await this.sourceReader.fetchPublicResource(url, {
        accept: 'image/*,*/*;q=0.8',
        maxBytes: MAX_ICON_BYTES,
        allowedTypes: ICON_TYPES,
        timeoutMs: FETCH_TIMEOUT_MS,
      });
      if (response.status < 200 || response.status >= 300) return { icon: null, blocked: false };
      if (response.buffer.length < 16) return { icon: null, blocked: false };
      const contentType = response.contentType.startsWith('image/') ? response.contentType : 'image/x-icon';
      return { icon: { buffer: response.buffer, contentType }, blocked: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const blocked = error instanceof BadRequestException
        && (message.includes('آدرس داخلی') || message.includes('قابل شناسایی نیست') || message.includes('معتبر نیست'));
      return { icon: null, blocked };
    }
  }
}
