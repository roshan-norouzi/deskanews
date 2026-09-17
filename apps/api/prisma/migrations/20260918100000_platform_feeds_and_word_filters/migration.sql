ALTER TABLE "NewsFeed" DROP COLUMN IF EXISTS "category";

ALTER TABLE "NewsFeed" ADD COLUMN IF NOT EXISTS "resolvedFeedUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NewsFeed" ADD COLUMN IF NOT EXISTS "includeWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "NewsFeed" ADD COLUMN IF NOT EXISTS "excludeWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "PlatformFeed" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'rss',
  "resolvedFeedUrl" TEXT NOT NULL DEFAULT '',
  "includeWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excludeWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 240,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastFetchedAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformFeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformFeed_url_key" ON "PlatformFeed"("url");

CREATE TABLE "TenantPlatformFeed" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "platformFeedId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantPlatformFeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPlatformFeed_tenantId_platformFeedId_key" ON "TenantPlatformFeed"("tenantId", "platformFeedId");
CREATE INDEX "TenantPlatformFeed_tenantId_enabled_idx" ON "TenantPlatformFeed"("tenantId", "enabled");

CREATE TABLE "PlatformFeedArticle" (
  "id" TEXT NOT NULL,
  "platformFeedId" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL DEFAULT '',
  "guid" TEXT NOT NULL DEFAULT '',
  "originalTitle" TEXT NOT NULL DEFAULT '',
  "originalSummary" TEXT NOT NULL DEFAULT '',
  "originalContent" TEXT NOT NULL DEFAULT '',
  "originalContentIsFull" BOOLEAN NOT NULL DEFAULT false,
  "featuredImageUrl" TEXT NOT NULL DEFAULT '',
  "sourceName" TEXT NOT NULL DEFAULT '',
  "publishedAtSource" TIMESTAMP(3),
  "titleFa" TEXT NOT NULL DEFAULT '',
  "summaryFa" TEXT NOT NULL DEFAULT '',
  "prepStatus" TEXT NOT NULL DEFAULT 'new',
  "prepLastError" TEXT NOT NULL DEFAULT '',
  "preparedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformFeedArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformFeedArticle_platformFeedId_canonicalUrl_key" ON "PlatformFeedArticle"("platformFeedId", "canonicalUrl");
CREATE INDEX "PlatformFeedArticle_platformFeedId_prepStatus_idx" ON "PlatformFeedArticle"("platformFeedId", "prepStatus");

ALTER TABLE "NewsArticle" ADD COLUMN IF NOT EXISTS "platformFeedArticleId" TEXT;
CREATE INDEX IF NOT EXISTS "NewsArticle_platformFeedArticleId_idx" ON "NewsArticle"("platformFeedArticleId");

ALTER TABLE "TenantPlatformFeed" ADD CONSTRAINT "TenantPlatformFeed_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantPlatformFeed" ADD CONSTRAINT "TenantPlatformFeed_platformFeedId_fkey"
  FOREIGN KEY ("platformFeedId") REFERENCES "PlatformFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformFeedArticle" ADD CONSTRAINT "PlatformFeedArticle_platformFeedId_fkey"
  FOREIGN KEY ("platformFeedId") REFERENCES "PlatformFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_platformFeedArticleId_fkey"
  FOREIGN KEY ("platformFeedArticleId") REFERENCES "PlatformFeedArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
