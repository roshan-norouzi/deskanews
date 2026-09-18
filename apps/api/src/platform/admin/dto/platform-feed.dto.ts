import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { RIGHTS_MODES, SOURCE_TYPES } from '../../../modules/smart-publishing/dto/feed.dto';
import { IsFeedSourceUrl } from '../../../modules/smart-publishing/validators/feed-source-url.validator';

export class CreatePlatformFeedDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsFeedSourceUrl()
  url!: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsIn(RIGHTS_MODES)
  rightsMode?: (typeof RIGHTS_MODES)[number];

  @IsOptional()
  @IsObject()
  adapterConfig?: Record<string, unknown>;

  @IsOptional()
  includeWords?: string | string[];

  @IsOptional()
  excludeWords?: string | string[];

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  pollIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdatePlatformFeedDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsFeedSourceUrl()
  url?: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsIn(RIGHTS_MODES)
  rightsMode?: (typeof RIGHTS_MODES)[number];

  @IsOptional()
  @IsObject()
  adapterConfig?: Record<string, unknown>;

  @IsOptional()
  includeWords?: string | string[];

  @IsOptional()
  excludeWords?: string | string[];

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  pollIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
