'use strict';

const assert = require('node:assert/strict');

// Mirror apps/web/src/lib/api-backend.ts (kept in sync manually — small surface).
function backendStatusWorthRetry(status) {
  return status === 502 || status === 503 || status === 504;
}

function backendFetchErrorIsRetryable(error) {
  if (error && error.name === 'TimeoutError') return false;
  if (error && error.name === 'AbortError') return false;
  return true;
}

assert.equal(backendStatusWorthRetry(503), true);
assert.equal(backendStatusWorthRetry(500), false);
assert.equal(backendFetchErrorIsRetryable({ name: 'TimeoutError' }), false);
assert.equal(backendFetchErrorIsRetryable(new Error('ECONNREFUSED')), true);

console.log('api-backend-retry.test.cjs OK');
