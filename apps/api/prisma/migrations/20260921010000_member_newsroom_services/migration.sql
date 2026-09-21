-- Per-member newsroom service access for organization users
ALTER TABLE "TenantMember" ADD COLUMN "newsroomServiceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
