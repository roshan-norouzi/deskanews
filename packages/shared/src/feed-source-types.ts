export const FEED_SOURCE_TYPES = ['rss', 'website', 'blog', 'telegram', 'twitter'] as const;

export type FeedSourceType = (typeof FEED_SOURCE_TYPES)[number];

export const FEED_SOURCE_TYPE_META: Record<
  FeedSourceType,
  { label: string; shortLabel: string; description: string; placeholder: string }
> = {
  rss: {
    label: 'آدرس فید RSS',
    shortLabel: 'فید RSS',
    description: 'RSS / Atom / JSON Feed',
    placeholder: 'https://example.com/feed.xml',
  },
  website: {
    label: 'آدرس وب‌سایت',
    shortLabel: 'وب‌سایت',
    description: 'سیستم فید استاندارد سایت را پیدا می‌کند',
    placeholder: 'https://example.com',
  },
  blog: {
    label: 'آدرس وبلاگ',
    shortLabel: 'وبلاگ',
    description: 'مطالب از صفحهٔ وبلاگ یا آرشیو خوانده می‌شوند',
    placeholder: 'https://example.com/blog',
  },
  telegram: {
    label: 'آدرس کانال تلگرام',
    shortLabel: 'کانال تلگرام',
    description: 'کانال باید عمومی باشد؛ مانند t.me/channel',
    placeholder: 'https://t.me/channelname',
  },
  twitter: {
    label: 'آدرس حساب X',
    shortLabel: 'X / Twitter',
    description: 'حساب باید عمومی باشد',
    placeholder: 'https://x.com/username',
  },
};

export function isFeedSourceType(value: string): value is FeedSourceType {
  return (FEED_SOURCE_TYPES as readonly string[]).includes(value);
}

export function normalizeFeedSourceType(value: unknown): FeedSourceType {
  return typeof value === 'string' && isFeedSourceType(value) ? value : 'rss';
}

export type FeedSourceCategory = 'media' | 'telegram' | 'twitter';

export const FEED_SOURCE_CATEGORIES: Record<
  FeedSourceCategory,
  { label: string; description: string; sourceTypes: readonly FeedSourceType[] }
> = {
  media: {
    label: 'رسانه‌ها',
    description: 'خبرگزاری‌ها، وب‌سایت‌ها، فید RSS و وبلاگ',
    sourceTypes: ['rss', 'website', 'blog'],
  },
  telegram: {
    label: 'کانال‌های تلگرام',
    description: 'کانال‌های عمومی تلگرام',
    sourceTypes: ['telegram'],
  },
  twitter: {
    label: 'اکانت X',
    description: 'حساب‌های عمومی X / Twitter',
    sourceTypes: ['twitter'],
  },
};

export const FEED_SOURCE_CATEGORY_ORDER: FeedSourceCategory[] = ['media', 'telegram', 'twitter'];

export function feedSourceCategory(sourceType: FeedSourceType): FeedSourceCategory {
  if (sourceType === 'telegram') return 'telegram';
  if (sourceType === 'twitter') return 'twitter';
  return 'media';
}

export function defaultSourceTypeForCategory(category: FeedSourceCategory): FeedSourceType {
  return FEED_SOURCE_CATEGORIES[category].sourceTypes[0];
}

export function feedSourceTypeHint(sourceType: FeedSourceType): string {
  switch (sourceType) {
    case 'website':
      return 'برای وب‌سایت، سیستم تلاش می‌کند فید RSS/Atom/JSON مناسب را پیدا کند.';
    case 'blog':
      return 'برای وبلاگ، مطالب از صفحهٔ اصلی یا آرشیو استخراج می‌شوند.';
    case 'telegram':
      return 'کانال تلگرام باید عمومی باشد. آدرس را مانند https://t.me/channelname وارد کنید.';
    case 'twitter':
      return 'حساب X باید عمومی باشد. آدرس را مانند https://x.com/username وارد کنید.';
    default:
      return 'آدرس مستقیم فید RSS، Atom یا JSON Feed را وارد کنید.';
  }
}
