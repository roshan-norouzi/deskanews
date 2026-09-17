-- Employee invitations are platform-user invitations, not free-standing
-- employee accounts. The nullable column preserves historical invitations.
ALTER TABLE "TenantInvitation"
  ADD COLUMN "invitedUserId" TEXT,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

UPDATE "TenantInvitation" AS invitation
SET "invitedUserId" = platform_user."id"
FROM "User" AS platform_user
WHERE lower(platform_user."email") = lower(invitation."email")
  AND invitation."invitedUserId" IS NULL;

CREATE INDEX "TenantInvitation_invitedUserId_status_idx"
  ON "TenantInvitation"("invitedUserId", "status");

ALTER TABLE "TenantInvitation"
  ADD CONSTRAINT "TenantInvitation_invitedUserId_fkey"
  FOREIGN KEY ("invitedUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
