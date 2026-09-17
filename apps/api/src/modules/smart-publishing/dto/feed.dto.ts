import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';

export const FEED_PURPOSES = ['news-room', 'social-studio'] as const;
export type FeedPurpose = (typeof FEED_PURPOSES)[number];

export const SOURCE_TYPES = ['rss', 'website'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

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
  @IsIn(FEED_PURPOSES)
  purpose?: FeedPurpose;
}

export class TogglePlatformFeedDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
