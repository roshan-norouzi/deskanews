ALTER TABLE "SocialArticle"
ADD COLUMN IF NOT EXISTS "generatedImageUrl" TEXT,
ADD COLUMN IF NOT EXISTS "generatedImageTemplateId" TEXT;
