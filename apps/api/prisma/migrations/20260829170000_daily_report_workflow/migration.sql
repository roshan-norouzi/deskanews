CREATE TABLE IF NOT EXISTS "DailyReport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DailyReportItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "articleId" TEXT,
  "originalTitle" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "englishTitle" TEXT NOT NULL DEFAULT '',
  "sourceName" TEXT NOT NULL DEFAULT '',
  "sourcePublishedAt" TIMESTAMP(3),
  "segment" TEXT NOT NULL DEFAULT 'Neutral',
  "sourceTier" TEXT NOT NULL DEFAULT 'Tier 1',
  "bullets" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyReportItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyReport_tenantId_reportDate_key" ON "DailyReport"("tenantId", "reportDate");
CREATE INDEX IF NOT EXISTS "DailyReport_tenantId_status_idx" ON "DailyReport"("tenantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyReportItem_reportId_articleId_key" ON "DailyReportItem"("reportId", "articleId");
CREATE INDEX IF NOT EXISTS "DailyReportItem_tenantId_idx" ON "DailyReportItem"("tenantId");
CREATE INDEX IF NOT EXISTS "DailyReportItem_reportId_sortOrder_idx" ON "DailyReportItem"("reportId", "sortOrder");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyReportItem_reportId_fkey') THEN
    ALTER TABLE "DailyReportItem" ADD CONSTRAINT "DailyReportItem_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyReportItem_articleId_fkey') THEN
    ALTER TABLE "DailyReportItem" ADD CONSTRAINT "DailyReportItem_articleId_fkey"
      FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
