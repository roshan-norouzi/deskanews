DROP INDEX IF EXISTS "NewsFeed_tenantId_sourceType_idx";

ALTER TABLE "PlatformConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PlatformFeed" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PlatformFeedArticle" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "TenantPlatformFeed" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "TenantUsageCounter" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "UsageMetricDefinition" ALTER COLUMN "updatedAt" DROP DEFAULT;
