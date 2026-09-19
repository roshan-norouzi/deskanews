-- AlterTable
ALTER TABLE "NewsFeed" ADD COLUMN "sourceLanguage" TEXT NOT NULL DEFAULT 'auto';

-- AlterTable
ALTER TABLE "PlatformFeed" ADD COLUMN "sourceLanguage" TEXT NOT NULL DEFAULT 'auto';

-- AlterTable
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "autoPoll" BOOLEAN;
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "autoPrepare" BOOLEAN;
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "autoPublish" BOOLEAN;
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "autoSendSocial" BOOLEAN;
