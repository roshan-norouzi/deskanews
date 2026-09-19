export function getFieldPlaceholder(label?: string, type?: string, name?: string): string | undefined {
  const key = `${name ?? ''} ${label ?? ''}`.toLowerCase();

  if (type === 'email' || key.includes('ایمیل')) return 'name@example.com';
  if (key.includes('وب') || key.includes('url') || key.includes('rss') || key.includes('فید') || key.includes('منبع')) {
    return 'https://example.com/feed.xml';
  }
  if (key.includes('موبایل') || key.includes('تلفن همراه')) return '09121234567';
  if (key.includes('تلفن ثابت')) return '02112345678';
  if (key.includes('رمز عبور')) return 'حداقل ۸ کاراکتر';
  if (key.includes('نامک') || key.includes('slug')) return 'my-newsroom';
  if (key.includes('نام سازمان')) return 'مثلاً خبرگزاری نمونه';
  if (key.includes('نام منبع')) return 'مثلاً خبرگزاری رسمی';
  if (key.includes('کلمات')) return 'با ویرگول جدا کنید';
  if (key.includes('عنوان')) return 'عنوان را وارد کنید';
  if (key.includes('نام')) return 'نام را وارد کنید';
  if (type === 'textarea') return 'توضیحات تکمیلی را وارد کنید';
  return undefined;
}
