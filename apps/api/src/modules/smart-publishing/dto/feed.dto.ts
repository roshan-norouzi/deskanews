import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { IsFeedSourceUrl } from '../validators/feed-source-url.validator';

export const FEED_PURPOSES = ['news-room', 'social-studio'] as const;
export type FeedPurpose = (typeof FEED_PURPOSES)[number];

export const SOURCE_TYPES = ['rss', 'website', 'telegram', 'sitemap'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const RIGHTS_MODES = ['monitor_only', 'quote_ok', 'rewrite_required', 'licensed_fulltext'] as const;
export type RightsMode = (typeof RIGHTS_MODES)[number];

export class CreateFeedDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsFeedSourceUrl()
  url!: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: SourceType;

  @IsOptional()
  @IsIn(RIGHTS_MODES)
  rightsMode?: RightsMode;

  @IsOptional()
  @IsObject()
  adapterConfig?: Record<string, unknown>;

  @IsOptional()
  includeWords?: string | string[];

  @IsOptional()
  excludeWords?: string | string[];

  @IsOptional() @IsInt() @Min(5) @Max(1440)
  pollIntervalMinutes?: number;

  @IsOptional() @IsBoolean() autoPoll?: boolean;
  @IsOptional() @IsBoolean() autoPrepare?: boolean;
  @IsOptional() @IsBoolean() autoPublish?: boolean;
  @IsOptional() @IsBoolean() autoSendSocial?: boolean;

  @IsIn(FEED_PURPOSES)
  purpose!: FeedPurpose;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateFeedDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsFeedSourceUrl()
  url?: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: SourceType;

  @IsOptional()
  @IsIn(RIGHTS_MODES)
  rightsMode?: RightsMode;

  @IsOptional()
  @IsObject()
  adapterConfig?: Record<string, unknown>;

  @IsOptional()
  includeWords?: string | string[];

  @IsOptional()
  excludeWords?: string | string[];

  @IsOptional() @IsInt() @Min(5) @Max(1440)
  pollIntervalMinutes?: number;

  @IsOptional() @IsBoolean() autoPoll?: boolean;
  @IsOptional() @IsBoolean() autoPrepare?: boolean;
  @IsOptional() @IsBoolean() autoPublish?: boolean;
  @IsOptional() @IsBoolean() autoSendSocial?: boolean;

  @IsOptional()
  @IsIn(FEED_PURPOSES)
  purpose?: FeedPurpose;
}

export class TogglePlatformFeedDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
