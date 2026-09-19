-- Eid al-Ghadir is observed on 18 Dhu al-Hijjah, not 18 Rabi al-Awwal.
UPDATE "SystemCalendarObservance"
SET "recurrenceCal" = 'lunar',
    "recurrenceRule" = '{"calendar":"lunar","month":12,"day":18}'::jsonb,
    "startAt" = '2026-06-04T12:00:00.000Z',
    "endAt" = '2026-06-04T12:00:00.000Z',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "sourceKey" = '1405-lunar-12-18-eid-ghadir';
