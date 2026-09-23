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
