import {
  FEED_CATALOG_GROUPS,
  FEED_CATALOG_GROUP_ORDER,
  FEED_SOURCE_CATEGORIES,
  FEED_SOURCE_CATEGORY_ORDER,
  FEED_SOURCE_TYPE_META,
  defaultSourceTypeForCatalogGroup,
  emptyFeedsByCatalogGroup,
  feedCatalogGroupFromSourceType,
  feedSourceCategory,
  feedSourceTypeHint,
  type FeedCatalogGroup,
  type FeedSourceCategory,
  type FeedSourceType,
} from '@deska/shared';
import { BookOpen, Building2, Globe2, Home, Newspaper, Rss, Send, Twitter } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type { FeedCatalogGroup, FeedSourceCategory, FeedSourceType };
export {
  FEED_CATALOG_GROUPS,
  FEED_CATALOG_GROUP_ORDER,
  FEED_SOURCE_CATEGORIES,
  FEED_SOURCE_CATEGORY_ORDER,
  defaultSourceTypeForCatalogGroup,
  emptyFeedsByCatalogGroup,
  feedCatalogGroupFromSourceType,
  feedSourceCategory,
  feedSourceTypeHint,
};

/** @deprecated use FEED_CATALOG_GROUP_ORDER */
export const defaultSourceTypeForCategory = defaultSourceTypeForCatalogGroup;

export const FEED_CATALOG_GROUP_UI: Record<FeedCatalogGroup, { icon: LucideIcon }> = {
  'media-domestic': { icon: Home },
  'media-international': { icon: Globe2 },
  'orgs-companies': { icon: Building2 },
  telegram: { icon: Send },
  twitter: { icon: Twitter },
};

export const FEED_SOURCE_CATEGORY_UI: Record<FeedSourceCategory, { icon: LucideIcon }> = {
  media: { icon: Newspaper },
  telegram: { icon: Send },
  twitter: { icon: Twitter },
};

export const FEED_SOURCE_UI: Record<
  FeedSourceType,
  {
    label: string;
    shortLabel: string;
    description: string;
    placeholder: string;
    icon: LucideIcon;
  }
> = {
  rss: { ...FEED_SOURCE_TYPE_META.rss, icon: Rss },
  website: { ...FEED_SOURCE_TYPE_META.website, icon: Globe2 },
  blog: { ...FEED_SOURCE_TYPE_META.blog, icon: BookOpen },
  telegram: { ...FEED_SOURCE_TYPE_META.telegram, icon: Send },
  twitter: { ...FEED_SOURCE_TYPE_META.twitter, icon: Twitter },
};

export function feedSourceMeta(sourceType?: string) {
  const key = (sourceType && sourceType in FEED_SOURCE_UI ? sourceType : 'rss') as FeedSourceType;
  return FEED_SOURCE_UI[key];
}

export function sortFeedsByName<T extends { name: string }>(feeds: T[]): T[] {
  return [...feeds].sort((left, right) => left.name.localeCompare(right.name, 'fa'));
}

export function resolveCatalogGroup(
  sourceType?: string,
  catalogGroup?: string,
  sourceLanguage?: string,
): FeedCatalogGroup {
  const normalized = String(catalogGroup || '').trim();
  if ((FEED_CATALOG_GROUP_ORDER as readonly string[]).includes(normalized)) {
    return normalized as FeedCatalogGroup;
  }
  const type = (sourceType && sourceType in FEED_SOURCE_UI ? sourceType : 'rss') as FeedSourceType;
  const mediaScope = sourceLanguage === 'fa' ? 'domestic' : 'international';
  return feedCatalogGroupFromSourceType(type, mediaScope);
}
