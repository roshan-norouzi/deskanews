const test = require('node:test');
const assert = require('node:assert/strict');
const { BillingService } = require('../dist/common/services/billing.service');

function memoryPrisma() {
  const wallets = new Map();
  const ledger = [];
  const tx = {
    tenantWallet: {
      upsert: async ({ where, create }) => {
        if (!wallets.has(where.tenantId)) wallets.set(where.tenantId, { ...create, reservedTokens: 0, consumedTokens: 0, balanceTokens: 0 });
        return wallets.get(where.tenantId);
      },
      update: async ({ where, data }) => {
        const row = wallets.get(where.tenantId);
        if (data.reservedTokens?.increment) row.reservedTokens += data.reservedTokens.increment;
        if (data.reservedTokens?.decrement) row.reservedTokens -= data.reservedTokens.decrement;
        if (data.consumedTokens?.increment) row.consumedTokens += data.consumedTokens.increment;
        if (data.balanceTokens?.increment) row.balanceTokens += data.balanceTokens.increment;
        if (data.balanceTokens?.decrement) row.balanceTokens -= data.balanceTokens.decrement;
        return row;
      },
    },
    walletLedger: {
      findMany: async ({ where }) => ledger.filter((row) => row.jobId === where.jobId && (!where.tenantId || row.tenantId === where.tenantId)),
      create: async ({ data }) => {
        const row = { id: `led-${ledger.length + 1}`, createdAt: new Date(), ...data };
        ledger.push(row);
        return row;
      },
    },
  };
  return {
    wallets,
    ledger,
    $transaction: async (fn) => fn(tx),
  };
}

test('priced jobs reserve tokens and commit reduces the spendable balance', async () => {
  process.env.BILLING_ENFORCE = 'false';
  const prisma = memoryPrisma();
  const billing = new BillingService(prisma);

  const reservationId = await billing.shadowReserve({ id: 'job-1', tenantId: 'tenant-a', type: 'news.prepare' });
  const free = await billing.shadowReserve({ id: 'job-2', tenantId: 'tenant-a', type: 'news.feed.fetch' });
  await billing.commit('job-1', 'tenant-a');

  assert.equal(typeof reservationId, 'string');
  assert.equal(free, null);
  assert.equal(prisma.wallets.get('tenant-a').balanceTokens, -1);
  assert.equal(prisma.wallets.get('tenant-a').reservedTokens, 0);
  assert.equal(prisma.wallets.get('tenant-a').consumedTokens, 1);
  delete process.env.BILLING_ENFORCE;
});

test('enforcement refuses a priced job when the wallet cannot cover it', async () => {
  process.env.BILLING_ENFORCE = 'true';
  const prisma = memoryPrisma();
  const billing = new BillingService(prisma);

  await assert.rejects(
    () => billing.shadowReserve({ id: 'job-1', tenantId: 'tenant-a', type: 'social.cover' }),
    /توکن سازمان برای این کار کافی نیست/,
  );
  delete process.env.BILLING_ENFORCE;
});

test('an infrastructure failure never lets an enforced job run without a reserve', async () => {
  process.env.BILLING_ENFORCE = 'true';
  const billing = new BillingService({ $transaction: async () => { throw new Error('connection reset'); } });
  await assert.rejects(
    () => billing.shadowReserve({ id: 'job-1', tenantId: 'tenant-a', type: 'news.prepare' }),
    /رزرو توکن انجام نشد/,
  );
  process.env.BILLING_ENFORCE = 'false';
  assert.equal(await billing.shadowReserve({ id: 'job-1', tenantId: 'tenant-a', type: 'news.prepare' }), null);
  delete process.env.BILLING_ENFORCE;
});

test('wallet rows are locked before the balance is checked', async () => {
  process.env.BILLING_ENFORCE = 'false';
  const prisma = memoryPrisma();
  const order = [];
  const base = prisma.$transaction;
  prisma.$transaction = (fn) => base((tx) => {
    tx.$queryRaw = async (strings) => { order.push(strings.join('?').includes('FOR UPDATE') ? 'lock' : 'query'); return []; };
    tx.tenantWallet.findUnique = async ({ where }) => prisma.wallets.get(where.tenantId);
    const originalFindMany = tx.walletLedger.findMany;
    tx.walletLedger.findMany = async (args) => { order.push('read-ledger'); return originalFindMany(args); };
    return fn(tx);
  });
  const billing = new BillingService(prisma);
  await billing.shadowReserve({ id: 'job-1', tenantId: 'tenant-a', type: 'news.prepare' });
  assert.equal(order[0], 'lock');
  assert.ok(order.indexOf('lock') < order.indexOf('read-ledger'));
  delete process.env.BILLING_ENFORCE;
});

test('confirming a payment twice credits the wallet once', async () => {
  const payment = { id: 'pay-1', tenantId: 'tenant-a', tokenAmount: 500, status: 'pending' };
  const credits = [];
  const tx = {
    paymentIntent: {
      findUnique: async () => ({ ...payment }),
      updateMany: async ({ where }) => {
        if (payment.status === where.status.not) return { count: 0 };
        payment.status = 'paid';
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...payment }),
    },
    tenantWallet: {
      upsert: async () => ({}),
      findUnique: async () => ({}),
      update: async ({ data }) => { credits.push(data.balanceTokens.increment); return {}; },
    },
    walletLedger: {
      findUnique: async () => null,
      create: async () => ({}),
    },
  };
  const billing = new BillingService({ $transaction: async (fn) => fn(tx) });
  const [first, second] = await Promise.all([billing.confirmPayment('pay-1'), billing.confirmPayment('pay-1')]);
  assert.equal(first.status, 'paid');
  assert.equal(second.status, 'paid');
  assert.deepEqual(credits, [500]);
});

test('commit settles the hold and a later reserve can open again', async () => {
  process.env.BILLING_ENFORCE = 'false';
  const prisma = memoryPrisma();
  const billing = new BillingService(prisma);

  await billing.shadowReserve({ id: 'job-1', tenantId: 'tenant-a', type: 'social.cover' });
  await billing.commit('job-1', 'tenant-a');
  await billing.shadowReserve({ id: 'job-1', tenantId: 'tenant-a', type: 'social.cover' });

  const wallet = prisma.wallets.get('tenant-a');
  assert.equal(wallet.consumedTokens, 1);
  assert.equal(wallet.reservedTokens, 1);
  assert.equal(wallet.balanceTokens, -1);
  assert.equal(prisma.ledger.map((row) => row.entryType).join(','), 'reserve,commit,reserve');
  delete process.env.BILLING_ENFORCE;
});
