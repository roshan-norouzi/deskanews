-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentTerm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SalesQuotation" ADD COLUMN IF NOT EXISTS "paymentTermId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentTermId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTerm_tenantId_name_key" ON "PaymentTerm"("tenantId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PaymentTerm_tenantId_idx" ON "PaymentTerm"("tenantId");
