-- Phase 1 operational foundation: durable jobs, integration health,
-- workflow history, and deduplicated notifications.

ALTER TABLE "Notification"
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "readAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Notification_tenantId_userId_dedupeKey_key"
  ON "Notification"("tenantId", "userId", "dedupeKey");

CREATE TABLE "AutomationJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "payload" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB,
  "dedupeKey" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationJob_tenantId_type_dedupeKey_key"
  ON "AutomationJob"("tenantId", "type", "dedupeKey");
CREATE INDEX "AutomationJob_status_availableAt_priority_idx"
  ON "AutomationJob"("status", "availableAt", "priority");
CREATE INDEX "AutomationJob_tenantId_status_createdAt_idx"
  ON "AutomationJob"("tenantId", "status", "createdAt");

CREATE TABLE "IntegrationHealth" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unknown',
  "configured" BOOLEAN NOT NULL DEFAULT true,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER,
  "lastCheckedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationHealth_tenantId_key_key"
  ON "IntegrationHealth"("tenantId", "key");
CREATE INDEX "IntegrationHealth_tenantId_status_updatedAt_idx"
  ON "IntegrationHealth"("tenantId", "status", "updatedAt");
CREATE INDEX "IntegrationHealth_type_status_idx"
  ON "IntegrationHealth"("type", "status");

CREATE TABLE "ContentWorkflowEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorType" TEXT NOT NULL DEFAULT 'system',
  "actorId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentWorkflowEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentWorkflowEvent_tenantId_createdAt_idx"
  ON "ContentWorkflowEvent"("tenantId", "createdAt");
CREATE INDEX "ContentWorkflowEvent_tenantId_entityType_entityId_createdAt_idx"
  ON "ContentWorkflowEvent"("tenantId", "entityType", "entityId", "createdAt");

ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationHealth" ADD CONSTRAINT "IntegrationHealth_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentWorkflowEvent" ADD CONSTRAINT "ContentWorkflowEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
