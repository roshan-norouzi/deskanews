-- Invalidate already-issued access tokens after logout-all or account disable.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsInvalidatedAt" TIMESTAMP(3);
