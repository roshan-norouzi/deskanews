INSERT INTO "ModuleDefinition" (
  "id", "name", "domain", "version", "dependencies", "isCore", "source", "createdAt", "updatedAt"
)
VALUES (
  'public-relations', 'روابط عمومی', 'productivity', '1.0.0', ARRAY['calendar']::TEXT[], false, 'builtin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "domain" = EXCLUDED."domain",
  "version" = EXCLUDED."version",
  "dependencies" = EXCLUDED."dependencies",
  "isCore" = EXCLUDED."isCore",
  "source" = EXCLUDED."source",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "TenantModule" ("tenantId", "moduleId", "enabled", "settings")
SELECT "id", 'public-relations', false, '{}'::jsonb
FROM "Tenant"
ON CONFLICT ("tenantId", "moduleId") DO NOTHING;

CREATE TABLE "PublicRelationsProject" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "objective" TEXT NOT NULL,
  "organizationProfile" TEXT NOT NULL DEFAULT 'private_company',
  "mode" TEXT NOT NULL DEFAULT 'in_person',
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "location" TEXT,
  "targetAudience" TEXT,
  "ownerId" TEXT,
  "approvedBudget" DECIMAL(15,2),
  "actualCost" DECIMAL(15,2),
  "details" JSONB NOT NULL DEFAULT '{}',
  "calendarRisk" TEXT NOT NULL DEFAULT 'unassessed',
  "calendarAssessment" JSONB,
  "calendarCheckedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRelationsProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicRelationsTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "deliverable" TEXT,
  "ownerName" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'todo',
  "required" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRelationsTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicRelationsAgendaItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3),
  "durationMinutes" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "ownerName" TEXT,
  "onlineAction" TEXT,
  "technicalNotes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRelationsAgendaItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicRelationsBudgetItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
  "unitCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "estimatedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "actualAmount" DECIMAL(15,2),
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRelationsBudgetItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicRelationsProject_tenantId_type_status_idx" ON "PublicRelationsProject"("tenantId", "type", "status");
CREATE INDEX "PublicRelationsProject_tenantId_startAt_idx" ON "PublicRelationsProject"("tenantId", "startAt");
CREATE INDEX "PublicRelationsTask_tenantId_projectId_status_idx" ON "PublicRelationsTask"("tenantId", "projectId", "status");
CREATE INDEX "PublicRelationsTask_projectId_phase_sortOrder_idx" ON "PublicRelationsTask"("projectId", "phase", "sortOrder");
CREATE INDEX "PublicRelationsAgendaItem_tenantId_projectId_sortOrder_idx" ON "PublicRelationsAgendaItem"("tenantId", "projectId", "sortOrder");
CREATE INDEX "PublicRelationsBudgetItem_tenantId_projectId_category_idx" ON "PublicRelationsBudgetItem"("tenantId", "projectId", "category");

ALTER TABLE "PublicRelationsProject" ADD CONSTRAINT "PublicRelationsProject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicRelationsTask" ADD CONSTRAINT "PublicRelationsTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicRelationsTask" ADD CONSTRAINT "PublicRelationsTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PublicRelationsProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicRelationsAgendaItem" ADD CONSTRAINT "PublicRelationsAgendaItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicRelationsAgendaItem" ADD CONSTRAINT "PublicRelationsAgendaItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PublicRelationsProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicRelationsBudgetItem" ADD CONSTRAINT "PublicRelationsBudgetItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicRelationsBudgetItem" ADD CONSTRAINT "PublicRelationsBudgetItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PublicRelationsProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
