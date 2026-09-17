ALTER TABLE "SystemCalendarObservance"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "SystemCalendarObservance_isActive_idx"
ON "SystemCalendarObservance"("isActive");
