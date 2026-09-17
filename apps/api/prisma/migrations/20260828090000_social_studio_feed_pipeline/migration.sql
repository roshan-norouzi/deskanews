CREATE TABLE IF NOT EXISTS "SocialArticle" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "feedId" TEXT,
  "title" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "author" TEXT,
  "category" TEXT,
  "publishedAt" TIMESTAMP(3),
  "featuredImageUrl" TEXT,
  "originalText" TEXT,
  "leadText" TEXT,
  "summaryText" TEXT,
  "rewrittenText" TEXT,
  "readingTime" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "telegramSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialArticle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SocialArticle" ADD COLUMN IF NOT EXISTS "authorImageUrl" TEXT;

ALTER TABLE "SocialArticle"
  ADD COLUMN IF NOT EXISTS "shortUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "captionText" TEXT,
  ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastError" TEXT NOT NULL DEFAULT '';

ALTER TABLE "SocialArticle" DROP CONSTRAINT IF EXISTS "SocialArticle_feedId_fkey";

-- Legacy SocialFeed ids belong to an obsolete, separate feed registry. The
-- social studio now uses the central NewsFeed registry and cannot safely map
-- those ids without a matching URL, so preserve articles and detach the link.
UPDATE "SocialArticle" SET "feedId" = NULL
WHERE "feedId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "NewsFeed" f WHERE f."id" = "SocialArticle"."feedId");

ALTER TABLE "SocialArticle"
  ADD CONSTRAINT "SocialArticle_feedId_fkey"
  FOREIGN KEY ("feedId") REFERENCES "NewsFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "SocialArticle_feedId_idx" ON "SocialArticle"("feedId");
CREATE INDEX IF NOT EXISTS "SocialArticle_tenantId_status_idx" ON "SocialArticle"("tenantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "SocialArticle_tenantId_link_key" ON "SocialArticle"("tenantId", "link");
