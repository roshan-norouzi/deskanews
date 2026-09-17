export type EventManagementType = 'event' | 'press_conference' | 'media_visit' | 'exhibition' | 'sponsorship';

export interface ChecklistTemplateItem {
  phase: string;
  title: string;
  deliverable?: string;
  offsetDays: number;
  required?: boolean;
}

const common: ChecklistTemplateItem[] = [
  { phase: 'تصمیم و تاریخ', title: 'عبور تاریخ از دروازه تقویمی شمسی، قمری و تجاری', deliverable: 'کاربرگ ارزیابی تاریخ با منبع و سطح ریسک', offsetDays: 45, required: true },
  { phase: 'تصمیم و تاریخ', title: 'تعریف هدف واقعی و شاخص‌های قابل سنجش', deliverable: 'هدف یک‌جمله‌ای و جدول شاخص‌ها', offsetDays: 44, required: true },
  { phase: 'مدیریت', title: 'تعیین یک مدیر پاسخ‌گو و جانشین او', deliverable: 'نام افراد و حدود اختیار', offsetDays: 42, required: true },
  { phase: 'آماده‌سازی نهایی', title: 'ثبت سناریوی ریسک و برنامه جایگزین', deliverable: 'جدول ریسک، پیشگیری و پاسخ', offsetDays: 7, required: true },
  { phase: 'پس از اجرا', title: 'جلسه درس‌آموخته‌ها با تیم اجرایی', deliverable: 'سه تا پنج توصیه مشخص برای دفعه بعد', offsetDays: -3, required: true },
  { phase: 'پس از اجرا', title: 'تکمیل گزارش عملکرد و انحراف بودجه', deliverable: 'گزارش مدیریتی نهایی', offsetDays: -14, required: true },
];

