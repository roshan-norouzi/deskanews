-- Drop unused HR profile columns and legacy document storage
DROP TABLE IF EXISTS "UserDocument";

ALTER TABLE "User" DROP COLUMN IF EXISTS "nationalId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "fatherName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "motherName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "birthCertificateNumber";
ALTER TABLE "User" DROP COLUMN IF EXISTS "birthCertificateDate";
ALTER TABLE "User" DROP COLUMN IF EXISTS "birthDate";
ALTER TABLE "User" DROP COLUMN IF EXISTS "maritalStatus";
ALTER TABLE "User" DROP COLUMN IF EXISTS "address";
ALTER TABLE "User" DROP COLUMN IF EXISTS "postalCode";
ALTER TABLE "User" DROP COLUMN IF EXISTS "mobilePhone";
ALTER TABLE "User" DROP COLUMN IF EXISTS "landlinePhone";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bankAccountNumber";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bankCardNumber";
ALTER TABLE "User" DROP COLUMN IF EXISTS "iban";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bankName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "insuranceNumber";

DROP INDEX IF EXISTS "User_nationalId_idx";

-- Remove legacy plaintext refresh tokens (hashed tokens are 64-char hex digests)
DELETE FROM "RefreshToken" WHERE "token" !~ '^[a-f0-9]{64}$';

-- Scheduler and maintenance query indexes
CREATE INDEX IF NOT EXISTS "PlatformFeed_enabled_lastFetchedAt_idx"
  ON "PlatformFeed"("enabled", "lastFetchedAt");

CREATE INDEX IF NOT EXISTS "NewsArticle_tenantId_status_processingStartedAt_idx"
  ON "NewsArticle"("tenantId", "status", "processingStartedAt");

CREATE INDEX IF NOT EXISTS "SocialArticle_tenantId_status_processingStartedAt_idx"
  ON "SocialArticle"("tenantId", "status", "processingStartedAt");
