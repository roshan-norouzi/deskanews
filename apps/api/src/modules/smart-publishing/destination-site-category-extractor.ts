import { BadRequestException } from '@nestjs/common';
import { load } from 'cheerio';
import type { SourceReaderService } from './source-reader.service';
import type { WordPressClient } from './wordpress.client';
import type { WordPressCategory } from './wordpress-category';

export interface ExtractedDestinationCategory {
  externalId: string;
  name: string;
  slug: string;
  parentExternalId: string;
}

const SKIP_NAME = /^(?:صفحه\s*اصلی|خانه|home|login|logout|sign\s*in|register|ورود|ثبت\s*نام|تماس|درباره|about|contact|search|جستجو)$/iu;
const SKIP_HREF = /(?:login|logout|signin|register|contact|about|search|tag\/|author\/|javascript:|mailto:|tel:|#)/iu;

export function stableCategoryId(input: string): number {
  let hash = 2_166_136_261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (Math.abs(hash) % 900_000) + 100;
}

export function slugifyCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .slice(0, 120);
}

function mapWordPressCategory(category: WordPressCategory): ExtractedDestinationCategory {
  return {
    externalId: String(category.id),
    name: category.name,
    slug: category.slug || slugifyCategoryName(category.name),
    parentExternalId: category.parent > 0 ? String(category.parent) : '',
  };
}

export function extractCategoryExternalId(url: URL): string | null {
  const target = `${url.pathname}${url.search}`;
  const numericPatterns = [
    /\/fa\/news\/(\d+)/iu,
    /\/news\/(?:section|category|archive|service|group)\/(\d+)/iu,
    /\/fa\/(?:cat|category|service|section)\/(\d+)/iu,
    /[?&](?:service_id|section_id|cat_id|category_id)=(\d+)/iu,
    /\/sections?\/(\d+)/iu,
  ];
  for (const pattern of numericPatterns) {
    const match = target.match(pattern);
    if (match?.[1]) return match[1];
  }
  if (looksLikeCategorySlugPath(url.pathname)) {
    return String(stableCategoryId(url.pathname.toLowerCase()));
  }
  return null;
}

export function looksLikeCategorySlugPath(pathname: string): boolean {
  return /\/(?:fa\/)?(?:news|archive|section|category|service|group)\/[^\/?#]+/iu.test(pathname)
    && !/\/(?:page|tag|author)\//iu.test(pathname);
}

export function parseCategoriesFromHtml(html: string, baseUrl: string): ExtractedDestinationCategory[] {
  const $ = load(html);
  const base = new URL(baseUrl);
  const categories = new Map<string, ExtractedDestinationCategory>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href')?.trim();
    const name = $(element).text().replace(/\s+/gu, ' ').trim();
    if (!href || !name || name.length < 2 || name.length > 80 || SKIP_NAME.test(name)) return;

    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    if (url.hostname !== base.hostname) return;

    const hrefValue = `${url.pathname}${url.search}`;
    if (SKIP_HREF.test(hrefValue)) return;

    const externalId = extractCategoryExternalId(url);
    if (!externalId) return;

    if (!categories.has(externalId)) {
      categories.set(externalId, {
        externalId,
        name,
        slug: slugifyCategoryName(name) || externalId,
        parentExternalId: '',
      });
    }
  });

  return [...categories.values()].slice(0, 100);
}

async function fetchHtmlCategories(siteUrl: string, sourceReader: SourceReaderService): Promise<ExtractedDestinationCategory[]> {
  const candidates = [siteUrl, new URL('./fa/news', siteUrl).toString(), new URL('./news', siteUrl).toString()];
  const merged = new Map<string, ExtractedDestinationCategory>();

  for (const candidate of [...new Set(candidates)]) {
    const response = await sourceReader.safeRequest(candidate, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      timeoutMs: 20_000,
      maxResponseBytes: 2 * 1024 * 1024,
      allowLocalhostInDevelopment: true,
    });
    if (!response.ok) continue;
    const html = await response.text();
    for (const category of parseCategoriesFromHtml(html, candidate)) {
      merged.set(category.externalId, category);
    }
    if (merged.size >= 3) break;
  }

  return [...merged.values()];
}

export async function extractDestinationCategoriesFromSite(
  siteUrl: string,
  wordpress: WordPressClient,
  sourceReader: SourceReaderService,
): Promise<ExtractedDestinationCategory[]> {
  try {
    const wpCategories = await wordpress.categoriesPublic({ wp_site_url: siteUrl });
    if (wpCategories.length) {
      return wpCategories.map(mapWordPressCategory);
    }
  } catch {
    // WordPress REST is optional; HTML extraction is the fallback for IranSystem/Nastooh sites.
  }

  const htmlCategories = await fetchHtmlCategories(siteUrl, sourceReader);
  if (!htmlCategories.length) {
    throw new BadRequestException(
      'دسته‌بندی‌ای از آدرس سایت استخراج نشد. آدرس را بررسی کنید؛ اگر سایت WordPress است REST API دسته‌ها باید عمومی باشد.',
    );
  }
  return htmlCategories;
}
