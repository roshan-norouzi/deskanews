CREATE TABLE IF NOT EXISTS "NewsFeed" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastFetchedAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsFeed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NewsFeed_tenantId_url_key" ON "NewsFeed"("tenantId", "url");
CREATE INDEX IF NOT EXISTS "NewsFeed_tenantId_enabled_idx" ON "NewsFeed"("tenantId", "enabled");

CREATE TABLE IF NOT EXISTS "NewsArticle" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "feedId" TEXT,
  "canonicalUrl" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL DEFAULT '',
  "guid" TEXT NOT NULL DEFAULT '',
  "originalTitle" TEXT NOT NULL DEFAULT '',
  "originalSummary" TEXT NOT NULL DEFAULT '',
  "originalContent" TEXT NOT NULL DEFAULT '',
  "titleFa" TEXT NOT NULL DEFAULT '',
  "summaryFa" TEXT NOT NULL DEFAULT '',
  "contentFa" TEXT NOT NULL DEFAULT '',
  "featuredImageUrl" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'new',
  "sourceName" TEXT NOT NULL DEFAULT '',
  "publishedAtSource" TIMESTAMP(3),
  "wordpressPostUrl" TEXT NOT NULL DEFAULT '',
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NewsArticle_tenantId_canonicalUrl_key" ON "NewsArticle"("tenantId", "canonicalUrl");
CREATE INDEX IF NOT EXISTS "NewsArticle_tenantId_status_idx" ON "NewsArticle"("tenantId", "status");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NewsArticle_feedId_fkey'
  ) THEN
    ALTER TABLE "NewsArticle"
      ADD CONSTRAINT "NewsArticle_feedId_fkey"
      FOREIGN KEY ("feedId") REFERENCES "NewsFeed"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
