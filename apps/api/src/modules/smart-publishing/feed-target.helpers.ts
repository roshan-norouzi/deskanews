import { BadRequestException } from '@nestjs/common';
import { FEED_PURPOSES, type FeedPurpose, type SourceType } from './dto/feed.dto';

export function normalizePurpose(value: unknown, fallback: FeedPurpose = 'news-room'): FeedPurpose {
  return FEED_PURPOSES.includes(value as FeedPurpose) ? value as FeedPurpose : fallback;
}

export function normalizeFeedUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    url.hash = '';
    return url.toString();
  } catch {
    throw new BadRequestException('آدرس منبع معتبر نیست');
  }
}

export function normalizeSourceType(value: unknown): SourceType {
  return value === 'website' ? 'website' : 'rss';
}

export function effectiveReadTarget(feed: { sourceType: string; url: string; resolvedFeedUrl: string }) {
  if (feed.sourceType === 'website' && feed.resolvedFeedUrl) {
    return { sourceType: 'rss' as SourceType, url: feed.resolvedFeedUrl };
  }
  return { sourceType: (feed.sourceType || 'rss') as SourceType, url: feed.url };
}

export function socialFeedReadTarget(feed: { sourceType: string; url: string; resolvedFeedUrl: string }) {
  const readUrl = feed.sourceType === 'website' && feed.resolvedFeedUrl ? feed.resolvedFeedUrl : feed.url;
  const readType = feed.sourceType === 'website' && feed.resolvedFeedUrl ? 'rss' : (feed.sourceType || 'rss');
  return { sourceType: readType as SourceType, url: readUrl };
}
