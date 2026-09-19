import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';
import { FEED_SOURCE_TYPES, SOURCE_LANGUAGES, type FeedSourceType } from '@deska/shared';

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
  @IsIn(SOURCE_LANGUAGES)
  sourceLanguage?: (typeof SOURCE_LANGUAGES)[number];

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
  @IsIn(SOURCE_LANGUAGES)
  sourceLanguage?: (typeof SOURCE_LANGUAGES)[number];

  @IsOptional()
  @IsIn(FEED_PURPOSES)
  purpose?: FeedPurpose;
}

export class UpdateTenantPlatformFeedDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsBoolean() autoPoll?: boolean;
  @IsOptional() @IsBoolean() autoPrepare?: boolean;
  @IsOptional() @IsBoolean() autoPublish?: boolean;
  @IsOptional() @IsBoolean() autoSendSocial?: boolean;

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