const templates: Record<EventManagementType, ChecklistTemplateItem[]> = {
  event: [
    { phase: 'تصمیم و تاریخ', title: 'آزمون ضرورت رویداد و مقایسه جایگزین‌های کم‌هزینه‌تر', deliverable: 'تصمیم مستدل برگزار شود/نشود', offsetDays: 60, required: true },
    { phase: 'طراحی', title: 'تعیین خانواده رویداد، حالت اجرا و تجربه مهمان', offsetDays: 50, required: true },
    { phase: 'طراحی', title: 'بازدید محل در همان ساعت اجرای برنامه', deliverable: 'گزارش نور، صدا، دسترسی و ظرفیت', offsetDays: 35, required: true },
    { phase: 'محتوا', title: 'تثبیت پیام مادر و بریف کتبی سخنرانان', offsetDays: 30, required: true },
    { phase: 'دعوت', title: 'تفکیک فهرست مهمانان و کنترل عدالت در دعوت', offsetDays: 24, required: true },
    { phase: 'تولید', title: 'تحویل فهرست شات به عکاس و فیلم‌بردار', offsetDays: 10 },
    { phase: 'آماده‌سازی نهایی', title: 'تمرین کامل و تست فنی با گوینده واقعی', offsetDays: 2, required: true },
    { phase: 'روز اجرا', title: 'اجرای سناریوی دقیقه‌به‌دقیقه و ثبت رخدادها', offsetDays: 0, required: true },
    { phase: 'پس از اجرا', title: 'ارسال خبر، عکس و رضایت‌سنجی', offsetDays: -2, required: true },
  ],
  press_conference: [
    { phase: 'تصمیم و تاریخ', title: 'آزمون ارزش خبری و بررسی مصاحبه اختصاصی یا نشست پس‌زمینه‌ای', deliverable: 'تصمیم مستدل درباره ضرورت نشست', offsetDays: 21, required: true },
    { phase: 'محتوا', title: 'ساخت خانه پیام: پیام مادر، سه پیام پشتیبان و شواهد', offsetDays: 14, required: true },
    { phase: 'محتوا', title: 'آماده‌سازی حداقل هشت سؤال سخت و پاسخ مستند', offsetDays: 10, required: true },
    { phase: 'محتوا', title: 'تهیه خبر هرم وارونه، فکت‌شیت و منبع هر عدد', offsetDays: 8, required: true },
    { phase: 'رسانه', title: 'تهیه فهرست رسانه با تنوع گرایش و دعوت شخصی', offsetDays: 7, required: true },
    { phase: 'حقوقی و انتشار', title: 'ثبت شرط زمان‌بندی انتشار و بیانیه اضطراری در صورت نیاز', offsetDays: 5 },
    { phase: 'آماده‌سازی نهایی', title: 'شبیه‌سازی پرسش و پاسخ با سخنگو', offsetDays: 2, required: true },
    { phase: 'روز اجرا', title: 'رصد زنده خروجی رسانه‌ها و ثبت تعهدات باز', offsetDays: 0, required: true },
    { phase: 'پس از اجرا', title: 'ارسال بسته کامل به حاضران و غایبان', offsetDays: -1, required: true },
    { phase: 'پس از اجرا', title: 'پاسخ مستند به پرسش‌های بی‌جواب‌مانده', offsetDays: -7, required: true },
  ],
  media_visit: [
    { phase: 'تصمیم و مجوز', title: 'آزمون دیدنی‌بودن موضوع و آمادگی محل', deliverable: 'تصمیم برو/نرو', offsetDays: 45, required: true },
    { phase: 'تصمیم و مجوز', title: 'شروع مجوز ورود، حراست و هماهنگی چندنهادی', offsetDays: 42, required: true },
    { phase: 'طراحی مسیر', title: 'پیاده‌روی کامل مسیر با نگاه خبرنگار', offsetDays: 28, required: true },
    { phase: 'طراحی مسیر', title: 'تعیین روایت، نقطه اوج، زمان آزاد و محدوده ممنوع تصویر', offsetDays: 21, required: true },
    { phase: 'ایمنی و حریم خصوصی', title: 'تعیین تجهیزات ایمنی و بیمه مسئولیت مهمانان', offsetDays: 14, required: true },
    { phase: 'ایمنی و حریم خصوصی', title: 'دریافت رضایت آگاهانه تصویربرداری با دامنه انتشار', offsetDays: 5, required: true },
    { phase: 'رسانه', title: 'بستن فهرست نهایی و ارسال مشخصات به حراست', offsetDays: 2, required: true },
    { phase: 'روز اجرا', title: 'شمارش افراد در حرکت، ورود، توقف‌ها و خروج', offsetDays: 0, required: true },
    { phase: 'پس از اجرا', title: 'ارسال تصاویر زوایای غیرقابل عکاسی و پاسخ‌های تکمیلی', offsetDays: -1, required: true },
    { phase: 'پس از اجرا', title: 'دریافت بازخورد مستقیم از سه تا چهار خبرنگار', offsetDays: -7 },
  ],
  exhibition: [
    { phase: 'تصمیم و ثبت‌نام', title: 'اعتبارسنجی نمایشگاه و تصمیم برو/نرو', deliverable: 'تحلیل مخاطب، رقبا و بازده مورد انتظار', offsetDays: 120, required: true },
    { phase: 'ثبت‌نام', title: 'ثبت‌نام، انتخاب جانمایی و عقد قرارداد', offsetDays: 100, required: true },
    { phase: 'طراحی غرفه', title: 'تکمیل بریف غرفه بر اساس هدف و مسیر بازدیدکننده', offsetDays: 80, required: true },
    { phase: 'طراحی غرفه', title: 'استعلام سه غرفه‌ساز و تأیید نقشه اجرایی', offsetDays: 60 },
    { phase: 'محتوا و رسانه', title: 'تعیین خبر اصلی، بسته رسانه‌ای و لندینگ‌پیج QR', offsetDays: 35, required: true },
    { phase: 'تیم و لید', title: 'تعریف فرم لید، معیار درجه‌بندی و مسئول پیگیری', offsetDays: 21, required: true },
    { phase: 'آماده‌سازی نهایی', title: 'شیفت‌بندی، آموزش معرفی ۳۰ ثانیه‌ای و تست ثبت لید', offsetDays: 7, required: true },
    { phase: 'روزهای نمایشگاه', title: 'ثبت روزانه لید، محتوا، پوشش رسانه‌ای و جلسه جمع‌بندی', offsetDays: 0, required: true },
    { phase: 'پس از اجرا', title: 'تحویل لیدهای درجه الف به فروش', offsetDays: -2, required: true },
    { phase: 'پس از اجرا', title: 'تصمیم مستند درباره حضور در دوره بعد', offsetDays: -21 },
  ],
  sponsorship: [
    { phase: 'ارزیابی', title: 'تکمیل امتیازدهی شش‌معیاره و کنترل معیارهای وتو', deliverable: 'درصد امتیاز و توصیه ورود/عدم ورود/مذاکره', offsetDays: 60, required: true },
    { phase: 'ارزیابی', title: 'راستی‌آزمایی ادعاهای برگزارکننده و تماس با حامیان دوره قبل', offsetDays: 55, required: true },
    { phase: 'بودجه', title: 'محاسبه هزینه کل و بودجه فعال‌سازی حداقل ۵۰ درصد مبلغ حمایت', offsetDays: 50, required: true },
    { phase: 'مذاکره و قرارداد', title: 'تبدیل بسته لوگو به دارایی‌های قابل استفاده و قابل سنجش', offsetDays: 42, required: true },
    { phase: 'مذاکره و قرارداد', title: 'ثبت بند لغو، جبران، تأیید محتوا و گزارش عملکرد', offsetDays: 35, required: true },
    { phase: 'فعال‌سازی', title: 'اتصال هر دارایی به نحوه استفاده و مسئول مشخص', offsetDays: 28, required: true },
    { phase: 'تیم و لید', title: 'تعریف معیار سرنخ واجد شرایط و تمرین ثبت آن', offsetDays: 7, required: true },
    { phase: 'روز اجرا', title: 'کنترل دارایی‌های تعهدشده و مستندسازی هر نقص', offsetDays: 0, required: true },
    { phase: 'پس از اجرا', title: 'پیگیری سرنخ‌های درجه الف و دریافت گزارش برگزارکننده', offsetDays: -3, required: true },
    { phase: 'پس از اجرا', title: 'ارزیابی مالی تبدیل سرنخ‌ها', offsetDays: -90, required: true },
  ],
};

