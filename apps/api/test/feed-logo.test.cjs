const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveFeedLogoUrl, buildAutoFeedLogoUrl, extractFeedDomain } = require('@deska/shared');

test('extractFeedDomain strips www prefix', () => {
  assert.equal(extractFeedDomain('https://www.isna.ir/rss'), 'isna.ir');
});

test('buildAutoFeedLogoUrl uses Google favicon service', () => {
  assert.equal(
    buildAutoFeedLogoUrl('https://isna.ir'),
    'https://www.google.com/s2/favicons?domain=isna.ir&sz=128',
  );
});

test('resolveFeedLogoUrl prefers stored override', () => {
  assert.equal(
    resolveFeedLogoUrl('https://isna.ir', 'https://cdn.example/logo.png'),
    'https://cdn.example/logo.png',
  );
  assert.match(resolveFeedLogoUrl('https://isna.ir', ''), /isna\.ir/);
});
