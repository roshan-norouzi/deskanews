import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlatformAiSettingsDto {
  @IsOptional() @IsIn(['true', 'false']) gapgpt_api_key_configured?: string;
  @IsOptional() @IsString() @MaxLength(500) gapgpt_base_url?: string;
  @IsOptional() @IsString() @MaxLength(500) gapgpt_api_key?: string;
  @IsOptional() @IsString() @MaxLength(120) gapgpt_model?: string;
  @IsOptional() @IsString() @MaxLength(120) gapgpt_model_news_summary?: string;
  @IsOptional() @IsString() @MaxLength(120) gapgpt_model_news_translation?: string;
  @IsOptional() @IsString() @MaxLength(120) gapgpt_model_social?: string;
  @IsOptional() @IsString() @MaxLength(12000) news_summary_prompt?: string;
  @IsOptional() @IsString() @MaxLength(12000) news_full_translation_prompt?: string;
  @IsOptional() @IsString() @MaxLength(12000) news_persian_rewrite_prompt?: string;
  @IsOptional() @IsString() @MaxLength(12000) news_persian_full_rewrite_prompt?: string;
}
