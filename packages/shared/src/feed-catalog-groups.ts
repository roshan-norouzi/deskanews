import type { FeedSourceType } from './feed-source-types';

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
    description: 'رسانه‌های بومی‌زبان (انگلیسی، عربی، فرانسوی، آلمانی، ترکی، عبری، چینی، ژاپنی)',
    sourceTypes: ['rss', 'website', 'blog'],
  },
  'orgs-companies': {
    label: 'سازمان‌ها و شرکت‌ها',
    description: 'اتاق خبر رسمی نهادها و شرکت‌ها برای منبع اولیه و روابط عمومی',
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
