import { createHmac, timingSafeEqual } from 'node:crypto';

function mediaKey(): string {
  return (process.env.MEDIA_URL_SECRET || process.env.SETTINGS_ENCRYPTION_KEY || '').trim();
}

export function mediaSignatureRequired(): boolean {
  return mediaKey().length > 0;
}

/** Strip signature query params and optional `/api` prefix for storage and server-side lookups. */
export function canonicalMediaPath(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  const pathOnly = trimmed.split('?')[0] ?? trimmed;
  return pathOnly.startsWith('/api/') ? pathOnly.slice(4) : pathOnly;
}

export function socialMediaFilename(url: string | null | undefined): string | undefined {
  const pathOnly = canonicalMediaPath(url || '');
  if (!pathOnly) return undefined;
  return pathOnly.match(/\/publishing\/social\/media\/([a-f0-9-]+\.(?:png|jpg|webp))$/iu)?.[1];
}

export function signMediaPath(pathname: string, ttlSeconds = 3600): string {
  const key = mediaKey();
  const pathOnly = canonicalMediaPath(pathname);
  if (!key || !pathOnly) return pathname;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac('sha256', key).update(`${pathOnly}\n${exp}`).digest('base64url');
  return `${pathOnly}?exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(pathname: string, expRaw: string | undefined, sig: string | undefined): boolean {
  if (!mediaSignatureRequired()) return true;
  const exp = Number(expRaw);
  if (!sig || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', mediaKey()).update(`${pathname}\n${exp}`).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const MEDIA_PATH = /\/(?:api\/)?publishing\/(?:settings\/(?:fonts|images)\/file\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+|social\/media\/[A-Za-z0-9._-]+)/gu;

export function signEmbeddedMediaUrls(value: string, ttlSeconds = 3600): string {
  return value.replace(MEDIA_PATH, (match) => signMediaPath(match.startsWith('/api/') ? match.slice(4) : match, ttlSeconds));
}
