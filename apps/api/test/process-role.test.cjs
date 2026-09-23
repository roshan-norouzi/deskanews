const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveProcessRole, workerHttpAllowed } = require('../dist/common/process-role');

test('process role defaults to all and only accepts api or worker', () => {
  assert.equal(resolveProcessRole(undefined), 'all');
  assert.equal(resolveProcessRole('api'), 'api');
  assert.equal(resolveProcessRole('WORKER'), 'worker');
  assert.equal(resolveProcessRole('both'), 'all');
});

test('worker HTTP allows health only', () => {
  assert.equal(workerHttpAllowed('worker', '/api/health/live'), true);
  assert.equal(workerHttpAllowed('worker', '/api/publishing/settings'), false);
  assert.equal(workerHttpAllowed('api', '/api/publishing/settings'), true);
  assert.equal(workerHttpAllowed('all', '/api/auth/login'), true);
});
