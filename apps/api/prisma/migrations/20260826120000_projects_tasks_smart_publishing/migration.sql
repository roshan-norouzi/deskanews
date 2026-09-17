CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active', "startDate" TIMESTAMP(3), "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "Task" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "projectId" TEXT, "title" TEXT NOT NULL, "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'todo', "priority" TEXT NOT NULL DEFAULT 'normal', "assigneeId" TEXT,
  "dueDate" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "PublishChannel" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "type" TEXT NOT NULL, "endpoint" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "settings" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublishChannel_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "PublishArticle" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "channelId" TEXT, "title" TEXT NOT NULL, "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "scheduledAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3), "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishArticle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Project_tenantId_status_idx" ON "Project"("tenantId","status");
CREATE INDEX IF NOT EXISTS "Task_tenantId_status_idx" ON "Task"("tenantId","status");
CREATE INDEX IF NOT EXISTS "Task_tenantId_projectId_idx" ON "Task"("tenantId","projectId");
CREATE INDEX IF NOT EXISTS "PublishChannel_tenantId_type_idx" ON "PublishChannel"("tenantId","type");
CREATE INDEX IF NOT EXISTS "PublishArticle_tenantId_status_idx" ON "PublishArticle"("tenantId","status");
CREATE INDEX IF NOT EXISTS "PublishArticle_tenantId_scheduledAt_idx" ON "PublishArticle"("tenantId","scheduledAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_projectId_fkey') THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PublishArticle_channelId_fkey') THEN
    ALTER TABLE "PublishArticle" ADD CONSTRAINT "PublishArticle_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PublishChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
