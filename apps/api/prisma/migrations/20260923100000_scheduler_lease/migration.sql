-- CreateTable
CREATE TABLE "SchedulerLease" (
    "key" TEXT NOT NULL,
    "holder" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulerLease_pkey" PRIMARY KEY ("key")
);

INSERT INTO "SchedulerLease" ("key", "holder", "expiresAt", "updatedAt")
VALUES ('global-interval', '', TIMESTAMP '1970-01-01 00:00:00', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
