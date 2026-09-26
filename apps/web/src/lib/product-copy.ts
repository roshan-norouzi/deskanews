/** User-facing product terminology and reusable microcopy. */

export {
  NEWS_DESK_LABEL,
  PLATFORM_DESCRIPTION,
  PLATFORM_NAME,
  PLATFORM_TAGLINE,
} from '@deska/shared';

export const QUEUED_JOB_SUCCESS =
  'درخواست در صف پردازش قرار گرفت. برای مشاهدهٔ نتیجه، منتظر به‌روزرسانی خودکار بمانید یا فهرست را به‌روزرسانی کنید.';

export const LOAD_NEWS_SOURCES_FAILED = 'بارگذاری منابع خبری انجام نشد. چند لحظه دیگر دوباره تلاش کنید.';

export const INVITE_LINK_INVALID = 'این لینک دعوت ناقص یا منقضی است. از مدیر میز خبر لینک جدید بخواهید.';

export const LOGIN_FAILED = 'ورود انجام نشد. ایمیل و رمز عبور را بررسی کنید و دوباره تلاش کنید.';

export const INTEGRATION_TYPE_LABELS: Record<string, string> = {
  feed: 'منبع خبری',
  social_feed: 'منبع اجتماعی',
  destination: 'سایت مقصد',
  wordpress: 'سایت مقصد',
  gapgpt: 'سرویس هوش مصنوعی',
  telegram: 'تلگرام',
  instagram: 'اینستاگرام',
  linkedin: 'لینکدین',
  facebook: 'فیسبوک',
};

export const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  'news.prepare': 'آماده‌سازی خبر',
  'news.publish': 'انتشار خبر',
  'news.send-social': 'ارسال به استودیو',
  'social.prepare': 'آماده‌سازی محتوای اجتماعی',
  'social.publish': 'انتشار در شبکهٔ اجتماعی',
  'social.cover': 'تولید تصویر',
};

export function workflowActionLabel(action: string): string {
  if (WORKFLOW_ACTION_LABELS[action]) return WORKFLOW_ACTION_LABELS[action];
  const normalized = action.replaceAll('-', ' ').replaceAll('.', ' ');
  return normalized;
}
