export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
}

export function parseWordPressCategories(value: unknown): WordPressCategory[] {
  let parsed = value;
  if (typeof value === 'string') {
    if (!value.trim()) return [];
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];

  const categories: WordPressCategory[] = [];
  const ids = new Set<number>();
  for (const candidate of parsed.slice(0, 500)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const row = candidate as Record<string, unknown>;
    const id = Number(row.id);
    const name = String(row.name ?? '').replace(/\s+/gu, ' ').trim().slice(0, 200);
    const slug = String(row.slug ?? '').trim().slice(0, 200);
    const parent = Number(row.parent || 0);
    if (!Number.isSafeInteger(id) || id <= 0 || !name || ids.has(id)) continue;
    categories.push({
      id,
      name,
      slug,
      parent: Number.isSafeInteger(parent) && parent > 0 ? parent : 0,
    });
    ids.add(id);
  }
  return categories;
}

export function serializeWordPressCategories(value: unknown): string {
  return JSON.stringify(parseWordPressCategories(value));
}
