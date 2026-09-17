import { getCoreModuleIds } from '@deska/shared';
import type { TenantModuleRecord } from './tenant-modules';

/** Tenant-enabled modules plus platform core modules. */
export function resolveEnabledModuleIds(
  modules: TenantModuleRecord[] | null | undefined,
): string[] | null {
  if (!modules) return null;
  const enabled = modules.filter((m) => m.enabled).map((m) => m.id);
  return [...new Set([...enabled, ...getCoreModuleIds()])];
}
