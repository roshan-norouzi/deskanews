import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { FeedChannelDto } from '../../../modules/smart-publishing/dto/feed.dto';
import { FEED_CATALOG_GROUP_ORDER, SOURCE_LANGUAGE_CODE_PATTERN } from '@deska/shared';
import { SOURCE_TYPES } from '../../../modules/smart-publishing/dto/feed.dto';

const CATALOG_GROUPS = FEED_CATALOG_GROUP_ORDER;
export class CreatePlatformFeedDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsIn(CATALOG_GROUPS)
  catalogGroup?: (typeof CATALOG_GROUPS)[number];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Matches(SOURCE_LANGUAGE_CODE_PATTERN, { message: 'زبان منبع معتبر نیست' })
  sourceLanguage?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

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

export class UpdatePlatformFeedDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsIn(CATALOG_GROUPS)
  catalogGroup?: (typeof CATALOG_GROUPS)[number];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Matches(SOURCE_LANGUAGE_CODE_PATTERN, { message: 'زبان منبع معتبر نیست' })
  sourceLanguage?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

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
