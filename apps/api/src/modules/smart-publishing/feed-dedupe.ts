/**
 * Feeds sometimes change an item's link (tracking parameters, http→https) while
 * keeping its guid. Reusing the stored canonical URL for a known guid lets the
 * unique (scope, canonicalUrl) constraint catch the repeat instead of storing a duplicate.
 */
export function reuseKnownGuids<T extends { guid: string; canonicalUrl: string }>(
  entries: T[],
  known: Array<{ guid: string; canonicalUrl: string }>,
): T[] {
  const byGuid = new Map(known.filter((row) => row.guid).map((row) => [row.guid, row.canonicalUrl]));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const entry of entries) {
    const canonicalUrl = (entry.guid && byGuid.get(entry.guid)) || entry.canonicalUrl;
    if (!canonicalUrl || seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    result.push(canonicalUrl === entry.canonicalUrl ? entry : { ...entry, canonicalUrl });
  }
  return result;
}

export function entryGuids(entries: Array<{ guid: string }>): string[] {
  return [...new Set(entries.map((entry) => entry.guid).filter(Boolean))];
}
