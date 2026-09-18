export const TELEGRAM_INGEST_BRIDGE_REQUIRED =
  'برای پایش کانال تلگرام از داخل ایران، در تنظیمات انتشار → شبکه‌های اجتماعی فیلد «آدرس Worker تلگرام» را ثبت کنید. بدون Worker، دسترسی مستقیم به t.me معمولاً مسدود یا به IP داخلی هدایت می‌شود.';

export const TELEGRAM_PUBLISH_CREDENTIALS_REQUIRED =
  'برای انتشار در تلگرام، توکن ربات و شناسه کانال/گفت‌وگو را در تنظیمات انتشار → شبکه‌های اجتماعی ثبت کنید.';

export const TELEGRAM_BRIDGE_FETCH_ACTION = 'fetch';

export function buildTelegramBridgeFetchPayload(channelHistoryUrl: string): Record<string, string> {
  return { action: TELEGRAM_BRIDGE_FETCH_ACTION, url: channelHistoryUrl.trim() };
}

export function mapTelegramBridgeIngestError(workerError: string): string {
  const normalized = workerError.trim();
  if (/token|chat_id|chat id/iu.test(normalized)) {
    return 'Worker تلگرام درخواست پایش کانال را به مسیر انتشار فرستاد یا نسخه قدیمی است؛ action «fetch» باید بدون توکن/chat_id پشتیبانی شود.';
  }
  return normalized || 'Worker تلگرام صفحه کانال را برنگرداند';
}

export function isAllowedTelegramFetchUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (!/(?:^|\.)t\.me$/iu.test(url.hostname)) return false;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 's') return /^[a-z][a-z\d_]{3,31}$/iu.test(parts[1] || '');
    return /^[a-z][a-z\d_]{3,31}$/iu.test(parts[0] || '');
  } catch {
    return false;
  }
}

export function extractTelegramBridgeHtml(body: Record<string, unknown>): string {
  for (const key of ['html', 'body', 'content', 'text']) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}