export const budgetCategories: Record<EventManagementType, string[]> = {
  event: ['مکان', 'تجهیزات فنی', 'دکور و هویت بصری', 'محتوا', 'مستندسازی', 'پذیرایی', 'نیروی انسانی', 'حمل‌ونقل', 'ذخیره احتیاطی'],
  press_conference: ['مکان', 'تجهیزات و اینترنت', 'بسته رسانه‌ای', 'مستندسازی', 'پذیرایی', 'حمل‌ونقل رسانه', 'ذخیره احتیاطی'],
  media_visit: ['حمل‌ونقل', 'اقامت', 'ایمنی و بیمه', 'بسته اطلاعاتی', 'مستندسازی', 'پذیرایی', 'مجوزها', 'ذخیره احتیاطی'],
  exhibition: ['ثبت‌نام و فضا', 'غرفه‌سازی', 'خدمات نمایشگاهی', 'محتوا و اقلام', 'نیروی انسانی', 'مستندسازی', 'پذیرایی', 'حمل و تخلیه', 'ذخیره احتیاطی'],
  sponsorship: ['مبلغ حمایت', 'فعال‌سازی', 'محتوا و سخنرانی', 'ابزار ثبت سرنخ', 'هدایا', 'تیم و سفر', 'مستندسازی', 'ذخیره احتیاطی'],
};

export const assessmentCriteria: Record<EventManagementType, Array<{ key: string; label: string; weight: number; veto?: boolean }>> = {
  event: [
    { key: 'necessity', label: 'ضرورت رویداد', weight: 3 }, { key: 'guestValue', label: 'ارزش برای مهمان', weight: 3 },
    { key: 'resourceReadiness', label: 'آمادگی منابع', weight: 2, veto: true }, { key: 'contextFit', label: 'تناسب با شرایط عمومی', weight: 2, veto: true },
  ],
  press_conference: [
    { key: 'newsworthiness', label: 'ارزش خبری', weight: 4, veto: true }, { key: 'publicInterest', label: 'اهمیت برای مخاطب', weight: 3 },
    { key: 'evidenceReadiness', label: 'آمادگی شواهد', weight: 2, veto: true }, { key: 'spokespersonReadiness', label: 'آمادگی سخنگو', weight: 1 },
  ],
  media_visit: [
    { key: 'visualValue', label: 'ارزش دیداری', weight: 3, veto: true }, { key: 'siteReadiness', label: 'آمادگی محل', weight: 3 },
    { key: 'safetyReadiness', label: 'ایمنی و مجوز', weight: 3, veto: true }, { key: 'narrativeStrength', label: 'قدرت روایت مسیر', weight: 1 },
  ],
  exhibition: [
    { key: 'audienceFit', label: 'تطابق مخاطب', weight: 3 }, { key: 'leadPotential', label: 'ظرفیت سرنخ', weight: 3 },
    { key: 'differentiation', label: 'تمایز قابل ارائه', weight: 2 }, { key: 'executionReadiness', label: 'آمادگی اجرا', weight: 2, veto: true },
  ],
  sponsorship: [
    { key: 'audienceFit', label: 'تطابق مخاطب', weight: 3 }, { key: 'valueFit', label: 'تطابق ارزشی', weight: 3, veto: true },
    { key: 'assetQuality', label: 'کیفیت دارایی‌ها', weight: 2 }, { key: 'exclusivity', label: 'انحصار', weight: 1 },
    { key: 'organizerCredibility', label: 'اعتبار برگزارکننده', weight: 2 }, { key: 'activationCapacity', label: 'توان فعال‌سازی', weight: 3, veto: true },
  ],
};

export function getChecklistTemplate(type: EventManagementType) {
  return [...common, ...templates[type]];
}
