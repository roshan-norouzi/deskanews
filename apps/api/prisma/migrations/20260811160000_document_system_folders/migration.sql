-- System folders for documents module
ALTER TABLE "DocumentFolder" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocumentFolder" ADD COLUMN IF NOT EXISTS "systemKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentFolder_tenantId_systemKey_key"
  ON "DocumentFolder"("tenantId", "systemKey");
