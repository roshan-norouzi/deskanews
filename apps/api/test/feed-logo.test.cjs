const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveFeedLogoUrl,
  buildAutoFeedLogoUrl,
  buildTelegramProfilePhotoUrl,
  extractFeedDomain,
  resolveFeedSourceHref,
  usesFeedProfilePhoto,
} = require('@deska/shared');

test('extractFeedDomain strips www prefix', () => {
  assert.equal(extractFeedDomain('https://www.isna.ir/rss'), 'isna.ir');
});

test('buildAutoFeedLogoUrl uses the local source-icon proxy', () => {
  assert.equal(
    buildAutoFeedLogoUrl('https://isna.ir'),
    '/api/publishing/source-icons/isna.ir',
  );
});

test('resolveFeedLogoUrl prefers stored override', () => {
  assert.equal(
    resolveFeedLogoUrl('https://isna.ir', 'https://cdn.example/logo.png'),
    'https://cdn.example/logo.png',
  );
  assert.equal(resolveFeedLogoUrl('https://isna.ir', ''), '/api/publishing/source-icons/isna.ir');
});

test('resolveFeedLogoUrl uses telegram profile photo instead of favicon', () => {
  assert.equal(
    resolveFeedLogoUrl('https://t.me/VahidOnline', '', 'telegram'),
    'https://t.me/i/userpic/320/VahidOnline.jpg',
  );
  assert.equal(resolveFeedLogoUrl('https://t.me/VahidOnline', '', 'telegram'), buildTelegramProfilePhotoUrl('https://t.me/VahidOnline'));
});

test('resolveFeedLogoUrl skips favicon for twitter until profile photo is stored', () => {
  assert.equal(resolveFeedLogoUrl('https://x.com/Reuters', '', 'twitter'), '');
  assert.equal(
    resolveFeedLogoUrl('https://x.com/Reuters', 'https://pbs.twimg.com/profile_images/example.jpg', 'twitter'),
    'https://pbs.twimg.com/profile_images/example.jpg',
  );
});

test('resolveFeedSourceHref links to site origin or social profile', () => {
  assert.equal(resolveFeedSourceHref('https://www.isna.ir/rss/tp/1', 'rss'), 'https://www.isna.ir');
  assert.equal(resolveFeedSourceHref('https://t.me/VahidOnline', 'telegram'), 'https://t.me/VahidOnline');
  assert.equal(resolveFeedSourceHref('https://x.com/Reuters/status/1', 'twitter'), 'https://x.com/Reuters');
});

test('usesFeedProfilePhoto marks telegram and twitter', () => {
  assert.equal(usesFeedProfilePhoto('telegram'), true);
  assert.equal(usesFeedProfilePhoto('twitter'), true);
  assert.equal(usesFeedProfilePhoto('rss'), false);
});
