-- Expand the existing tenant model without removing legacy fields or data.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

UPDATE "User"
SET "status" = CASE WHEN "isActive" THEN 'active' ELSE 'inactive' END
WHERE "status" IS NULL OR "status" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryOwnerUserId" TEXT;

UPDATE "Tenant"
SET "status" = CASE WHEN "isActive" THEN 'active' ELSE 'inactive' END
WHERE "status" IS NULL OR "status" = '';

UPDATE "Tenant" AS tenant
SET "primaryOwnerUserId" = COALESCE(
      tenant."primaryOwnerUserId",
      (SELECT member."userId" FROM "TenantMember" AS member
       WHERE member."tenantId" = tenant."id" AND member."role" = 'owner'
       ORDER BY member."joinedAt" ASC LIMIT 1)
    ),
    "createdByUserId" = COALESCE(
      tenant."createdByUserId",
      (SELECT member."userId" FROM "TenantMember" AS member
       WHERE member."tenantId" = tenant."id" AND member."role" = 'owner'
       ORDER BY member."joinedAt" ASC LIMIT 1)
    );

CREATE INDEX IF NOT EXISTS "Tenant_status_idx" ON "Tenant"("status");
CREATE INDEX IF NOT EXISTS "Tenant_createdByUserId_idx" ON "Tenant"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Tenant_primaryOwnerUserId_idx" ON "Tenant"("primaryOwnerUserId");

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Tenant_primaryOwnerUserId_fkey" FOREIGN KEY ("primaryOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TenantMember"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "jobTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "roleChangedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "leftAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "TenantMember_tenantId_status_idx" ON "TenantMember"("tenantId", "status");

ALTER TABLE "TenantInvitation"
  ADD COLUMN IF NOT EXISTS "tokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "invitedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "TenantInvitation"
SET "status" = CASE
  WHEN "accepted" THEN 'accepted'
  WHEN "expiresAt" < CURRENT_TIMESTAMP THEN 'expired'
  ELSE 'pending'
END;

CREATE UNIQUE INDEX IF NOT EXISTS "TenantInvitation_tokenHash_key" ON "TenantInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "TenantInvitation_tenantId_status_idx" ON "TenantInvitation"("tenantId", "status");

-- Platform-level audit events do not necessarily belong to a tenant.
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" DROP NOT NULL;
