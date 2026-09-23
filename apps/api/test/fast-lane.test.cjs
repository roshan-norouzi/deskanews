const test = require('node:test');
const assert = require('node:assert/strict');
const { AutomationJobService } = require('../dist/common/services/automation-job.service');

test('fast lane keeps news.prepare and social.cover off the Postgres poller', async () => {
  let where;
  const prisma = {
    automationJob: {
      findFirst: async (query) => {
        where = query.where;
        return null;
      },
    },
  };
  const jobs = new AutomationJobService(prisma);
  jobs.bindFastLane({
    enabled: () => true,
    push: async () => {},
  });

  await jobs.claim('worker-a', 1);

  assert.deepEqual(where.type, { notIn: ['news.prepare', 'social.cover'] });
});

test('without Redis the Postgres poller still claims every queued job', async () => {
  let where;
  const prisma = {
    automationJob: {
      findFirst: async (query) => {
        where = query.where;
        return null;
      },
    },
  };

  await new AutomationJobService(prisma).claim('worker-a', 1);

  assert.equal(where.type, undefined);
});
