ALTER TABLE "User"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "nationalId" TEXT,
  ADD COLUMN "fatherName" TEXT,
  ADD COLUMN "motherName" TEXT,
  ADD COLUMN "birthCertificateNumber" TEXT,
  ADD COLUMN "birthCertificateDate" DATE,
  ADD COLUMN "birthDate" DATE,
  ADD COLUMN "maritalStatus" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "mobilePhone" TEXT,
  ADD COLUMN "landlinePhone" TEXT,
  ADD COLUMN "bankAccountNumber" TEXT,
  ADD COLUMN "bankCardNumber" TEXT,
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "insuranceNumber" TEXT;

CREATE INDEX "User_nationalId_idx" ON "User"("nationalId");

-- Pick the latest employee profile for each platform user as the initial
-- source of truth. Empty values remain empty and can be completed by the user.
WITH "latest_employee" AS (
  SELECT DISTINCT ON ("userId")
    "userId", "firstName", "lastName", "nationalId", "fatherName", "motherName",
    "birthCertificateNumber", "birthCertificateDate", "birthDate", "maritalStatus",
    "address", "postalCode", "mobilePhone", "landlinePhone", "bankAccountNumber",
    "bankCardNumber", "iban", "bankName", "insuranceNumber"
  FROM "Employee"
  WHERE "userId" IS NOT NULL
  ORDER BY "userId", "updatedAt" DESC, "id" DESC
)
UPDATE "User" AS u
SET
  "firstName" = e."firstName",
  "lastName" = e."lastName",
  "nationalId" = e."nationalId",
  "fatherName" = e."fatherName",
  "motherName" = e."motherName",
  "birthCertificateNumber" = e."birthCertificateNumber",
  "birthCertificateDate" = e."birthCertificateDate",
  "birthDate" = e."birthDate",
  "maritalStatus" = e."maritalStatus",
  "address" = e."address",
  "postalCode" = e."postalCode",
  "mobilePhone" = e."mobilePhone",
  "landlinePhone" = e."landlinePhone",
  "bankAccountNumber" = e."bankAccountNumber",
  "bankCardNumber" = e."bankCardNumber",
  "iban" = e."iban",
  "bankName" = e."bankName",
  "insuranceNumber" = e."insuranceNumber"
FROM "latest_employee" AS e
WHERE u."id" = e."userId";
