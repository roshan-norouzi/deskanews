CREATE TABLE "SystemCalendarObservance" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "recurrenceType" TEXT NOT NULL DEFAULT 'yearly',
    "recurrenceRule" JSONB,
    "recurrenceCal" TEXT NOT NULL DEFAULT 'jalali',
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'university-of-tehran-1405',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemCalendarObservance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemCalendarObservance_sourceKey_key" ON "SystemCalendarObservance"("sourceKey");
CREATE INDEX "SystemCalendarObservance_startAt_idx" ON "SystemCalendarObservance"("startAt");