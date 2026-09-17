-- Core modules are immutable and must always remain enabled for every tenant.
UPDATE "TenantModule" AS tm
SET "enabled" = true
FROM "ModuleDefinition" AS md
WHERE tm."moduleId" = md."id"
  AND md."isCore" = true;
