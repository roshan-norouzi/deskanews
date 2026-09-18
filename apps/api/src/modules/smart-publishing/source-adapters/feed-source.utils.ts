import { BadRequestException } from '@nestjs/common';
import { RIGHTS_MODES, SOURCE_TYPES, type RightsMode, type SourceType } from '../dto/feed.dto';
import { parseAdapterConfig, type FeedReadTarget } from './adapter-config';

export interface FeedSourceRecord {
  sourceType: string;
  url: string;
  resolvedFeedUrl: string;
  adapterConfig?: unknown;
}

export function normalizeSourceType(value: unknown): SourceType {
  return SOURCE_TYPES.includes(value as SourceType) ? value as SourceType : 'rss';
}

export function normalizeRightsMode(value: unknown, sourceType?: SourceType): RightsMode {
  if (RIGHTS_MODES.includes(value as RightsMode)) return value as RightsMode;
  return defaultRightsMode(sourceType || 'rss');
}

export function defaultRightsMode(sourceType: SourceType): RightsMode {
  return sourceType === 'rss' ? 'quote_ok' : 'rewrite_required';
}

export function normalizeFeedUrl(value: string, sourceType?: SourceType): string {
  const trimmed = value.trim();
  if (sourceType === 'telegram') {
    const username = trimmed.replace(/^@/u, '').replace(/^https?:\/\/(?:www\.)?t\.me\//iu, '').replace(/^t\.me\//iu, '').split('/')[0];
    if (/^[a-z][a-z\d_]{3,31}$/iu.test(username)) {
      return `https://t.me/${username.toLowerCase()}`;
    }
  }
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    url.hash = '';
    return url.toString();
  } catch {
    throw new BadRequestException('آدرس منبع معتبر نیست');
  }
}

export function effectiveReadTarget(feed: FeedSourceRecord): FeedReadTarget {
  const sourceType = normalizeSourceType(feed.sourceType);
  const adapterConfig = parseAdapterConfig(feed.adapterConfig);
  if (sourceType === 'website' && feed.resolvedFeedUrl) {
    return { sourceType: 'rss', url: feed.resolvedFeedUrl, adapterConfig };
  }
  return { sourceType, url: feed.url, adapterConfig };
}
