export function extractFeedDomain(sourceUrl: string): string {
  try {
    return new URL(String(sourceUrl || '').trim()).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function parseTelegramUsername(sourceUrl: string): string {
  try {
    const url = new URL(String(sourceUrl || '').trim());
    if (!/(?:^|\.)t\.me$/iu.test(url.hostname)) return '';
    const parts = url.pathname.split('/').filter(Boolean);
    const username = parts[0] === 's' ? parts[1] : parts[0];
    if (!username || !/^[a-z][a-z\d_]{3,31}$/iu.test(username)) return '';
    return username;
  } catch {
    return '';
  }
}

export function parseTwitterHandle(sourceUrl: string): string {
  try {
    const url = new URL(String(sourceUrl || '').trim());
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase())) return '';
    const handle = url.pathname.split('/').filter(Boolean)[0] || '';
    if (!/^[a-z\d_]{1,50}$/iu.test(handle) || ['home', 'explore', 'search', 'i', 'intent'].includes(handle.toLowerCase())) {
      return '';
    }
    return handle;
  } catch {
    return '';
  }
}

export function buildTelegramProfilePhotoUrl(sourceUrl: string): string {
  const username = parseTelegramUsername(sourceUrl);
  return username ? `https://t.me/i/userpic/320/${username}.jpg` : '';
}

export const SOURCE_ICON_PATH_PREFIX = '/api/publishing/source-icons/';

export function buildAutoFeedLogoUrl(sourceUrl: string): string {
  const domain = extractFeedDomain(sourceUrl);
  if (!domain) return '';
  return `${SOURCE_ICON_PATH_PREFIX}${encodeURIComponent(domain)}`;
}

export function usesFeedProfilePhoto(sourceType?: string): boolean {
  return sourceType === 'telegram' || sourceType === 'twitter';
}

/** Stored override wins; social feeds use profile photos instead of site favicons. */
export function resolveFeedLogoUrl(sourceUrl: string, storedLogoUrl = '', sourceType?: string): string {
  const stored = String(storedLogoUrl || '').trim();
  if (stored) return stored;
  const type = String(sourceType || '').trim();
  if (type === 'telegram') {
    return buildTelegramProfilePhotoUrl(sourceUrl);
  }
  if (type === 'twitter') {
    return '';
  }
  return buildAutoFeedLogoUrl(sourceUrl);
}
