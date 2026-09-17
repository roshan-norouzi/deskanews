-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;

-- AddForeignKey (Product relation on StockQuant)
ALTER TABLE "StockQuant" DROP CONSTRAINT IF EXISTS "StockQuant_productId_fkey";
ALTER TABLE "StockQuant" ADD CONSTRAINT "StockQuant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
