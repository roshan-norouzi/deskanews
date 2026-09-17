-- Contact extended fields (Hesabfa-like)
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "economicCode" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "marriageDate" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "membershipDate" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ContactBankAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "cardNumber" TEXT,
    "sheba" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ContactBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContactBankAccount_tenantId_idx" ON "ContactBankAccount"("tenantId");
CREATE INDEX IF NOT EXISTS "ContactBankAccount_contactId_idx" ON "ContactBankAccount"("contactId");

DO $$ BEGIN
  ALTER TABLE "ContactBankAccount" ADD CONSTRAINT "ContactBankAccount_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
