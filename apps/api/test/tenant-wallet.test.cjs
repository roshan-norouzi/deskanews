const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTokenTopUpPackage, TOKEN_TOP_UP_PACKAGES } = require('@deska/shared');
const { BillingService } = require('../dist/common/services/billing.service');

test('token top-up packages resolve only by server-defined id', () => {
  const pack = resolveTokenTopUpPackage('tokens-5000');
  assert.equal(pack?.tokenAmount, 5000);
  assert.equal(resolveTokenTopUpPackage('custom-hack'), undefined);
  assert.equal(TOKEN_TOP_UP_PACKAGES.length, 3);
});

test('createPaymentForPackage rejects unknown package id', async () => {
  const billing = new BillingService({
    paymentIntent: { create: async () => ({ id: 'pay-1' }) },
  });
  await assert.rejects(async () => {
    await billing.createPaymentForPackage('tenant-1', 'not-a-package');
  });
});

test('createPaymentForPackage uses bundle price from shared catalog', async () => {
  let captured;
  const billing = new BillingService({
    paymentIntent: {
      create: async (args) => {
        captured = args.data;
        return { id: 'pay-2', ...args.data };
      },
    },
  });
  const pack = resolveTokenTopUpPackage('tokens-1000');
  const payment = await billing.createPaymentForPackage('tenant-1', 'tokens-1000');
  assert.equal(captured.tenantId, 'tenant-1');
  assert.equal(captured.amountRials, pack.amountRials);
  assert.equal(captured.tokenAmount, pack.tokenAmount);
  assert.equal(payment.tokenAmount, 1000);
});
