-- Per-tenant filter/poll overrides for subscribed platform feeds.
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "settingsMode" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "includeWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TenantPlatformFeed" ADD COLUMN "excludeWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
