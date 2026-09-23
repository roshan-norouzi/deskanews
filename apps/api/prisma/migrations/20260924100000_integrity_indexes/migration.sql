-- Audit history and activity outlive the user account that produced them.
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Activity" DROP CONSTRAINT "Activity_userId_fkey";
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invitations keep a real reference to the inviter.
UPDATE "TenantInvitation" i
SET "invitedByUserId" = NULL
WHERE i."invitedByUserId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = i."invitedByUserId");
CREATE INDEX "TenantInvitation_invitedByUserId_idx" ON "TenantInvitation"("invitedByUserId");
ALTER TABLE "TenantInvitation" ADD CONSTRAINT "TenantInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Newsroom list/sort and feed-scoped lookups.
CREATE INDEX "NewsArticle_tenantId_status_publishedAtSource_idx" ON "NewsArticle"("tenantId", "status", "publishedAtSource");
DROP INDEX "NewsArticle_tenantId_status_idx";
CREATE INDEX "NewsArticle_feedId_idx" ON "NewsArticle"("feedId");
CREATE INDEX "Activity_tenantId_createdAt_idx" ON "Activity"("tenantId", "createdAt");

-- Covered by the ("tenantId", "metricKey") primary key.
DROP INDEX "TenantUsageCounter_tenantId_idx";

-- Wallet counters can never go below zero; balance may, while enforcement is off.
ALTER TABLE "TenantWallet" ADD CONSTRAINT "TenantWallet_reservedTokens_nonnegative" CHECK ("reservedTokens" >= 0);
ALTER TABLE "TenantWallet" ADD CONSTRAINT "TenantWallet_consumedTokens_nonnegative" CHECK ("consumedTokens" >= 0);
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_amount_nonnegative" CHECK ("amount" >= 0);
