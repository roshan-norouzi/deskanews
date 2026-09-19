-- Daily reports are now managed manually. Existing archived reports become editable drafts.
UPDATE "DailyReport"
SET "status" = 'draft', "archivedAt" = NULL
WHERE "status" = 'archived';
