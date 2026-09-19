import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const AI_SETTING_KEYS = [
  'gapgpt_base_url',
  'gapgpt_api_key',
  'gapgpt_model',
  'gapgpt_model_news_summary',
  'gapgpt_model_news_translation',
  'gapgpt_model_social',
  'news_summary_prompt',
  'news_full_translation_prompt',
  'news_persian_rewrite_prompt',
  'news_persian_full_rewrite_prompt',
] as const;

export type AiSettingKey = (typeof AI_SETTING_KEYS)[number];

export const PUBLISHING_SETTING_KEYS = [
  ...AI_SETTING_KEYS,
  'news_poll_interval_minutes',
  'news_max_age_days',
  'news_auto_poll',
  'news_auto_prepare',
  'news_auto_publish',
  'news_auto_send_social',
  'social_poll_interval_minutes',
  'social_max_age_days',
  'social_auto_poll',
  'social_auto_prepare',
  'social_auto_generate_image',
  'social_auto_image_template_id',
  'social_auto_publish_telegram',
  'social_auto_publish_instagram',
  'social_auto_publish_linkedin',
  'social_auto_publish_facebook',
  'social_caption_template',
  'social_image_template',
  'social_image_templates',
  'social_font_library',
  'wp_site_url',
  'wp_login_path',
  'wp_username',
  'wp_app_password',
  'wp_post_status',
  'wp_category_id',
  'wp_categories',
  'destination_platform',
  'is_site_url',
  'is_webservice_url',
  'is_username',
  'is_password',
  'is_section_id',
  'is_post_status',
  'ns_site_url',
  'ns_api_base_url',
  'ns_username',
  'ns_password',
  'ns_service_id',
  'ns_post_status',
  'telegram_bot_token',
  'telegram_chat_id',
  'telegram_bridge_url',
  'social_instagram_access_token',
  'social_instagram_account_id',
  'social_instagram_api_version',
  'social_linkedin_access_token',
  'social_linkedin_author_urn',
  'social_linkedin_api_version',
  'social_facebook_page_access_token',
  'social_facebook_page_id',
  'social_facebook_api_version',
  'social_public_media_base_url',
] as const;

export type PublishingSettingKey = (typeof PUBLISHING_SETTING_KEYS)[number];
export type PublishingSettings = Partial<Record<PublishingSettingKey, string>>;

