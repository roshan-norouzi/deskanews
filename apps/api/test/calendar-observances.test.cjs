require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { ForbiddenException } = require('@nestjs/common');
const observances = require('../prisma/system-observances.json');
const {
  buildGregorianMonthGrid,
  buildJalaliMonthGrid,
  eventMatchesCalendarCell,
  getLunarDateParts,
} = require('@deska/shared');
const { CalendarService } = require('../dist/modules/calendar/calendar.service');
const { SystemObservancesController } = require('../dist/modules/calendar/system-observances.controller');

function findByRule(calendar, month, day, title) {
  return observances.find((item) =>
    item.recurrenceCal === calendar &&
    item.recurrenceRule.month === month &&
    item.recurrenceRule.day === day &&
    (!title || item.title.includes(title)),
  );
}

test('imported calendar contains the corrected, deduplicated workbook data', () => {
  assert.equal(observances.length, 335);
  assert.deepEqual(
    observances.reduce((counts, item) => ({ ...counts, [item.recurrenceCal]: (counts[item.recurrenceCal] ?? 0) + 1 }), {}),
    { jalali: 192, gregorian: 86, lunar: 57 },
  );
  assert.equal(observances.filter((item) => item.isHoliday).length, 27);

  const recurrenceKeys = observances.map((item) =>
    `${item.recurrenceCal}-${item.recurrenceRule.month}-${item.recurrenceRule.day}`,
  );
  assert.equal(new Set(recurrenceKeys).size, observances.length);
  assert.ok(observances.every((item) => item.recurrenceType === 'yearly'));
  assert.ok(observances.filter((item) => item.recurrenceCal === 'lunar').every((item) => {
    const actual = getLunarDateParts(new Date(item.startAt));
    return actual.month === item.recurrenceRule.month && actual.day === item.recurrenceRule.day;
  }));

  assert.equal(findByRule('gregorian', 3, 22, 'روز جهانی آب').startAt, '2026-03-22T12:00:00Z');
  assert.equal(findByRule('jalali', 2, 5, 'طبس').startAt, '2026-04-25T12:00:00Z');
  assert.equal(findByRule('jalali', 2, 6, 'بندر شهید رجایی').startAt, '2026-04-26T12:00:00Z');
  assert.equal(findByRule('lunar', 2, 29, 'شهادت امام رضا').isHoliday, true);
  assert.equal(observances.filter((item) => item.recurrenceCal === 'lunar' && item.recurrenceRule.month === 10 && item.recurrenceRule.day === 1).length, 1);
});

test('yearly events recur in their native calendar while the UI is Jalali', () => {
  const nowruz = findByRule('jalali', 1, 1, 'نوروز');
  const waterDay = findByRule('gregorian', 3, 22, 'روز جهانی آب');
  const eidFitr = findByRule('lunar', 10, 1, 'عید سعید فطر');

  const jalali1405 = buildJalaliMonthGrid(1405, 1).find((cell) => cell.jalali.jm === 1 && cell.jalali.jd === 1);
  const jalali1406 = buildJalaliMonthGrid(1406, 1).find((cell) => cell.jalali.jm === 1 && cell.jalali.jd === 1);
  assert.equal(eventMatchesCalendarCell(nowruz.startAt, jalali1405, 'jalali', nowruz.recurrenceType, nowruz.recurrenceCal, nowruz.recurrenceRule), true);
  assert.equal(eventMatchesCalendarCell(nowruz.startAt, jalali1406, 'jalali', nowruz.recurrenceType, nowruz.recurrenceCal, nowruz.recurrenceRule), true);

  const march2026 = buildGregorianMonthGrid(2026, 3);
  const march2027 = buildGregorianMonthGrid(2027, 3);
  const water2026 = march2026.find((cell) => cell.gregorian.gm === 3 && cell.gregorian.gd === 22);
  const water2027 = march2027.find((cell) => cell.gregorian.gm === 3 && cell.gregorian.gd === 22);
  assert.equal(eventMatchesCalendarCell(waterDay.startAt, water2026, 'jalali', waterDay.recurrenceType, waterDay.recurrenceCal, waterDay.recurrenceRule), true);
  assert.equal(eventMatchesCalendarCell(waterDay.startAt, water2027, 'jalali', waterDay.recurrenceType, waterDay.recurrenceCal, waterDay.recurrenceRule), true);

  const eid2026 = march2026.find((cell) => cell.gregorian.gm === 3 && cell.gregorian.gd === 21);
  const eid2027 = march2027.find((cell) => cell.gregorian.gm === 3 && cell.gregorian.gd === 10);
  assert.deepEqual(getLunarDateParts(new Date('2026-03-21T12:00:00Z')), { year: 1447, month: 10, day: 1 });
  assert.deepEqual(getLunarDateParts(new Date('2027-03-10T12:00:00Z')), { year: 1448, month: 10, day: 1 });
  assert.equal(eventMatchesCalendarCell(eidFitr.startAt, eid2026, 'jalali', eidFitr.recurrenceType, eidFitr.recurrenceCal, eidFitr.recurrenceRule), true);
  assert.equal(eventMatchesCalendarCell(eidFitr.startAt, eid2027, 'jalali', eidFitr.recurrenceType, eidFitr.recurrenceCal, eidFitr.recurrenceRule), true);
});

test('system observances are globally readable and deletion is a persistent soft delete', async () => {
  let findQuery;
  let updateQuery;
  const service = new CalendarService({
    systemCalendarObservance: {
      findMany: async (query) => { findQuery = query; return []; },
      update: async (query) => { updateQuery = query; return query; },
    },
  });

  await service.findSystemObservances();
  assert.deepEqual(findQuery.where, { isActive: true });
  await service.removeSystemObservance('observance-1');
  assert.deepEqual(updateQuery, {
    where: { id: 'observance-1' },
    data: { isActive: false, source: 'manual-override' },
  });
});

test('all calendar viewers can read system observances but only super admin can mutate them', async () => {
  const calls = [];
  const controller = new SystemObservancesController({
    findSystemObservances: async () => { calls.push('read'); return []; },
    createSystemObservance: async () => { calls.push('create'); return {}; },
  });

  await controller.findAll();
  assert.deepEqual(calls, ['read']);
  assert.throws(
    () => controller.create({ role: 'user' }, { title: 'نمونه' }),
    ForbiddenException,
  );
  await controller.create({ role: 'super_admin' }, { title: 'نمونه' });
  assert.deepEqual(calls, ['read', 'create']);
});
