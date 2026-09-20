export type DestinationPlatformId = 'wordpress' | 'iransamaneh' | 'nastooh';

export interface DestinationField {
  key: string;
  label: string;
  hint?: string;
  placeholder?: string;
  secret?: boolean;
  type?: 'text' | 'url' | 'password' | 'select';
  options?: Array<{ value: string; label: string }>;
}

export interface DestinationPlatform {
  id: DestinationPlatformId;
  label: string;
  description: string;
  fields: DestinationField[];
}

export const DESTINATION_PLATFORMS: Record<DestinationPlatformId, DestinationPlatform> = {
  wordpress: {
    id: 'wordpress',
    label: 'WordPress',
    description: 'انتشار از طریق REST API و Application Password وردپرس.',
    fields: [
      { key: 'wp_site_url', label: 'آدرس سایت', type: 'url', placeholder: 'https://example.com', hint: 'نشانی اصلی نصب وردپرس بدون wp-admin یا wp-json.' },
      { key: 'wp_login_path', label: 'مسیر صفحه ورود', placeholder: 'wp-admin', hint: 'فقط برای مرجع؛ در REST API استفاده نمی‌شود.' },
      { key: 'wp_username', label: 'نام کاربری', placeholder: 'publisher' },
      { key: 'wp_app_password', label: 'Application Password', type: 'password', secret: true, hint: 'از پروفایل کاربر در وردپرس دریافت کنید.' },
      {
        key: 'wp_post_status',
        label: 'وضعیت مطلب',
        type: 'select',
        options: [
          { value: 'publish', label: 'انتشار فوری' },
          { value: 'draft', label: 'پیش‌نویس' },
          { value: 'pending', label: 'در انتظار بازبینی' },
        ],
      },
      { key: 'wp_category_id', label: 'شناسه دسته پیش‌فرض', hint: 'در صورت ناموفق بودن انتخاب هوشمند دسته.' },
    ],
  },
  iransamaneh: {
    id: 'iransamaneh',
    label: 'ایران‌سامانه',
    description: 'سامانه خبری ایران‌سامانه — اتصال از طریق وب‌سرویس درج خبر (SOAP/HTTP).',
    fields: [
      { key: 'is_site_url', label: 'آدرس سایت', type: 'url', placeholder: 'https://news.example.ir', hint: 'نشانی عمومی سایت خبری روی ایران‌سامانه.' },
      { key: 'is_webservice_url', label: 'آدرس وب‌سرویس درج خبر', type: 'url', placeholder: 'https://news.example.ir/webservice/news/add', hint: 'مسیر وب‌سرویس درج یا ویرایش خبر که توسط پشتیبانی ایران‌سامانه اعلام می‌شود.' },
      { key: 'is_username', label: 'نام کاربری وب‌سرویس', placeholder: 'publisher' },
      { key: 'is_password', label: 'رمز عبور وب‌سرویس', type: 'password', secret: true },
      { key: 'is_section_id', label: 'شناسه سرویس/بخش خبری', placeholder: '12', hint: 'شناسه سرویس یا بخش مقصد در سامانه.' },
      { key: 'is_post_status', label: 'وضعیت انتشار', type: 'select', options: [{ value: 'publish', label: 'انتشار' }, { value: 'draft', label: 'پیش‌نویس' }] },
    ],
  },
  nastooh: {
    id: 'nastooh',
    label: 'نستوه',
    description: 'اتاق خبر نستوه — اتصال از طریق سرویس‌های RESTful سامانه.',
    fields: [
      { key: 'ns_site_url', label: 'آدرس سایت', type: 'url', placeholder: 'https://news.example.ir', hint: 'نشانی عمومی سایت خبری روی نستوه.' },
      { key: 'ns_api_base_url', label: 'آدرس پایه REST API', type: 'url', placeholder: 'https://news.example.ir/api/rest', hint: 'مسیر پایه REST که توسط پشتیبانی نستوه اعلام می‌شود.' },
      { key: 'ns_username', label: 'نام کاربری API', placeholder: 'api-user' },
      { key: 'ns_password', label: 'رمز عبور API', type: 'password', secret: true },
      { key: 'ns_service_id', label: 'شناسه سرویس خبری', placeholder: '101', hint: 'سرویس یا زیرسرویس مقصد در کارتابل خبری.' },
      { key: 'ns_post_status', label: 'وضعیت انتشار', type: 'select', options: [{ value: 'publish', label: 'انتشار' }, { value: 'draft', label: 'پیش‌نویس' }] },
    ],
  },
};

export const DESTINATION_PLATFORM_ORDER: DestinationPlatformId[] = ['wordpress', 'iransamaneh', 'nastooh'];

export function destinationSiteUrlKey(platform: DestinationPlatformId): string {
  if (platform === 'wordpress') return 'wp_site_url';
  if (platform === 'iransamaneh') return 'is_site_url';
  return 'ns_site_url';
}

export function destinationPublishFields(platform: DestinationPlatformId): DestinationField[] {
  const siteKey = destinationSiteUrlKey(platform);
  return DESTINATION_PLATFORMS[platform].fields.filter((field) => field.key !== siteKey);
}

export function destinationConnectionKeys(platform: DestinationPlatformId): string[] {
  const fields = DESTINATION_PLATFORMS[platform].fields.map((field) => field.key);
  if (platform === 'wordpress') return [...fields, 'wp_categories'];
  return fields;
}

export function destinationSecretKeys(): Set<string> {
  return new Set(['wp_app_password', 'is_password', 'ns_password']);
}

export function resolveDestinationPlatform(value?: string): DestinationPlatformId {
  if (value === 'iransamaneh' || value === 'nastooh' || value === 'wordpress') return value;
  return 'wordpress';
}
