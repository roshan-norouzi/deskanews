export type ArticlePage<T> = { items: T[]; nextCursor: string | null };

export function encodeArticleCursor(stamp: Date | null, id: string): string {
  return Buffer.from(`${stamp ? stamp.toISOString() : ''}|${id}`, 'utf8').toString('base64url');
}

export function decodeArticleCursor(cursor: string | undefined): { stamp: Date | null; id: string } | null {
  if (!cursor) return null;
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const split = raw.indexOf('|');
  if (split < 0) return null;
  const stampRaw = raw.slice(0, split);
  const id = raw.slice(split + 1);
  if (!id) return null;
  const stamp = stampRaw ? new Date(stampRaw) : null;
  if (stamp && Number.isNaN(stamp.getTime())) return null;
  return { stamp, id };
}
