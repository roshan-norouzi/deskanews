require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { SchedulerLeaseService, GLOBAL_INTERVAL_LEASE_KEY } = require('../dist/common/services/scheduler-lease.service');

function leaseStore() {
  const rows = new Map([
    [GLOBAL_INTERVAL_LEASE_KEY, { key: GLOBAL_INTERVAL_LEASE_KEY, holder: '', expiresAt: new Date(0) }],
  ]);
  return {
    schedulerLease: {
      updateMany: async ({ where, data }) => {
        const row = rows.get(where.key);
        if (!row) return { count: 0 };
        const now = new Date();
        const expired = row.expiresAt <= now;
        const sameHolder = where.OR?.some((clause) => clause.holder !== undefined && clause.holder === row.holder);
        if (!expired && !sameHolder && row.holder && row.holder !== data.holder) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      },
      findUnique: async ({ where }) => rows.get(where.key) ?? null,
    },
  };
}

test('SchedulerLease grants lease to first holder and blocks second until expiry', async () => {
  const service = new SchedulerLeaseService(leaseStore());
  const first = await service.tryAcquire(GLOBAL_INTERVAL_LEASE_KEY, 'replica-a', 60_000);
  const second = await service.tryAcquire(GLOBAL_INTERVAL_LEASE_KEY, 'replica-b', 60_000);
  const renew = await service.tryAcquire(GLOBAL_INTERVAL_LEASE_KEY, 'replica-a', 60_000);

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(renew, true);
});
