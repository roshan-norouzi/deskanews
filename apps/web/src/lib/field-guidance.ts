export function getFieldPlaceholder(label?: string, type?: string, name?: string): string | undefined {
  const key = `${name ?? ''} ${label ?? ''}`.toLowerCase()

  if (type === 'email' || key.includes('ایمیل')) return 'name@example.com'
  if (key.includes('وب') || key.includes('url') || key.includes('رزومه')) return 'https://example.com'
  if (key.includes('موبایل') || key.includes('تلفن همراه')) return '09121234567'
  if (key.includes('تلفن ثابت')) return '02112345678'
  if (key.includes('کد پستی')) return '1234567890'
  if (key.includes('شناسه ملی')) return '14001234567'
  if (key.includes('کد ملی')) return '0012345678'
  if (key.includes('کد اقتصادی')) return '411111111111'
  if (key.includes('شماره ثبت')) return '123456'
  if (key.includes('شماره کارت')) return '6037991234567890'
  if (key.includes('شماره شبا') || key.includes('شبا')) return 'IR120170000000123456789012'
  if (key.includes('شماره حساب') || key.includes('شماره سپرده')) return '1234567890123456'
  if (key.includes('شماره بیمه')) return '1234567890'
  if (key.includes('شماره شناسنامه')) return '1234567890'
  if (key.includes('کد پرسنلی')) return 'EMP-1001'
  if (key.includes('رمز عبور')) return 'حداقل ۸ کاراکتر'
  if (key.includes('مکان')) return 'مثلاً دفتر مرکزی'
  if (key.includes('نام سازمان')) return 'مثلاً شرکت نمونه'
  if (key.includes('نام دپارتمان')) return 'مثلاً منابع انسانی'
  if (key.includes('عنوان')) return 'عنوان را وارد کنید'
  if (key.includes('نام')) return 'نام را وارد کنید'
  if (type === 'textarea') return 'توضیحات تکمیلی را وارد کنید'
  return undefined
}
