import { IsArray, IsIn, IsOptional, IsString, ArrayNotEmpty, MaxLength } from 'class-validator';

export const DESTINATION_CATEGORY_STATUSES = ['pending', 'approved', 'rejected', 'stale'] as const;
export type DestinationCategoryStatus = (typeof DESTINATION_CATEGORY_STATUSES)[number];

export class UpdateDestinationCategoryStatusDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';
}

export class BulkApproveDestinationCategoriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

export class SyncDestinationCategoriesDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  siteUrl?: string;
}
