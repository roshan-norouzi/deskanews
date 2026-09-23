const test = require('node:test');
const assert = require('node:assert/strict');
const { PaymentSettingsService } = require('../dist/platform/payments/payment-settings.service');

test('webhook secret prefers PAYMENT_WEBHOOK_SECRET environment variable', async () => {
  const previous = process.env.PAYMENT_WEBHOOK_SECRET;
  process.env.PAYMENT_WEBHOOK_SECRET = 'env-secret';
  const service = new PaymentSettingsService(
    { platformConfig: { findUnique: async () => ({ settings: { billing: { payment_webhook_secret: 'enc' } } }) } },
    { decrypt: () => 'db-secret', encrypt: (value) => `enc:${value}` },
  );
  assert.equal(await service.resolveWebhookSecret(), 'env-secret');
  if (previous === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
  else process.env.PAYMENT_WEBHOOK_SECRET = previous;
});
