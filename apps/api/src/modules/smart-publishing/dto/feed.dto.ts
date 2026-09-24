import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { FEED_CATALOG_GROUP_ORDER, FEED_SOURCE_TYPES, SOURCE_LANGUAGE_CODE_PATTERN, type FeedCatalogGroup, type FeedSourceType } from '@deska/shared';

export class FeedChannelDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  topicLabel?: string;
}

export const FEED_PURPOSES = ['news-room', 'social-studio'] as const;
export type FeedPurpose = (typeof FEED_PURPOSES)[number];

export const SOURCE_TYPES = FEED_SOURCE_TYPES;
export type SourceType = FeedSourceType;

export class CreateFeedDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: SourceType;

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
  @Matches(SOURCE_LANGUAGE_CODE_PATTERN, { message: 'زبان منبع معتبر نیست' })
  sourceLanguage?: string;

  @IsOptional()
  @IsIn(FEED_CATALOG_GROUP_ORDER)
  catalogGroup?: FeedCatalogGroup;

  @IsIn(FEED_PURPOSES)
  purpose!: FeedPurpose;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['default', 'custom'])
  settingsMode?: 'default' | 'custom';

  @IsOptional()
  @IsString()
  @Length(0, 80)
  topicLabel?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedChannelDto)
  channels?: FeedChannelDto[];
}

export class UpdateFeedDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: SourceType;

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
  @Matches(SOURCE_LANGUAGE_CODE_PATTERN, { message: 'زبان منبع معتبر نیست' })
  sourceLanguage?: string;

  @IsOptional()
  @IsIn(FEED_CATALOG_GROUP_ORDER)
  catalogGroup?: FeedCatalogGroup;

  @IsOptional()
  @IsIn(FEED_PURPOSES)
  purpose?: FeedPurpose;

  @IsOptional()
  @IsIn(['default', 'custom'])
  settingsMode?: 'default' | 'custom';

  @IsOptional()
  @IsString()
  @Length(0, 80)
  topicLabel?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedChannelDto)
  channels?: FeedChannelDto[];
}

export class UpdateTenantPlatformFeedDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsBoolean() autoPoll?: boolean | null;
  @IsOptional() @IsBoolean() autoPrepare?: boolean | null;
  @IsOptional() @IsBoolean() autoPublish?: boolean | null;
  @IsOptional() @IsBoolean() autoSendSocial?: boolean | null;

  @IsOptional()
  @IsIn(['default', 'custom'])
  settingsMode?: 'default' | 'custom';

  @IsOptional()
  includeWords?: string | string[];

  @IsOptional()
  excludeWords?: string | string[];

  @IsOptional() @IsInt() @Min(5) @Max(1440)
  pollIntervalMinutes?: number | null;
}

export class TogglePlatformFeedDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ProbeFeedDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: SourceType;

  @IsOptional()
  includeWords?: string | string[];

  @IsOptional()
  excludeWords?: string | string[];
}
