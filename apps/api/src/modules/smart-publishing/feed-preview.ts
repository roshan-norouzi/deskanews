import { entryFilterText, matchesWordFilters } from './feed-word-filter';

export interface FeedPreviewItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: Date | null;
  featuredImageUrl: string;
  category: string;
}

export function buildLatestFeedPreviewItems(
  entries: Array<{
    title: string;
    summary?: string;
    content?: string;
    canonicalUrl: string;
    publishedAt?: Date | null;
    featuredImageUrl?: string;
    category?: string;
  }>,
  includeWords: string[],
  excludeWords: string[],
  limit = 5,
): FeedPreviewItem[] {
  return entries
    .filter((entry) => matchesWordFilters(entryFilterText(entry), includeWords, excludeWords))
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftTime = left.entry.publishedAt?.getTime() ?? 0;
      const rightTime = right.entry.publishedAt?.getTime() ?? 0;
      return rightTime - leftTime || left.index - right.index;
    })
    .slice(0, limit)
    .map(({ entry }) => ({
      title: entry.title,
      summary: entry.summary || entry.content?.slice(0, 500) || '',
      url: entry.canonicalUrl,
      publishedAt: entry.publishedAt ?? null,
      featuredImageUrl: entry.featuredImageUrl || '',
      category: entry.category || '',
    }));
}
