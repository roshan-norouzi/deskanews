/** Normalize API list responses (array or `{ items, total }`). */
export function extractListItems<T>(data: unknown, listKey?: string): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];

  if (typeof data !== 'object' || data === null) return [];

  const record = data as Record<string, unknown>;
  const key = listKey ?? (record.items !== undefined ? 'items' : undefined);
  if (key && Array.isArray(record[key])) {
    return record[key] as T[];
  }

  return [];
}
