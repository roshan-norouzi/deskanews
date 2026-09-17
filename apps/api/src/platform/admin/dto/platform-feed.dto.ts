import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';
import { SOURCE_TYPES } from '../../../modules/smart-publishing/dto/feed.dto';

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
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: (typeof SOURCE_TYPES)[number];

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
