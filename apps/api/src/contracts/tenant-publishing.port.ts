export const TENANT_PUBLISHING_PORT = Symbol('TENANT_PUBLISHING_PORT');

/** Platform ↔ publishing boundary: tenant lifecycle hooks without importing publishing services. */
export interface TenantPublishingPort {
  ensureTenantSubscriptions(tenantId: string): Promise<void>;
}
