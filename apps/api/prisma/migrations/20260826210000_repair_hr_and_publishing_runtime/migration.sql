-- Repair columns expected by the current Employee Prisma model.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "nationalId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "fatherName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "motherName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "birthCertificateNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "birthCertificateDate" DATE;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "birthDate" DATE;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "mobilePhone" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "landlinePhone" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankCardNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "iban" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "insuranceNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenantId_nationalId_key" ON "Employee"("tenantId", "nationalId");

-- The previous cleanup migration removed ApprovalStep although current projects use it.
CREATE TABLE IF NOT EXISTS "ApprovalStep" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "comment" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ApprovalStep_taskId_idx" ON "ApprovalStep"("taskId");

-- The cleanup migration also removed the project table; recreate the runtime tables
-- for fresh deployments and upgrades where that migration has already run.
CREATE TABLE IF NOT EXISTS "Project" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'active', "workType" TEXT NOT NULL DEFAULT 'project', "managerId" TEXT, "parentId" TEXT, "progressPercent" INTEGER NOT NULL DEFAULT 0, "budget" DECIMAL(15,2), "cost" DECIMAL(15,2), "revenue" DECIMAL(15,2), "archivedAt" TIMESTAMP(3), "startDate" TIMESTAMP(3), "dueDate" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Project_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "Task" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "projectId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'todo', "priority" TEXT NOT NULL DEFAULT 'normal', "assigneeId" TEXT, "dueDate" TIMESTAMP(3), "parentId" TEXT, "recurrenceType" TEXT NOT NULL DEFAULT 'none', "recurrenceInterval" INTEGER NOT NULL DEFAULT 1, "recurrenceStartDate" TIMESTAMP(3), "recurrenceRule" JSONB, "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Task_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "Project_tenantId_status_idx" ON "Project"("tenantId","status");
CREATE INDEX IF NOT EXISTS "Task_tenantId_status_idx" ON "Task"("tenantId","status");
CREATE INDEX IF NOT EXISTS "Task_tenantId_projectId_idx" ON "Task"("tenantId","projectId");

-- Restore the two built-in optional modules removed by the cleanup migration.
INSERT INTO "ModuleDefinition" ("id", "name", "domain", "version", "dependencies", "isCore", "source", "createdAt", "updatedAt")
VALUES
  ('projects-tasks', 'مدیریت پروژه و تسک', 'productivity', '1.0.0', ARRAY[]::text[], false, 'builtin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('smart-publishing', 'نشر هوشمند', 'productivity', '1.0.0', ARRAY[]::text[], false, 'builtin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "isCore" = false, "source" = 'builtin', "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "TenantModule" ("tenantId", "moduleId", "enabled", "settings")
SELECT t."id", x."id", true, '{}'::jsonb
FROM "Tenant" t
CROSS JOIN (VALUES ('projects-tasks'), ('smart-publishing')) AS x("id")
ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET "enabled" = true;
