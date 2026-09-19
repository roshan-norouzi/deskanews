ALTER TABLE "PlatformFeed" ADD COLUMN IF NOT EXISTS "catalogGroup" TEXT NOT NULL DEFAULT 'media-domestic';

UPDATE "PlatformFeed"
SET "catalogGroup" = CASE
  WHEN "sourceType" = 'telegram' THEN 'telegram'
  WHEN "sourceType" = 'twitter' THEN 'twitter'
  WHEN "sourceLanguage" = 'fa' THEN 'media-domestic'
  ELSE 'media-international'
END;
