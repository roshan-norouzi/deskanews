require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { EventManagementService } = require('../dist/modules/event-management/event-management.service');

test('event-management opportunity scoring enforces sponsorship veto criteria', () => {
  const service = new EventManagementService({});
  const result = service.assessOpportunity({
    type: 'sponsorship',
    scores: {
      audienceFit: 5,
      valueFit: 1,
      assetQuality: 5,
      exclusivity: 5,
      organizerCredibility: 5,
      activationCapacity: 5,
    },
  });

  assert.equal(result.recommendation, 'do_not_proceed');
  assert.deepEqual(result.vetoes, ['تطابق ارزشی']);
});

test('event-management opportunity scoring rejects values outside 1 to 5', () => {
  const service = new EventManagementService({});
  assert.throws(
    () => service.assessOpportunity({ type: 'event', scores: { necessity: 6, guestValue: 3, resourceReadiness: 3, contextFit: 3 } }),
    BadRequestException,
  );
});

test('event-management project listing is always tenant scoped', async () => {
  let receivedWhere;
  const service = new EventManagementService({
    eventManagementProject: {
      findMany: async (query) => { receivedWhere = query.where; return []; },
    },
  });

  await service.list('tenant-a', 'event', 'planning');
  assert.deepEqual(receivedWhere, { tenantId: 'tenant-a', type: 'event', status: 'planning' });
});

test('event-management task updates reject ids from another tenant', async () => {
  const service = new EventManagementService({
    eventManagementTask: {
      findFirst: async () => null,
      update: async () => assert.fail('cross-tenant update must not reach update'),
    },
  });

  await assert.rejects(
    () => service.updateTask('tenant-a', 'task-from-tenant-b', { status: 'done' }),
    NotFoundException,
  );
});
