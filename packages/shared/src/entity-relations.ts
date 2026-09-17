/** Entity type → label and detail page path for cross-module links */

export interface EntityRelationSpec {
  label: string;
  detailPath: (id: string) => string;
  moduleId?: string;
}

export const ENTITY_RELATIONS: Record<string, EntityRelationSpec> = {
  Contact: { label: 'مخاطب', detailPath: (id) => `/contacts/${id}`, moduleId: 'contacts' },
  Employee: { label: 'کارمند', detailPath: (id) => `/employees/${id}`, moduleId: 'employees' },
  Department: { label: 'دپارتمان', detailPath: () => `/employees`, moduleId: 'employees' },
};

export function getEntityDetailHref(entityType: string, entityId: string): string | null {
  const spec = ENTITY_RELATIONS[entityType];
  if (!spec) return null;
  return spec.detailPath(entityId);
}

export function getEntityLabel(entityType: string): string {
  return ENTITY_RELATIONS[entityType]?.label ?? entityType;
}

/** Quick links from a contact to related modules */
export const CONTACT_RELATED_LINKS = [
  { href: (id: string) => `/employees?contactId=${id}`, label: 'کارمندان' },
] as const;
