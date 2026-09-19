-- Link HR employees to organization users (tenant members)
ALTER TABLE "Employee" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Employee_tenantId_userId_key" ON "Employee"("tenantId", "userId");
