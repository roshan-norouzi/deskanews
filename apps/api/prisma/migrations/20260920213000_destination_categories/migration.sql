-- CreateTable
CREATE TABLE "DestinationCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT '',
    "parentExternalId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isGeneral" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DestinationCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "NewsArticle" ADD COLUMN "destinationCategoryId" TEXT,
ADD COLUMN "categorySource" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "DestinationCategory_tenantId_status_idx" ON "DestinationCategory"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationCategory_tenantId_platform_externalId_key" ON "DestinationCategory"("tenantId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "NewsArticle_tenantId_destinationCategoryId_idx" ON "NewsArticle"("tenantId", "destinationCategoryId");

-- AddForeignKey
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_destinationCategoryId_fkey" FOREIGN KEY ("destinationCategoryId") REFERENCES "DestinationCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationCategory" ADD CONSTRAINT "DestinationCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationCategory" ADD CONSTRAINT "DestinationCategory_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
