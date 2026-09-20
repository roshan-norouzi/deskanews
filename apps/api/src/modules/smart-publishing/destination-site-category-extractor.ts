import { BadRequestException } from '@nestjs/common';
import { load, type CheerioAPI } from 'cheerio';
import type { SourceReaderService } from './source-reader.service';
import type { WordPressClient } from './wordpress.client';
import type { WordPressCategory } from './wordpress-category';

export interface ExtractedDestinationCategory {
  externalId: string;
  name: string;
  slug: string;
  parentExternalId: string;
  serviceUrl: string;
  rssUrl: string;
}

const SKIP_NAME = /^(?:صفحه\s*اصلی|خانه|home|login|logout|sign\s*in|register|ورود|ثبت\s*نام|تماس|درباره|about|contact|search|جستجو|کل\s*اخبار|صفحه\s*نخست)$/iu;
const SKIP_HREF = /(?:login|logout|signin|register|contact|about|search|tag\/|author\/|javascript:|mailto:|tel:|#)/iu;
const IRAN_SYSTEM_SKIP_SLUGS = new Set(['news', 'page', 'tag', 'author', 'search', 'archive', 'static']);

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

export function normalizeCategoryLabel(name: string): string {
  return name.replace(/\s+/gu, ' ').replace(/[:：]+$/u, '').trim();
}

function mapWordPressCategory(category: WordPressCategory, siteUrl: string): ExtractedDestinationCategory {
  const base = new URL(siteUrl);
  const serviceUrl = category.slug
    ? new URL(`/category/${category.slug}`, base).toString()
    : '';
  return {
    externalId: String(category.id),
    name: category.name,
    slug: category.slug || slugifyCategoryName(category.name),
    parentExternalId: category.parent > 0 ? String(category.parent) : '',
    serviceUrl,
    rssUrl: '',
  };
}

export function isIranSystemNewsArticlePath(pathname: string): boolean {
  return /\/(?:fa\/)?news\/\d+(?:\/|$)/iu.test(pathname);
}

export function isIranSystemMainServicePath(pathname: string): boolean {
  if (isIranSystemNewsArticlePath(pathname)) return false;
  const serviceMatch = pathname.match(/^\/fa\/([a-z0-9-]+)\/?$/iu);
  return Boolean(serviceMatch?.[1] && !IRAN_SYSTEM_SKIP_SLUGS.has(serviceMatch[1].toLowerCase()));
}

export function extractIranSystemServicePath(pathname: string): { externalId: string; slug: string } | null {
  if (!isIranSystemMainServicePath(pathname)) return null;

  const serviceMatch = pathname.match(/^\/fa\/([a-z0-9-]+)\/?$/iu);
  if (!serviceMatch?.[1]) return null;

  const normalizedPath = pathname.toLowerCase();
  return { externalId: String(stableCategoryId(normalizedPath)), slug: serviceMatch[1].toLowerCase() };
}

export function extractCategoryExternalId(url: URL): string | null {
  if (isIranSystemNewsArticlePath(url.pathname)) return null;

  const iranSystem = extractIranSystemServicePath(url.pathname);
  if (iranSystem) return iranSystem.externalId;

  const target = `${url.pathname}${url.search}`;
  const numericPatterns = [
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
  if (isIranSystemNewsArticlePath(pathname)) return false;
  if (extractIranSystemServicePath(pathname)) return true;
  return /\/(?:fa\/)?(?:archive|section|category|service|group)\/[^\/?#]+/iu.test(pathname)
    && !/\/(?:page|tag|author)\//iu.test(pathname);
}

function addCategoryLink(
  categories: Map<string, ExtractedDestinationCategory>,
  url: URL,
  name: string,
) {
  const cleanedName = normalizeCategoryLabel(name);
  if (!cleanedName || cleanedName.length < 2 || cleanedName.length > 80 || SKIP_NAME.test(cleanedName)) return;

  const hrefValue = `${url.pathname}${url.search}`;
  if (SKIP_HREF.test(hrefValue)) return;

  const externalId = extractCategoryExternalId(url);
  if (!externalId) return;

  const serviceUrl = url.toString();
  const existing = categories.get(externalId);
  if (!existing) {
    categories.set(externalId, {
      externalId,
      name: cleanedName,
      slug: slugifyCategoryName(cleanedName) || externalId,
      parentExternalId: '',
      serviceUrl,
      rssUrl: '',
    });
    return;
  }

  if (!existing.serviceUrl && serviceUrl) {
    existing.serviceUrl = serviceUrl;
  }
  if (!existing.name && cleanedName) {
    existing.name = cleanedName;
  }
}

function collectCategoryLinks(
  $: CheerioAPI,
  base: URL,
  categories: Map<string, ExtractedDestinationCategory>,
  selector: string,
) {
  $(selector).each((_, element) => {
    const href = $(element).attr('href')?.trim();
    const name = $(element).find('span').first().text().replace(/\s+/gu, ' ').trim()
      || $(element).text().replace(/\s+/gu, ' ').trim();
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    if (url.hostname !== base.hostname) return;
    if (url.pathname === '/' || url.pathname === '/fa' || url.pathname === '/fa/') return;

    addCategoryLink(categories, url, name);
  });
}

export function parseIranSystemRssGuide(html: string, baseUrl: string): Map<string, string> {
  const $ = load(html);
  const base = new URL(baseUrl);
  const rssByName = new Map<string, string>();
  const firstBlock = $('.rss_block').first();

  firstBlock.find('.rss_row').each((_, row) => {
    const name = normalizeCategoryLabel($(row).find('.rss_list_pn').text());
    const href = $(row).find('a.rss_list_link').attr('href')?.trim();
    if (!name || !href || SKIP_NAME.test(name)) return;

    let rssUrl: URL;
    try {
      rssUrl = new URL(href, base);
    } catch {
      return;
    }
    if (rssUrl.hostname !== base.hostname) return;
    if (!/^\/fa\/rss\/(?:\d+|section\/\d+)\/?$/iu.test(rssUrl.pathname)) return;

    rssByName.set(name, rssUrl.toString());
  });

  return rssByName;
}

export function attachRssGuideLinks(
  categories: ExtractedDestinationCategory[],
  rssByName: Map<string, string>,
): ExtractedDestinationCategory[] {
  return categories.map((category) => ({
    ...category,
    rssUrl: rssByName.get(normalizeCategoryLabel(category.name)) || category.rssUrl || '',
  }));
}

export function parseIranSystemNavCategories(html: string, baseUrl: string): ExtractedDestinationCategory[] {
  const $ = load(html);
  const base = new URL(baseUrl);
  const categories = new Map<string, ExtractedDestinationCategory>();

  collectCategoryLinks($, base, categories, 'a.nav_link');
  collectCategoryLinks($, base, categories, '.header_services a[href]');

  return [...categories.values()];
}

export function parseCategoriesFromHtml(html: string, baseUrl: string, rssGuideHtml?: string): ExtractedDestinationCategory[] {
  const iranSystemNav = parseIranSystemNavCategories(html, baseUrl);
  const hasIranSystemNavMarkup = /header_services|nav_link/iu.test(html);
  if (hasIranSystemNavMarkup && iranSystemNav.length > 0) {
    const rssByName = rssGuideHtml ? parseIranSystemRssGuide(rssGuideHtml, baseUrl) : new Map<string, string>();
    return attachRssGuideLinks(iranSystemNav, rssByName).slice(0, 100);
  }

  const $ = load(html);
  const base = new URL(baseUrl);
  const categories = new Map<string, ExtractedDestinationCategory>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href')?.trim();
    const name = $(element).text().replace(/\s+/gu, ' ').trim();
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    if (url.hostname !== base.hostname) return;
    addCategoryLink(categories, url, name);
  });

  const rssByName = rssGuideHtml ? parseIranSystemRssGuide(rssGuideHtml, baseUrl) : new Map<string, string>();
  return attachRssGuideLinks([...categories.values()], rssByName).slice(0, 100);
}

async function fetchHtmlCategories(siteUrl: string, sourceReader: SourceReaderService): Promise<ExtractedDestinationCategory[]> {
  const candidates = [siteUrl, new URL('./fa', siteUrl).toString(), new URL('./fa/news', siteUrl).toString(), new URL('./news', siteUrl).toString()];
  const rssCandidates = [new URL('./fa/rss', siteUrl).toString(), new URL('./rss', siteUrl).toString()];
  const merged = new Map<string, ExtractedDestinationCategory>();
  let rssGuideHtml = '';

  for (const candidate of [...new Set(rssCandidates)]) {
    const response = await sourceReader.safeRequest(candidate, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      timeoutMs: 20_000,
      maxResponseBytes: 2 * 1024 * 1024,
      allowLocalhostInDevelopment: true,
    });
    if (!response.ok) continue;
    rssGuideHtml = await response.text();
    if (parseIranSystemRssGuide(rssGuideHtml, candidate).size > 0) break;
  }

  for (const candidate of [...new Set(candidates)]) {
    const response = await sourceReader.safeRequest(candidate, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      timeoutMs: 20_000,
      maxResponseBytes: 2 * 1024 * 1024,
      allowLocalhostInDevelopment: true,
    });
    if (!response.ok) continue;
    const html = await response.text();
    for (const category of parseCategoriesFromHtml(html, candidate, rssGuideHtml || undefined)) {
      const existing = merged.get(category.externalId);
      merged.set(category.externalId, {
        ...category,
        serviceUrl: category.serviceUrl || existing?.serviceUrl || '',
        rssUrl: category.rssUrl || existing?.rssUrl || '',
      });
    }
    if (merged.size >= 1) break;
  }

  if (!merged.size && rssGuideHtml) {
    const rssByName = parseIranSystemRssGuide(rssGuideHtml, siteUrl);
    for (const [name, rssUrl] of rssByName.entries()) {
      const externalId = String(stableCategoryId(name));
      merged.set(externalId, {
        externalId,
        name,
        slug: slugifyCategoryName(name) || externalId,
        parentExternalId: '',
        serviceUrl: '',
        rssUrl,
      });
    }
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
    const mainCategories = wpCategories.filter((category) => category.parent === 0);
    if (mainCategories.length) {
      return mainCategories.map((category) => mapWordPressCategory(category, siteUrl));
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
