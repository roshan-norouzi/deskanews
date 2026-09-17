ALTER TABLE "DailyReport" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "DailyReportArticleDecision" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "decision" TEXT NOT NULL DEFAULT 'rejected',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyReportArticleDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyReportArticleDecision_reportId_articleId_key"
  ON "DailyReportArticleDecision"("reportId", "articleId");
CREATE INDEX IF NOT EXISTS "DailyReportArticleDecision_tenantId_decision_idx"
  ON "DailyReportArticleDecision"("tenantId", "decision");
CREATE INDEX IF NOT EXISTS "DailyReportArticleDecision_articleId_idx"
  ON "DailyReportArticleDecision"("articleId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyReportArticleDecision_reportId_fkey') THEN
    ALTER TABLE "DailyReportArticleDecision" ADD CONSTRAINT "DailyReportArticleDecision_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyReportArticleDecision_articleId_fkey') THEN
    ALTER TABLE "DailyReportArticleDecision" ADD CONSTRAINT "DailyReportArticleDecision_articleId_fkey"
      FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
