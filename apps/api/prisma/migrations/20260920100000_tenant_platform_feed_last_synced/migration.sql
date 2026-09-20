-- Track when each organization last received articles from a shared catalog source.
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
