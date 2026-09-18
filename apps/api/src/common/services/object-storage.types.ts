export type StorageKind = 'fonts' | 'cover-images' | 'social-publishing';

export function storageObjectKey(kind: StorageKind, filename: string, tenantId?: string): string {
  const safeName = pathBasename(filename);
  if (tenantId) return `${kind}/${tenantId}/${safeName}`;
  return `${kind}/${safeName}`;
}

export function tenantStoragePrefix(tenantId: string): string[] {
  return [
    `${tenantId}/`,
    `fonts/${tenantId}/`,
    `cover-images/${tenantId}/`,
    `social-publishing/${tenantId}/`,
  ];
}

function pathBasename(filename: string): string {
  const normalized = filename.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}
