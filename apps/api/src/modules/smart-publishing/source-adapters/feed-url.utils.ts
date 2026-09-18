export function parseTelegramChannelUsername(value: string): string | null {
  const trimmed = value.trim();
  const username = trimmed
    .replace(/^@/u, '')
    .replace(/^https?:\/\/(?:www\.)?t\.me\//iu, '')
    .replace(/^t\.me\//iu, '')
    .split('/')[0];
  if (/^[a-z][a-z\d_]{3,31}$/iu.test(username)) return username.toLowerCase();
  return null;
}

export function isTelegramChannelRef(value: string): boolean {
  return parseTelegramChannelUsername(value) != null;
}

export function isValidHttpFeedUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function normalizeTelegramChannelUrl(value: string): string | null {
  const username = parseTelegramChannelUsername(value);
  return username ? `https://t.me/${username}` : null;
}

export function normalizeHttpFeedUrl(value: string): string {
  if (!isValidHttpFeedUrl(value)) throw new Error('invalid');
  const url = new URL(value.trim());
  url.hash = '';
  return url.toString();
}
