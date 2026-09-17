export function buildStudioFieldBody(values: Record<string, string>) {
  return { moduleId: values.moduleId || 'contacts', entityType: values.entityType, fieldName: values.fieldName, fieldLabel: values.fieldLabel, fieldType: values.fieldType, required: values.required === 'true' };
}
