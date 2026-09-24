ALTER TABLE "NewsFeed" ADD COLUMN "sourceGroupId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PlatformFeed" ADD COLUMN "sourceGroupId" TEXT NOT NULL DEFAULT '';

UPDATE "NewsFeed" SET "sourceGroupId" = "id" WHERE "sourceGroupId" = '';
UPDATE "PlatformFeed" SET "sourceGroupId" = "id" WHERE "sourceGroupId" = '';

CREATE INDEX "NewsFeed_tenantId_sourceGroupId_idx" ON "NewsFeed"("tenantId", "sourceGroupId");
CREATE INDEX "PlatformFeed_sourceGroupId_idx" ON "PlatformFeed"("sourceGroupId");
