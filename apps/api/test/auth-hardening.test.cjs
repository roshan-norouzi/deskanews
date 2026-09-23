const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { AuthService } = require('../dist/platform/auth/auth.service');
const { RedisThrottlerStorage } = require('../dist/common/redis/redis-throttler.storage');

test('an expired lock restarts the failed-login counter instead of relocking on the next miss', async () => {
  const state = { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - 1000) };
  const user = {
    id: 'user-a', email: 'user@example.com', role: 'user', isActive: true, status: 'active',
    passwordHash: await bcrypt.hash('correct-password', 4), ...state,
  };
  const tx = {
    user: {
      updateMany: async ({ data }) => { Object.assign(state, data); return { count: 1 }; },
      update: async ({ data }) => {
        if (data.failedLoginAttempts?.increment) state.failedLoginAttempts += 1;
        if (data.lockedUntil) state.lockedUntil = data.lockedUntil;
        return { failedLoginAttempts: state.failedLoginAttempts };
      },
    },
  };
  const service = new AuthService({
    user: { findUnique: async () => ({ ...user, ...state }) },
    $transaction: async (fn) => fn(tx),
  }, {}, {});

  await assert.rejects(() => service.login({ email: user.email, password: 'wrong' }));
  assert.equal(state.failedLoginAttempts, 1);
  assert.equal(state.lockedUntil, null);
});

test('unknown accounts still pay the bcrypt cost before login is refused', async () => {
  const service = new AuthService({ user: { findUnique: async () => null } }, {}, {});
  const original = bcrypt.compare;
  let compared = 0;
  bcrypt.compare = async (...args) => { compared += 1; return original(...args); };
  try {
    await assert.rejects(() => service.login({ email: 'nobody@example.com', password: 'x' }), /نادرست/u);
  } finally {
    bcrypt.compare = original;
  }
  assert.equal(compared, 1);
});

test('forgot-password never returns the reset token in the response', async () => {
  const service = new AuthService({
    user: { findUnique: async () => ({ id: 'u', email: 'u@example.com', isActive: true, status: 'active' }) },
    passwordResetToken: { deleteMany: () => ({}), create: () => ({}) },
    $transaction: async () => [],
  }, {}, { get: () => 'development' });
  const result = await service.forgotPassword({ email: 'u@example.com' });
  assert.equal('developmentToken' in result, false);
});

test('refresh no longer accepts unhashed legacy refresh tokens', async () => {
  const lookups = [];
  const service = new AuthService({
    refreshToken: { findUnique: async ({ where }) => { lookups.push(where.token); return null; } },
  }, {}, {});
  await assert.rejects(() => service.refresh({ refreshToken: '00000000-0000-4000-8000-000000000000' }));
  assert.equal(lookups.length, 1);
  assert.match(lookups[0], /^[a-f0-9]{64}$/u);
});

test('rate limiting falls back to process memory when Redis is not configured', async () => {
  const storage = new RedisThrottlerStorage({ redis: () => null });
  const first = await storage.increment('ip', 60_000, 1, 60_000, 'default');
  const second = await storage.increment('ip', 60_000, 1, 60_000, 'default');
  assert.equal(first.isBlocked, false);
  assert.equal(second.isBlocked, true);
});

test('rate limiting uses one atomic Redis script when Redis is available', async () => {
  const calls = [];
  const storage = new RedisThrottlerStorage({ redis: () => ({ eval: async (...args) => { calls.push(args); return [4, 59_000, 0]; } }) });
  const record = await storage.increment('ip', 60_000, 10, 60_000, 'default');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], 'deska:throttle:default:ip:hits');
  assert.deepEqual(record, { totalHits: 4, timeToExpire: 59, isBlocked: false, timeToBlockExpire: 0 });
});
