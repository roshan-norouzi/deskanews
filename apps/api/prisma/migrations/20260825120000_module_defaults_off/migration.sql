-- Core modules were previously implicit and always enabled. Make their tenant state explicit and disabled.
UPDATE "TenantModule" AS tm
SET "enabled" = false
FROM "ModuleDefinition" AS md
WHERE tm."moduleId" = md."id"
  AND md."isCore" = true;

ALTER TABLE "TenantModule"
ALTER COLUMN "enabled" SET DEFAULT false;
