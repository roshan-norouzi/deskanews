import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
