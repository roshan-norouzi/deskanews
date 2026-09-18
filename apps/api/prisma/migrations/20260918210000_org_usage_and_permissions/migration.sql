-- Organization usage tracking and member-level permissions

ALTER TABLE "TenantMember" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "UsageMetricDefinition" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL DEFAULT 'توکن',
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageMetricDefinition_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "TenantUsageCounter" (
    "tenantId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantUsageCounter_pkey" PRIMARY KEY ("tenantId","metricKey")
);

CREATE INDEX "TenantUsageCounter_tenantId_idx" ON "TenantUsageCounter"("tenantId");

ALTER TABLE "TenantUsageCounter" ADD CONSTRAINT "TenantUsageCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantUsageCounter" ADD CONSTRAINT "TenantUsageCounter_metricKey_fkey" FOREIGN KEY ("metricKey") REFERENCES "UsageMetricDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "UsageMetricDefinition" ("key", "label", "unitLabel", "unitCost", "enabled", "sortOrder", "updatedAt")
VALUES
  ('news.monitored', 'خبرهای پایش‌شده', 'توکن', 1, true, 10, CURRENT_TIMESTAMP),
  ('news.prepared', 'خبرهای آماده‌شده', 'توکن', 1, true, 20, CURRENT_TIMESTAMP),
  ('news.summarized', 'خبرهای خلاصه‌شده', 'توکن', 1, true, 30, CURRENT_TIMESTAMP),
  ('news.translated', 'خبرهای ترجمه‌شده', 'توکن', 1, true, 40, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Backfill member permissions from legacy roles
UPDATE "TenantMember"
SET "permissions" = CASE "role"
  WHEN 'owner' THEN ARRAY[]::TEXT[]
  WHEN 'admin' THEN ARRAY[
    'organization.members.view',
    'organization.members.add',
    'organization.members.manage',
    'dashboard.view',
    'settings.manage',
    'users.manage',
    'publishing.view',
    'publishing.manage',
    'publishing.publish',
    'publishing.settings'
  ]::TEXT[]
  WHEN 'manager' THEN ARRAY[
    'organization.members.view',
    'organization.members.manage',
    'dashboard.view',
    'settings.manage',
    'publishing.view',
    'publishing.manage',
    'publishing.publish',
    'publishing.settings'
  ]::TEXT[]
  WHEN 'senior_specialist' THEN ARRAY[
    'platform.users.view',
    'platform.organizations.view',
    'organization.members.view',
    'dashboard.view',
    'publishing.view',
    'publishing.manage',
    'publishing.publish'
  ]::TEXT[]
  WHEN 'member' THEN ARRAY[
    'platform.users.view',
    'platform.organizations.view',
    'organization.members.view',
    'dashboard.view',
    'publishing.view'
  ]::TEXT[]
  WHEN 'viewer' THEN ARRAY[
    'platform.users.view',
    'platform.organizations.view',
    'organization.members.view',
    'dashboard.view',
    'publishing.view'
  ]::TEXT[]
  ELSE ARRAY[]::TEXT[]
END
WHERE COALESCE(array_length("permissions", 1), 0) = 0;
