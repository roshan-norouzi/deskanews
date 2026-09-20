const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeSourceIconDomain } = require('../dist/modules/smart-publishing/source-icon.service');

test('sanitizeSourceIconDomain accepts news hostnames', () => {
  assert.equal(sanitizeSourceIconDomain('isna.ir'), 'isna.ir');
  assert.equal(sanitizeSourceIconDomain('www.MehrNews.com'), 'mehrnews.com');
  assert.equal(sanitizeSourceIconDomain('bbc.co.uk'), 'bbc.co.uk');
});

test('sanitizeSourceIconDomain rejects unsafe values', () => {
  assert.equal(sanitizeSourceIconDomain('../etc/passwd'), '');
  assert.equal(sanitizeSourceIconDomain('localhost'), '');
  assert.equal(sanitizeSourceIconDomain(''), '');
  assert.equal(sanitizeSourceIconDomain('http://isna.ir'), '');
});
