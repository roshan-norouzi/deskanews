import { BadRequestException } from '@nestjs/common';
import { RIGHTS_MODES, SOURCE_TYPES, type RightsMode, type SourceType } from '../dto/feed.dto';
import { parseAdapterConfig, type FeedReadTarget } from './adapter-config';
import {
  normalizeHttpFeedUrl,
  normalizeTelegramChannelUrl,
} from './feed-url.utils';

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
  if (sourceType === 'telegram') {
    const telegramUrl = normalizeTelegramChannelUrl(value);
    if (telegramUrl) return telegramUrl;
    throw new BadRequestException('آدرس کانال تلگرام معتبر نیست؛ مانند @channel یا https://t.me/channel');
  }
  try {
    return normalizeHttpFeedUrl(value);
  } catch {
    throw new BadRequestException('آدرس منبع معتبر نیست');
  }
}

export function effectiveReadTarget(
  feed: FeedSourceRecord,
  options?: { telegramBridgeUrl?: string },
): FeedReadTarget {
  const sourceType = normalizeSourceType(feed.sourceType);
  const adapterConfig = parseAdapterConfig(feed.adapterConfig);
  const telegramBridgeUrl = options?.telegramBridgeUrl?.trim() || '';
  if (sourceType === 'website' && feed.resolvedFeedUrl) {
    return { sourceType: 'rss', url: feed.resolvedFeedUrl, adapterConfig, telegramBridgeUrl };
  }
  return { sourceType, url: feed.url, adapterConfig, telegramBridgeUrl };
}
