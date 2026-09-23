const test = require('node:test');
const assert = require('node:assert/strict');
const { paymentSignature, paymentSignatureMatches } = require('../dist/platform/payments/payment-signature');

test('payment webhook signature accepts only the exact payment id', () => {
  const secret = 'webhook-secret';
  const signature = paymentSignature(secret, 'pay-1');
  assert.equal(paymentSignatureMatches(secret, 'pay-1', signature), true);
  assert.equal(paymentSignatureMatches(secret, 'pay-2', signature), false);
  assert.equal(paymentSignatureMatches('', 'pay-1', signature), false);
});
