-- Additive reconciliation for databases created by either the historical
-- migration chain or an earlier `prisma db push`. No business rows are removed.

ALTER TABLE "JobOpening"
  ADD COLUMN IF NOT EXISTS "departmentId" TEXT;

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "workType" TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS "managerId" TEXT,
  ADD COLUMN IF NOT EXISTS "parentId" TEXT,
  ADD COLUMN IF NOT EXISTS "progressPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "budget" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "cost" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "revenue" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "parentId" TEXT,
  ADD COLUMN IF NOT EXISTS "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "recurrenceRule" JSONB,
  ADD COLUMN IF NOT EXISTS "recurrenceStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recurrenceType" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ProjectMember" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChecklistItem" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- Some development databases recorded the historical publishing migration
-- before SocialFeed was added to that migration. Recreate the registry here
-- so those databases can upgrade without being reset or losing data.
CREATE TABLE IF NOT EXISTS "SocialFeed" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "category" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialFeed_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SocialFeed" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX IF NOT EXISTS "Employee_tenantId_nationalId_idx" ON "Employee"("tenantId", "nationalId");
CREATE INDEX IF NOT EXISTS "Employee_tenantId_mobilePhone_idx" ON "Employee"("tenantId", "mobilePhone");
CREATE INDEX IF NOT EXISTS "SocialFeed_tenantId_idx" ON "SocialFeed"("tenantId");

-- NOT VALID protects an upgrade from being blocked by historical orphan rows,
-- while PostgreSQL still enforces each constraint for all new writes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_parentId_fkey' AND conrelid = '"Project"'::regclass) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_projectId_fkey' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_parentId_fkey' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectMember_projectId_fkey' AND conrelid = '"ProjectMember"'::regclass) THEN
    ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChecklistItem_taskId_fkey' AND conrelid = '"ChecklistItem"'::regclass) THEN
    ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalStep_taskId_fkey' AND conrelid = '"ApprovalStep"'::regclass) THEN
    ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_userId_fkey' AND conrelid = '"Employee"'::regclass) THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_contactId_fkey' AND conrelid = '"Employee"'::regclass) THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobOpening_departmentId_fkey' AND conrelid = '"JobOpening"'::regclass) THEN
    ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

ALTER TABLE "ModuleDefinition" ALTER COLUMN "updatedAt" DROP DEFAULT;
