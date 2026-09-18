-- Extend feed sources with adapter metadata and Iran-centric source types.

ALTER TABLE "NewsFeed"
  ADD COLUMN IF NOT EXISTS "rightsMode" TEXT NOT NULL DEFAULT 'quote_ok',
  ADD COLUMN IF NOT EXISTS "adapterConfig" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "PlatformFeed"
  ADD COLUMN IF NOT EXISTS "rightsMode" TEXT NOT NULL DEFAULT 'quote_ok',
  ADD COLUMN IF NOT EXISTS "adapterConfig" JSONB NOT NULL DEFAULT '{}';

UPDATE "NewsFeed"
SET "rightsMode" = 'rewrite_required'
WHERE "sourceType" IN ('website', 'telegram', 'sitemap');

UPDATE "PlatformFeed"
SET "rightsMode" = 'rewrite_required'
WHERE "sourceType" IN ('website', 'telegram', 'sitemap');
