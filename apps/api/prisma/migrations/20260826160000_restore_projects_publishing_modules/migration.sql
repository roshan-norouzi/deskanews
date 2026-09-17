-- These modules are optional (not core), but are enabled for existing tenants
-- so upgrading DESKA does not silently remove their navigation.
ALTER TABLE "ModuleDefinition"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'builtin',
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "ModuleDefinition" ("id", "name", "domain", "version", "dependencies", "isCore", "source", "createdAt", "updatedAt")
VALUES
  ('projects-tasks', 'مدیریت پروژه و تسک', 'productivity', '1.0.0', ARRAY[]::text[], false, 'builtin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('smart-publishing', 'نشر هوشمند', 'productivity', '1.0.0', ARRAY[]::text[], false, 'builtin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "domain" = EXCLUDED."domain",
  "isCore" = false,
  "source" = 'builtin',
  "updatedAt" = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "NewsFeed" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "url" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "lastFetchedAt" TIMESTAMP(3), "lastError" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "NewsFeed_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "NewsArticle" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "feedId" TEXT, "canonicalUrl" TEXT NOT NULL, "originalUrl" TEXT NOT NULL DEFAULT '', "guid" TEXT NOT NULL DEFAULT '', "originalTitle" TEXT NOT NULL DEFAULT '', "originalSummary" TEXT NOT NULL DEFAULT '', "originalContent" TEXT NOT NULL DEFAULT '', "titleFa" TEXT NOT NULL DEFAULT '', "summaryFa" TEXT NOT NULL DEFAULT '', "contentFa" TEXT NOT NULL DEFAULT '', "featuredImageUrl" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'new', "sourceName" TEXT NOT NULL DEFAULT '', "publishedAtSource" TIMESTAMP(3), "wordpressPostUrl" TEXT NOT NULL DEFAULT '', "lastError" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "SocialFeed" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "url" TEXT NOT NULL, "category" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SocialFeed_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "SocialArticle" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "feedId" TEXT, "title" TEXT NOT NULL, "link" TEXT NOT NULL, "author" TEXT, "category" TEXT, "publishedAt" TIMESTAMP(3), "featuredImageUrl" TEXT, "originalText" TEXT, "leadText" TEXT, "summaryText" TEXT, "rewrittenText" TEXT, "readingTime" INTEGER, "status" TEXT NOT NULL DEFAULT 'pending', "telegramSentAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SocialArticle_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "NewsFeed_tenantId_url_key" ON "NewsFeed"("tenantId","url");
CREATE UNIQUE INDEX IF NOT EXISTS "NewsArticle_tenantId_canonicalUrl_key" ON "NewsArticle"("tenantId","canonicalUrl");
CREATE UNIQUE INDEX IF NOT EXISTS "SocialArticle_tenantId_link_key" ON "SocialArticle"("tenantId","link");
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "NewsFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialArticle" ADD CONSTRAINT "SocialArticle_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "SocialFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TenantModule" ("tenantId", "moduleId", "enabled", "settings")
SELECT t."id", m."id", true, '{}'::jsonb
FROM "Tenant" t
CROSS JOIN (VALUES ('projects-tasks'), ('smart-publishing')) AS m("id")
ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET "enabled" = true;
