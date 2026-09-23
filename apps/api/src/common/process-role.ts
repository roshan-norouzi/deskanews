export type DeskaProcessRole = 'all' | 'api' | 'worker';

export function resolveProcessRole(raw: string | undefined): DeskaProcessRole {
  const value = (raw ?? 'all').trim().toLowerCase();
  if (value === 'api' || value === 'worker') return value;
  return 'all';
}

/** Worker pods answer health checks only. Local `all` and API pods keep the full HTTP surface. */
export function workerHttpAllowed(role: DeskaProcessRole, path: string): boolean {
  if (role !== 'worker') return true;
  const normalized = path.split('?')[0] ?? '';
  return normalized === '/api/health' || normalized.startsWith('/api/health/');
}
