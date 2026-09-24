import type { FeedSourceType } from './feed-source-types';
import { FEED_SOURCE_TYPES } from './feed-source-types';

export type FeedCatalogGroup =
  | 'media-domestic'
  | 'media-international'
  | 'orgs-companies'
  | 'telegram'
  | 'twitter';

export const FEED_CATALOG_GROUPS: Record<
  FeedCatalogGroup,
  { label: string; description: string; sourceTypes: readonly FeedSourceType[] }
> = {
  'media-domestic': {
    label: 'رسانه‌های داخلی',
    description: 'خبرگزاری‌ها و رسانه‌های فارسی ایران',
    sourceTypes: ['rss', 'website', 'blog'],
  },
  'media-international': {
    label: 'رسانه‌های بین‌المللی',
    description: 'رسانه‌های بومی‌زبان جهان؛ زبان‌های تازه‌شناسایی‌شده به دانش سیستم اضافه می‌شوند',
    sourceTypes: ['rss', 'website', 'blog'],
  },
  'orgs-companies': {
    label: 'سازمان‌ها و شرکت‌ها',
    description: 'میز خبر رسمی نهادها و شرکت‌ها برای منبع اولیه و روابط عمومی',
    sourceTypes: ['website', 'rss'],
  },
  telegram: {
    label: 'کانال‌های تلگرام',
    description: 'کانال‌های خبری مستقل تلگرام (غیر از بازنشر خبرگزاری‌ها)',
    sourceTypes: ['telegram'],
  },
  twitter: {
    label: 'اکانت X',
    description: 'شخصیت‌های سیاسی، رؤسای دولت و خبرنگاران بین‌المللی',
    sourceTypes: ['twitter'],
  },
};

export const FEED_CATALOG_GROUP_ORDER: FeedCatalogGroup[] = [
  'media-domestic',
  'media-international',
  'orgs-companies',
  'telegram',
  'twitter',
];

export function emptyFeedsByCatalogGroup<T = unknown>(): Record<FeedCatalogGroup, T[]> {
  return FEED_CATALOG_GROUP_ORDER.reduce(
    (acc, group) => {
      acc[group] = [];
      return acc;
    },
    {} as Record<FeedCatalogGroup, T[]>,
  );
}

export function defaultSourceTypeForCatalogGroup(group: FeedCatalogGroup): FeedSourceType {
  return FEED_CATALOG_GROUPS[group].sourceTypes[0];
}

export function feedCatalogGroupFromSourceType(
  sourceType: FeedSourceType,
  mediaScope?: 'domestic' | 'international',
): FeedCatalogGroup {
  if (sourceType === 'telegram') return 'telegram';
  if (sourceType === 'twitter') return 'twitter';
  return mediaScope === 'international' ? 'media-international' : 'media-domestic';
}

export function resolveFeedCatalogGroup(
  sourceType?: string,
  catalogGroup?: string | null,
  sourceLanguage?: string | null,
): FeedCatalogGroup {
  const normalizedGroup = String(catalogGroup ?? '').trim();
  if ((FEED_CATALOG_GROUP_ORDER as readonly string[]).includes(normalizedGroup)) {
    return normalizedGroup as FeedCatalogGroup;
  }

  const type = (sourceType && (FEED_SOURCE_TYPES as readonly string[]).includes(sourceType)
    ? sourceType
    : 'rss') as FeedSourceType;

  if (type === 'telegram') return 'telegram';
  if (type === 'twitter') return 'twitter';

  const language = String(sourceLanguage ?? 'auto').trim();
  const mediaScope = language === 'fa' || language === 'auto' ? 'domestic' : 'international';
  return feedCatalogGroupFromSourceType(type, mediaScope);
}

export function normalizeFeedCatalogGroupForSource(
  requested: string | undefined,
  sourceType: FeedSourceType,
  sourceLanguage?: string,
): FeedCatalogGroup {
  const normalized = String(requested ?? '').trim();
  if (
    (FEED_CATALOG_GROUP_ORDER as readonly string[]).includes(normalized)
    && (FEED_CATALOG_GROUPS[normalized as FeedCatalogGroup].sourceTypes as readonly string[]).includes(sourceType)
  ) {
    return normalized as FeedCatalogGroup;
  }
  return resolveFeedCatalogGroup(sourceType, undefined, sourceLanguage);
}
