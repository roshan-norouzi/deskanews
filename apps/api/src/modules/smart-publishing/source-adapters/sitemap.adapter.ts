import { BadRequestException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import type { SourceReaderService } from '../source-reader.service';
import type { FeedReadTarget } from './adapter-config';
import { maxItemsFromConfig } from './adapter-config';
import type { SourceAdapter } from './source-adapter.interface';

function array<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return text((value as Record<string, unknown>)['#text']);
  }
  return '';
}

function extractSitemapLocations(document: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const urlset = document.urlset as Record<string, unknown> | undefined;
  if (urlset?.url) {
    for (const item of array(urlset.url)) {
      const loc = text((item as Record<string, unknown>).loc);
      if (loc) urls.push(loc);
    }
  }

  const sitemapIndex = document.sitemapindex as Record<string, unknown> | undefined;
  if (sitemapIndex?.sitemap) {
    for (const item of array(sitemapIndex.sitemap)) {
      const loc = text((item as Record<string, unknown>).loc);
      if (loc) urls.push(loc);
    }
  }

  return urls;
}

export class SitemapSourceAdapter implements SourceAdapter {
  readonly type = 'sitemap' as const;

  constructor(private readonly reader: SourceReaderService) {}

  async readEntries(target: FeedReadTarget) {
    const config = target.adapterConfig || {};
    const sitemapUrl = config.sitemapUrl || target.url;
    const maxItems = maxItemsFromConfig(config, 30);
    const xml = await this.reader.fetchSitemapXml(sitemapUrl);
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    const document = parser.parse(xml) as Record<string, unknown>;
    let locations = extractSitemapLocations(document);

    if (!locations.length) {
      throw new BadRequestException('در سایت‌مپ آدرس مطلبی پیدا نشد');
    }

    if (document.sitemapindex && locations.length <= 20) {
      const articleUrls: string[] = [];
      for (const childSitemapUrl of locations.slice(0, 5)) {
        try {
          const childXml = await this.reader.fetchSitemapXml(childSitemapUrl);
          const childDocument = parser.parse(childXml) as Record<string, unknown>;
          articleUrls.push(...extractSitemapLocations(childDocument));
        } catch {
          // Skip unreachable child sitemaps and continue with the rest.
        }
        if (articleUrls.length >= maxItems) break;
      }
      if (articleUrls.length) locations = articleUrls;
    }

    const previews = await Promise.all(
      locations.slice(0, maxItems).map((url) => this.reader.readPagePreview(url, url)),
    );
    const entries = previews.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    if (!entries.length) {
      throw new BadRequestException('از آدرس‌های سایت‌مپ مطلب قابل استخراج پیدا نشد');
    }
    return entries;
  }
}
