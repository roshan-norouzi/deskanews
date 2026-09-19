ALTER TABLE "NewsFeed" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'news-room';
CREATE INDEX IF NOT EXISTS "NewsFeed_tenantId_purpose_idx" ON "NewsFeed"("tenantId", "purpose");
