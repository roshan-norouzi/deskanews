import { Globe2, Map, MessageCircle, Rss, type LucideIcon } from 'lucide-react';

export type SourceType = 'rss' | 'website' | 'telegram' | 'sitemap';
export type RightsMode = 'monitor_only' | 'quote_ok' | 'rewrite_required' | 'licensed_fulltext';

export const SOURCE_TYPES: Record<SourceType, { label: string; description: string; placeholder: string; icon: LucideIcon }> = {
  rss: { label: 'آدرس فید', description: 'RSS / Atom / JSON Feed', placeholder: 'https://example.com/feed.xml', icon: Rss },
  website: { label: 'آدرس سایت', description: 'فید استاندارد یا فهرست HTML', placeholder: 'https://example.com', icon: Globe2 },
  telegram: { label: 'کانال تلگرام', description: 'کانال عمومی از t.me/s', placeholder: 'https://t.me/channel یا @channel', icon: MessageCircle },
  sitemap: { label: 'آدرس سایت‌مپ', description: 'XML سایت‌مپ خبری یا فهرست URL', placeholder: 'https://example.com/sitemap.xml', icon: Map },
};

export const RIGHTS_MODES: Record<RightsMode, { label: string; description: string }> = {
  monitor_only: { label: 'فقط پایش', description: 'ردیابی خبر بدون بازنشر متن' },
  quote_ok: { label: 'نقل‌قول مجاز', description: 'انتشار با ذکر منبع و محدودیت متن' },
  rewrite_required: { label: 'بازنویسی الزامی', description: 'پیش‌فرض امن برای اسکرپ و تلگرام' },
  licensed_fulltext: { label: 'متن کامل (مجوز)', description: 'فقط با مجوز رسمی ناشر' },
};

export const IRAN_SOURCE_HELP = 'دسکا برای جمع‌آوری خبر از ایران، اولویت را به RSS، وب‌سایت، تلگرام عمومی و سایت‌مپ می‌دهد؛ بسیاری از APIهای خبری جهانی از داخل ایران پایدار در دسترس نیستند. دسکا وایر full-text لایسنس‌دار (Reuters/AP و مشابه) ارائه نمی‌دهد.';

export function validateFeedUrl(url: string, sourceType: SourceType): string {
  const trimmed = url.trim();
  if (sourceType === 'telegram') {
    const username = trimmed.replace(/^@/u, '').replace(/^https?:\/\/(?:www\.)?t\.me\//iu, '').split('/')[0];
    if (/^[a-z][a-z\d_]{3,31}$/iu.test(username)) return '';
  }
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return '';
  } catch {
    return 'آدرس منبع باید کامل و معتبر باشد.';
  }
}

export function sourceTypeLabel(sourceType?: string): string {
  if (sourceType && sourceType in SOURCE_TYPES) {
    return SOURCE_TYPES[sourceType as SourceType].label.replace('آدرس ', '').replace('کانال ', 'تلگرام');
  }
  return 'فید';
}
