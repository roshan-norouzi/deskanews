export interface TenantModuleRecord {
  id: string;
  name: string;
  enabled: boolean;
  isCore?: boolean;
  canEnable?: boolean;
  canDisable?: boolean;
  dependencies?: string[];
  dependencyLabels?: string[];
  missingDependencyLabels?: string[];
  blockingDependentLabels?: string[];
  domain?: string;
  domainLabel?: string;
}

export function getEnabledModuleIds(
  modules: TenantModuleRecord[] | null | undefined,
): string[] | null {
  if (!modules) return null;
  return modules.filter((m) => m.enabled).map((m) => m.id);
}
