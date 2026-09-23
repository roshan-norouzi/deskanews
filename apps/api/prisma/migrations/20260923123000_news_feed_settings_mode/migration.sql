ALTER TABLE "NewsFeed" ADD COLUMN IF NOT EXISTS "settingsMode" TEXT NOT NULL DEFAULT 'default';

-- Feeds that already carry their own automation values keep them as a custom override.
UPDATE "NewsFeed"
SET "settingsMode" = 'custom'
WHERE "purpose" = 'news-room'
  AND (
    "pollIntervalMinutes" IS NOT NULL
    OR "autoPoll" IS NOT NULL
    OR "autoPrepare" IS NOT NULL
    OR "autoPublish" IS NOT NULL
    OR "autoSendSocial" IS NOT NULL
  );
