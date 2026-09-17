export function parseWordList(value: string | string[] | undefined | null): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((word) => word.trim()).filter(Boolean))];
  }
  if (!value || typeof value !== 'string') return [];
  return [...new Set(value.split(/[,،\n]+/u).map((word) => word.trim()).filter(Boolean))];
}

export function matchesWordFilters(
  text: string,
  includeWords: string[] | undefined | null,
  excludeWords: string[] | undefined | null,
): boolean {
  const includes = includeWords ?? [];
  const excludes = excludeWords ?? [];
  const normalized = text.toLocaleLowerCase('fa');
  if (excludes.length) {
    for (const word of excludes) {
      if (normalized.includes(word.toLocaleLowerCase('fa'))) return false;
    }
  }
  if (includes.length) {
    return includes.some((word) => normalized.includes(word.toLocaleLowerCase('fa')));
  }
  return true;
}

export function entryFilterText(entry: {
  title?: string;
  summary?: string;
  content?: string;
}): string {
  return [entry.title, entry.summary, entry.content].filter(Boolean).join(' ');
}
