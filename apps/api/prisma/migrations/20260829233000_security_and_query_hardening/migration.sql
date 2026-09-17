-- Query-path indexes used for session revocation, cleanup and tenant-scoped UI lists.
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "Contact_tenantId_createdAt_idx" ON "Contact"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_tenantId_userId_isRead_createdAt_idx"
  ON "Notification"("tenantId", "userId", "isRead", "createdAt");

-- Application checks alone are race-prone; PostgreSQL is the final authority.
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_tenantId_nationalId_key"
  ON "Contact"("tenantId", "nationalId");
