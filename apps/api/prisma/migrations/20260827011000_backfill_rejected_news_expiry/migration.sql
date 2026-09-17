UPDATE "NewsArticle"
SET
  "rejectedAt" = COALESCE("rejectedAt", "updatedAt"),
  "purgeAfter" = COALESCE("purgeAfter", "updatedAt" + INTERVAL '3 days')
WHERE "status" = 'rejected' AND "purgeAfter" IS NULL;
