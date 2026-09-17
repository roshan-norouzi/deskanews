ALTER TABLE "NewsArticle"
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "purgeAfter" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "wordpressPostId" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "NewsArticle_status_purgeAfter_idx"
  ON "NewsArticle"("status", "purgeAfter");
