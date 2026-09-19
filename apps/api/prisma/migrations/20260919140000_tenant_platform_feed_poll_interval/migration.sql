-- Per-tenant override for platform feed poll interval (minutes).
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "pollIntervalMinutes" INTEGER;
