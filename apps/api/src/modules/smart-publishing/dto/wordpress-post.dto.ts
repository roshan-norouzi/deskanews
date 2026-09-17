import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const WORDPRESS_POST_STATUSES = ['any', 'publish', 'future', 'draft', 'pending', 'private'] as const;
export const EDITABLE_WORDPRESS_POST_STATUSES = ['publish', 'future', 'draft', 'pending', 'private'] as const;

export class ListWordPressPostsDto {
  @IsOptional() @IsIn(WORDPRESS_POST_STATUSES) status?: string;
  @IsOptional() @IsIn(['important', 'normal']) importance?: 'important' | 'normal';
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(10_000) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) perPage?: number;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
}

export class UpdateWordPressPostDto {
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsString() @MaxLength(200) slug?: string;
  @IsOptional() @IsString() @MaxLength(20_000) excerpt?: string;
  @IsOptional() @IsString() @MaxLength(2_000_000) content?: string;
  @IsOptional() @IsIn(EDITABLE_WORDPRESS_POST_STATUSES) status?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @Type(() => Number) @IsInt({ each: true }) @Min(1, { each: true }) categories?: number[];
}

export class UpdateWordPressImportanceDto {
  @IsIn(['important', 'normal']) importance!: 'important' | 'normal';
}
