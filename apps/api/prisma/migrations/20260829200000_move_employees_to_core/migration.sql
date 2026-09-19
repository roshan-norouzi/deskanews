-- Employees are a core capability now; preserve all employee and department data.
INSERT INTO "ModuleDefinition" ("id", "name", "domain", "version", "dependencies", "isCore", "source", "createdAt", "updatedAt")
VALUES ('employees', 'کارمندان', 'platform', '1.0.0', ARRAY[]::TEXT[], true, 'builtin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "domain" = EXCLUDED."domain",
  "dependencies" = EXCLUDED."dependencies",
  "isCore" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "TenantModule" ("tenantId", "moduleId", "enabled", "settings")
SELECT "tenantId", 'employees', true, "settings"
FROM "TenantModule"
WHERE "moduleId" = 'hr'
ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET
  "enabled" = true,
  "settings" = COALESCE("TenantModule"."settings", EXCLUDED."settings");

UPDATE "TenantModule" SET "enabled" = true WHERE "moduleId" = 'employees';
UPDATE "RolePermission" SET "permission" = 'employees.view' WHERE "permission" = 'hr.employee.view';
UPDATE "RolePermission" SET "permission" = 'employees.manage' WHERE "permission" = 'hr.employee.manage';
DELETE FROM "RolePermission" WHERE "permission" LIKE 'hr.%';
UPDATE "CustomFieldDefinition" SET "moduleId" = 'employees' WHERE "moduleId" = 'hr';

DELETE FROM "TenantModule" WHERE "moduleId" = 'hr';
DELETE FROM "ModuleDefinition" WHERE "id" = 'hr';
