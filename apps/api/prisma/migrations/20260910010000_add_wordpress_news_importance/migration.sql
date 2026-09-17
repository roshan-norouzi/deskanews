CREATE TABLE "WordPressNewsEvaluation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "wordpressPostId" INTEGER NOT NULL,
  "postTitle" TEXT NOT NULL DEFAULT '',
  "postUrl" TEXT NOT NULL DEFAULT '',
  "wordpressModifiedAt" TIMESTAMP(3),
  "importance" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "newsValues" JSONB NOT NULL DEFAULT '[]',
  "source" TEXT NOT NULL DEFAULT 'ai',
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "overriddenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WordPressNewsEvaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WordPressNewsEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WordPressNewsEvaluation_score_check" CHECK ("score" >= 0 AND "score" <= 100),
  CONSTRAINT "WordPressNewsEvaluation_importance_check" CHECK ("importance" IN ('important', 'normal')),
  CONSTRAINT "WordPressNewsEvaluation_source_check" CHECK ("source" IN ('ai', 'manual'))
);

CREATE UNIQUE INDEX "WordPressNewsEvaluation_tenantId_wordpressPostId_key"
  ON "WordPressNewsEvaluation"("tenantId", "wordpressPostId");

CREATE INDEX "WordPressNewsEvaluation_tenantId_importance_evaluatedAt_idx"
  ON "WordPressNewsEvaluation"("tenantId", "importance", "evaluatedAt");
