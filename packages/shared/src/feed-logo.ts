export function extractFeedDomain(sourceUrl: string): string {
  try {
    return new URL(String(sourceUrl || '').trim()).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function buildAutoFeedLogoUrl(sourceUrl: string): string {
  const domain = extractFeedDomain(sourceUrl);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/** Stored override wins; empty stored value falls back to favicon from source URL. */
export function resolveFeedLogoUrl(sourceUrl: string, storedLogoUrl = ''): string {
  const stored = String(storedLogoUrl || '').trim();
  if (stored) return stored;
  return buildAutoFeedLogoUrl(sourceUrl);
}