export class UpdatePublishingSettingsDto {
  // Backward-compatible read-only flags from older web bundles. They are
  // accepted and ignored by the service; secrets are never populated from
  // these values.
  @IsOptional() @IsIn(['true', 'false']) gapgpt_api_key_configured?: string;
  @IsOptional() @IsIn(['true', 'false']) wp_app_password_configured?: string;
  @IsOptional() @IsIn(['true', 'false']) is_password_configured?: string;
  @IsOptional() @IsIn(['true', 'false']) ns_password_configured?: string;
  @IsOptional() @IsIn(['true', 'false']) telegram_bot_token_configured?: string;
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
  @IsOptional() @IsString() @MaxLength(10) news_poll_interval_minutes?: string;
  @IsOptional() @IsString() @MaxLength(10) news_max_age_days?: string;
  @IsOptional() @IsIn(['true', 'false']) news_auto_poll?: string;
  @IsOptional() @IsIn(['true', 'false']) news_auto_prepare?: string;
  @IsOptional() @IsIn(['true', 'false']) news_auto_publish?: string;
  @IsOptional() @IsIn(['true', 'false']) news_auto_send_social?: string;
  @IsOptional() @IsString() @MaxLength(10) social_poll_interval_minutes?: string;
  @IsOptional() @IsString() @MaxLength(10) social_max_age_days?: string;
  @IsOptional() @IsIn(['true', 'false']) social_auto_poll?: string;
  @IsOptional() @IsIn(['true', 'false']) social_auto_prepare?: string;
  @IsOptional() @IsIn(['true', 'false']) social_auto_generate_image?: string;
  @IsOptional() @IsString() @MaxLength(100) social_auto_image_template_id?: string;
  @IsOptional() @IsIn(['true', 'false']) social_auto_publish_telegram?: string;
  @IsOptional() @IsIn(['true', 'false']) social_auto_publish_instagram?: string;
  @IsOptional() @IsIn(['true', 'false']) social_auto_publish_linkedin?: string;
  @IsOptional() @IsIn(['true', 'false']) social_auto_publish_facebook?: string;
  @IsOptional() @IsString() @MaxLength(12000) social_caption_template?: string;
  @IsOptional() @IsString() @MaxLength(50000) social_image_template?: string;
  @IsOptional() @IsString() @MaxLength(500000) social_image_templates?: string;
  @IsOptional() @IsString() @MaxLength(5000) social_font_library?: string;
  @IsOptional() @IsString() @MaxLength(500) wp_site_url?: string;
  @IsOptional() @IsString() @MaxLength(200) wp_login_path?: string;
  @IsOptional() @IsString() @MaxLength(200) wp_username?: string;
  @IsOptional() @IsString() @MaxLength(500) wp_app_password?: string;
  @IsOptional() @IsIn(['publish', 'draft', 'pending']) wp_post_status?: string;
  @IsOptional() @IsString() @MaxLength(20) wp_category_id?: string;
  @IsOptional() @IsString() @MaxLength(100000) wp_categories?: string;
  @IsOptional() @IsIn(['wordpress', 'iransamaneh', 'nastooh']) destination_platform?: string;
  @IsOptional() @IsString() @MaxLength(500) is_site_url?: string;
  @IsOptional() @IsString() @MaxLength(500) is_webservice_url?: string;
  @IsOptional() @IsString() @MaxLength(200) is_username?: string;
  @IsOptional() @IsString() @MaxLength(500) is_password?: string;
  @IsOptional() @IsString() @MaxLength(40) is_section_id?: string;
  @IsOptional() @IsIn(['publish', 'draft']) is_post_status?: string;
  @IsOptional() @IsString() @MaxLength(500) ns_site_url?: string;
  @IsOptional() @IsString() @MaxLength(500) ns_api_base_url?: string;
  @IsOptional() @IsString() @MaxLength(200) ns_username?: string;
  @IsOptional() @IsString() @MaxLength(500) ns_password?: string;
  @IsOptional() @IsString() @MaxLength(40) ns_service_id?: string;
  @IsOptional() @IsIn(['publish', 'draft']) ns_post_status?: string;
  @IsOptional() @IsString() @MaxLength(500) telegram_bot_token?: string;
  @IsOptional() @IsString() @MaxLength(200) telegram_chat_id?: string;
  @IsOptional() @IsString() @MaxLength(500) telegram_bridge_url?: string;
  @IsOptional() @IsString() @MaxLength(1000) social_instagram_access_token?: string;
  @IsOptional() @IsString() @MaxLength(200) social_instagram_account_id?: string;
  @IsOptional() @IsString() @MaxLength(30) social_instagram_api_version?: string;
  @IsOptional() @IsString() @MaxLength(1000) social_linkedin_access_token?: string;
  @IsOptional() @IsString() @MaxLength(300) social_linkedin_author_urn?: string;
  @IsOptional() @IsString() @MaxLength(30) social_linkedin_api_version?: string;
  @IsOptional() @IsString() @MaxLength(1000) social_facebook_page_access_token?: string;
  @IsOptional() @IsString() @MaxLength(200) social_facebook_page_id?: string;
  @IsOptional() @IsString() @MaxLength(30) social_facebook_api_version?: string;
  @IsOptional() @IsString() @MaxLength(500) social_public_media_base_url?: string;
}

export class TestGapGptConnectionDto {
  @IsOptional() @IsString() @MaxLength(500) gapgpt_base_url?: string;
  @IsOptional() @IsString() @MaxLength(500) gapgpt_api_key?: string;
  @IsOptional() @IsString() @MaxLength(120) gapgpt_model?: string;
}

export class TestWordPressConnectionDto {
  @IsOptional() @IsIn(['wordpress', 'iransamaneh', 'nastooh']) destination_platform?: string;
  @IsOptional() @IsString() @MaxLength(500) wp_site_url?: string;
  @IsOptional() @IsString() @MaxLength(200) wp_login_path?: string;
  @IsOptional() @IsString() @MaxLength(200) wp_username?: string;
  @IsOptional() @IsString() @MaxLength(500) wp_app_password?: string;
  @IsOptional() @IsIn(['publish', 'draft', 'pending']) wp_post_status?: string;
  @IsOptional() @IsString() @MaxLength(20) wp_category_id?: string;
  @IsOptional() @IsString() @MaxLength(100000) wp_categories?: string;
  @IsOptional() @IsString() @MaxLength(500) is_site_url?: string;
  @IsOptional() @IsString() @MaxLength(500) is_webservice_url?: string;
  @IsOptional() @IsString() @MaxLength(200) is_username?: string;
  @IsOptional() @IsString() @MaxLength(500) is_password?: string;
  @IsOptional() @IsString() @MaxLength(40) is_section_id?: string;
  @IsOptional() @IsIn(['publish', 'draft']) is_post_status?: string;
  @IsOptional() @IsString() @MaxLength(500) ns_site_url?: string;
  @IsOptional() @IsString() @MaxLength(500) ns_api_base_url?: string;
  @IsOptional() @IsString() @MaxLength(200) ns_username?: string;
  @IsOptional() @IsString() @MaxLength(500) ns_password?: string;
  @IsOptional() @IsString() @MaxLength(40) ns_service_id?: string;
  @IsOptional() @IsIn(['publish', 'draft']) ns_post_status?: string;
}
