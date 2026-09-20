import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractFeedDomain } from '@deska/shared';

const FETCH_TIMEOUT_MS = 2000;
const MAX_ICON_BYTES = 200_000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
const DOMAIN_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/iu;

export function sanitizeSourceIconDomain(value: string): string {
  const raw = decodeURIComponent(String(value || '').trim()).toLowerCase().replace(/^www\./u, '');
  if (!DOMAIN_PATTERN.test(raw)) return '';
  return raw;
}

@Injectable()
export class SourceIconService {
  private readonly logger = new Logger(SourceIconService.name);
  private readonly inflight = new Map<string, Promise<{ buffer: Buffer; contentType: string } | null>>();

  async getIcon(domainOrUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
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

  private async loadIcon(domain: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const cached = await this.readCached(domain);
    if (cached) return cached;
    if (await this.hasRecentNegativeCache(domain)) return null;

    const fetched = await this.fetchIcon(domain);
    await fs.mkdir(this.storageDir(), { recursive: true }).catch(() => undefined);
    if (!fetched) {
      await fs.writeFile(this.cachePath(domain, '.missing'), String(Date.now())).catch(() => undefined);
      return null;
    }
    await fs.writeFile(this.cachePath(domain, this.extensionFor(fetched.contentType)), fetched.buffer).catch((error) => {
      this.logger.warn(`Could not cache source icon for ${domain}: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
    return fetched;
  }

  private async readCached(domain: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    for (const [ext, contentType] of [
      ['.png', 'image/png'],
      ['.ico', 'image/x-icon'],
      ['.jpg', 'image/jpeg'],
      ['.webp', 'image/webp'],
      ['.svg', 'image/svg+xml'],
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
    if (contentType.includes('svg')) return '.svg';
    return '.ico';
  }

  private async fetchIcon(domain: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const urls = [
      `https://${domain}/favicon.ico`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
    ];
    for (const url of urls) {
      const result = await this.fetchBuffer(url);
      if (result) return result;
    }
    return null;
  }

  private async fetchBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
        headers: { Accept: 'image/*,*/*;q=0.8' },
      });
      if (!response.ok) return null;
      const contentType = String(response.headers.get('content-type') || 'image/x-icon').split(';')[0].trim();
      if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 16 || buffer.length > MAX_ICON_BYTES) return null;
      return { buffer, contentType: contentType.startsWith('image/') ? contentType : 'image/x-icon' };
    } catch {
      return null;
    }
  }
}
