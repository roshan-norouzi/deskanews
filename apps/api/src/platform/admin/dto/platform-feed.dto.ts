import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';
import { FEED_CATALOG_GROUP_ORDER, SOURCE_LANGUAGES } from '@deska/shared';
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
  @IsIn(SOURCE_LANGUAGES)
  sourceLanguage?: (typeof SOURCE_LANGUAGES)[number];
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
  @IsIn(SOURCE_LANGUAGES)
  sourceLanguage?: (typeof SOURCE_LANGUAGES)[number];
}
