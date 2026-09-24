export const DEFAULT_FEED_TOPIC_LABELS = [
  'عمومی',
  'سیاسی',
  'اقتصادی',
  'اجتماعی',
  'ورزشی',
  'فرهنگی و هنری',
  'بین‌المللی',
] as const;

export type FeedTopicLabel = (typeof DEFAULT_FEED_TOPIC_LABELS)[number];

const RULES: Array<{ label: FeedTopicLabel; pattern: RegExp }> = [
  { label: 'ورزشی', pattern: /ورزش|فوتبال|والیبال|بسکتبال|کشتی|المپیک|پارالمپیک|تکواندو|وزنه|fifa|uefa|olympic|ioc|afc|varzesh|football|tarafdari|isport|metafutbol|nociri|ffiri|teammelli/iu },
  { label: 'اقتصادی', pattern: /بورس|اقتصاد|تجارت|بازرگانی|ecoiran|eghtesad|tejarat|donya-e-eqtesad|seo\.ir/iu },
  { label: 'فرهنگی و هنری', pattern: /سینما|هنری|hozehonari|ifilm|aparat|cinemapress|فیلم/iu },
  { label: 'اجتماعی', pattern: /آموزش|پرورش|نخبگان|بهداشت|دانشگاه|who\.int|medu\.ir|msrt\.ir|bmn\.ir|modality|یک پزشک|yekpezeshk/iu },
  { label: 'سیاسی', pattern: /خامنه|پزشکیان|عراقچی|خارجه|potus|macron|netanyahu|guterres|leyen|modi|zelensky|fassihi|vaez|hadinili|irimfa/iu },
  { label: 'عمومی', pattern: /دیجیاتو|زومیت|پیوست|گجت|استارتاپ|digiato|zoomit|peivast|gadget|itiran|digikala|snapp|همراه اول|ایرانسل|کافه‌بازار|cafebazaar|فناوری اطلاعات|isti\.ir/iu },
];

function haystack(name: string, url = ''): string {
  return `${name} ${url}`.toLowerCase();
}

/** Keyword label for a known source. Empty string means the name is not recognized. */
export function inferFeedTopicLabel(name: string, url = '', catalogGroup = ''): string {
  const text = haystack(name, url);
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.label;
  }
  if (catalogGroup === 'media-international') return 'بین‌المللی';
  if (catalogGroup === 'media-domestic' || catalogGroup === 'telegram') return 'عمومی';
  return '';
}
