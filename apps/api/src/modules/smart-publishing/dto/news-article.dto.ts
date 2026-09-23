import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export const NEWS_STATUSES = [
  'new',
  'processing',
  'ready',
  'rejected',
  'publishing',
  'published',
  'failed',
  'publish_failed',
  'social_processing',
  'social_sent',
  'social_failed',
] as const;

export type NewsStatus = (typeof NEWS_STATUSES)[number];

export class UpdateNewsArticleDto {
  @IsOptional() @IsString() @MaxLength(500) titleFa?: string;
  @IsOptional() @IsString() @MaxLength(4000) summaryFa?: string;
  @IsOptional() @IsIn(['ready']) status?: 'ready';
  @IsOptional() @IsString() destinationCategoryId?: string | null;
}

export class PublishNewsArticleDto {
  @IsOptional() @IsString() @MaxLength(500) titleFa?: string;
  @IsOptional() @IsString() @MaxLength(4000) summaryFa?: string;
  @IsOptional() @IsString() @MaxLength(200_000) contentFa?: string;
  /** Final WordPress body HTML (includes editable attribution). Preferred over contentFa when set. */
  @IsOptional() @IsString() @MaxLength(200_000) contentHtml?: string;
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(2000)
  featuredImageUrl?: string | null;
}
