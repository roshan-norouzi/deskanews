-- Backfill for installations where the social studio migration was already
-- marked applied before author image support was added.
ALTER TABLE "SocialArticle" ADD COLUMN IF NOT EXISTS "authorImageUrl" TEXT;
