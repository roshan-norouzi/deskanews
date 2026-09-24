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

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_)/i;

/** Same story even when the link gains tracking parameters or a trailing slash. */
export function storyUrlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    parsed.protocol = 'https:';
    parsed.hostname = parsed.hostname.replace(/^www\./, '');
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function storyTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fa');
}

export function omitKnownStories<T extends { canonicalUrl: string; guid: string; title: string }>(
  entries: T[],
  known: Array<{ canonicalUrl: string; guid: string; originalTitle: string }>,
): T[] {
  const urls = new Set(known.map((row) => storyUrlKey(row.canonicalUrl)));
  const guids = new Set(known.map((row) => row.guid).filter(Boolean));
  const titles = new Set(known.map((row) => storyTitleKey(row.originalTitle)).filter(Boolean));
  const fresh: T[] = [];
  for (const entry of entries) {
    const urlKey = storyUrlKey(entry.canonicalUrl);
    const titleKey = storyTitleKey(entry.title);
    if (urls.has(urlKey) || (entry.guid && guids.has(entry.guid)) || (titleKey && titles.has(titleKey))) continue;
    urls.add(urlKey);
    if (entry.guid) guids.add(entry.guid);
    if (titleKey) titles.add(titleKey);
    fresh.push(entry);
  }
  return fresh;
}
