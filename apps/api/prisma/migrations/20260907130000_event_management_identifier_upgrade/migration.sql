-- Preserve the installed module and tenant settings while replacing its identifier.
INSERT INTO "ModuleDefinition" (
  "id", "name", "domain", "version", "dependencies", "isCore", "description",
  "source", "packagePath", "checksum", "manifest", "createdAt", "updatedAt"
)
SELECT
  'event-management', 'مدیریت رویداد', "domain", "version", "dependencies", "isCore", "description",
  "source", "packagePath", "checksum", "manifest", "createdAt", CURRENT_TIMESTAMP
FROM "ModuleDefinition"
WHERE "id" = 'public-relations'
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "domain" = EXCLUDED."domain",
  "version" = EXCLUDED."version",
  "dependencies" = EXCLUDED."dependencies",
  "isCore" = EXCLUDED."isCore",
  "description" = EXCLUDED."description",
  "source" = EXCLUDED."source",
  "packagePath" = EXCLUDED."packagePath",
  "checksum" = EXCLUDED."checksum",
  "manifest" = EXCLUDED."manifest",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "TenantModule" ("tenantId", "moduleId", "enabled", "settings")
SELECT "tenantId", 'event-management', "enabled", "settings"
FROM "TenantModule"
WHERE "moduleId" = 'public-relations'
ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET
  "enabled" = EXCLUDED."enabled",
  "settings" = EXCLUDED."settings";

INSERT INTO "TenantModule" ("tenantId", "moduleId", "enabled", "settings")
SELECT "id", 'event-management', false, '{}'::jsonb
FROM "Tenant"
ON CONFLICT ("tenantId", "moduleId") DO NOTHING;

UPDATE "CustomFieldDefinition"
SET "moduleId" = 'event-management'
WHERE "moduleId" = 'public-relations';

UPDATE "CalendarEvent"
SET "entityType" = 'event_management_project'
WHERE "entityType" = 'public_relations_project';

DELETE FROM "TenantModule" WHERE "moduleId" = 'public-relations';
DELETE FROM "ModuleDefinition" WHERE "id" = 'public-relations';

ALTER TABLE "PublicRelationsProject" RENAME TO "EventManagementProject";
ALTER TABLE "PublicRelationsTask" RENAME TO "EventManagementTask";
ALTER TABLE "PublicRelationsAgendaItem" RENAME TO "EventManagementAgendaItem";
ALTER TABLE "PublicRelationsBudgetItem" RENAME TO "EventManagementBudgetItem";

ALTER TABLE "EventManagementProject" RENAME CONSTRAINT "PublicRelationsProject_pkey" TO "EventManagementProject_pkey";
ALTER TABLE "EventManagementProject" RENAME CONSTRAINT "PublicRelationsProject_tenantId_fkey" TO "EventManagementProject_tenantId_fkey";

ALTER TABLE "EventManagementTask" RENAME CONSTRAINT "PublicRelationsTask_pkey" TO "EventManagementTask_pkey";
ALTER TABLE "EventManagementTask" RENAME CONSTRAINT "PublicRelationsTask_tenantId_fkey" TO "EventManagementTask_tenantId_fkey";
ALTER TABLE "EventManagementTask" RENAME CONSTRAINT "PublicRelationsTask_projectId_fkey" TO "EventManagementTask_projectId_fkey";

ALTER TABLE "EventManagementAgendaItem" RENAME CONSTRAINT "PublicRelationsAgendaItem_pkey" TO "EventManagementAgendaItem_pkey";
ALTER TABLE "EventManagementAgendaItem" RENAME CONSTRAINT "PublicRelationsAgendaItem_tenantId_fkey" TO "EventManagementAgendaItem_tenantId_fkey";
ALTER TABLE "EventManagementAgendaItem" RENAME CONSTRAINT "PublicRelationsAgendaItem_projectId_fkey" TO "EventManagementAgendaItem_projectId_fkey";

ALTER TABLE "EventManagementBudgetItem" RENAME CONSTRAINT "PublicRelationsBudgetItem_pkey" TO "EventManagementBudgetItem_pkey";
ALTER TABLE "EventManagementBudgetItem" RENAME CONSTRAINT "PublicRelationsBudgetItem_tenantId_fkey" TO "EventManagementBudgetItem_tenantId_fkey";
ALTER TABLE "EventManagementBudgetItem" RENAME CONSTRAINT "PublicRelationsBudgetItem_projectId_fkey" TO "EventManagementBudgetItem_projectId_fkey";

ALTER INDEX "PublicRelationsProject_tenantId_type_status_idx" RENAME TO "EventManagementProject_tenantId_type_status_idx";
ALTER INDEX "PublicRelationsProject_tenantId_startAt_idx" RENAME TO "EventManagementProject_tenantId_startAt_idx";
ALTER INDEX "PublicRelationsTask_tenantId_projectId_status_idx" RENAME TO "EventManagementTask_tenantId_projectId_status_idx";
ALTER INDEX "PublicRelationsTask_projectId_phase_sortOrder_idx" RENAME TO "EventManagementTask_projectId_phase_sortOrder_idx";
ALTER INDEX "PublicRelationsAgendaItem_tenantId_projectId_sortOrder_idx" RENAME TO "EventManagementAgendaItem_tenantId_projectId_sortOrder_idx";
ALTER INDEX "PublicRelationsBudgetItem_tenantId_projectId_category_idx" RENAME TO "EventManagementBudgetItem_tenantId_projectId_category_idx";
