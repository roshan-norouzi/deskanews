import type { SourceType } from '../dto/feed.dto';

export interface AdapterConfig {
  sitemapUrl?: string;
  channelUsername?: string;
  maxItems?: number;
  listSelector?: string;
  articleSelector?: string;
}

export interface FeedReadTarget {
  sourceType: SourceType;
  url: string;
  adapterConfig?: AdapterConfig | null;
  telegramBridgeUrl?: string;
}

export function parseAdapterConfig(value: unknown): AdapterConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const config: AdapterConfig = {};
  if (typeof record.sitemapUrl === 'string' && record.sitemapUrl.trim()) {
    config.sitemapUrl = record.sitemapUrl.trim();
  }
  if (typeof record.channelUsername === 'string' && record.channelUsername.trim()) {
    config.channelUsername = record.channelUsername.trim().replace(/^@/u, '');
  }
  if (typeof record.maxItems === 'number' && Number.isInteger(record.maxItems) && record.maxItems >= 1 && record.maxItems <= 200) {
    config.maxItems = record.maxItems;
  }
  if (typeof record.listSelector === 'string' && record.listSelector.trim()) {
    config.listSelector = record.listSelector.trim();
  }
  if (typeof record.articleSelector === 'string' && record.articleSelector.trim()) {
    config.articleSelector = record.articleSelector.trim();
  }
  return config;
}

export function adapterConfigForDb(value: unknown): Record<string, string | number> {
  return parseAdapterConfig(value) as Record<string, string | number>;
}

export function maxItemsFromConfig(config: AdapterConfig, fallback = 50): number {
  return Number.isInteger(config.maxItems) && config.maxItems! >= 1
    ? Math.min(config.maxItems!, 200)
    : fallback;
}
