const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PLATFORM_POLL_MINUTES,
  resolveTenantFeedSettings,
  isAutoPollingSubscription,
  isSubscriptionDue,
  shouldRefreshSharedCatalog,
} = require('../dist/modules/smart-publishing/tenant-platform-feed-settings');

test('default org settings ignore leftover catalog words and use the system poll interval', () => {
  const resolved = resolveTenantFeedSettings({
    settingsMode: 'default',
    includeWords: ['نباید-اعمال-شود'],
    excludeWords: ['هم-این'],
    pollIntervalMinutes: 15,
  });
  assert.deepEqual(resolved.includeWords, []);
  assert.deepEqual(resolved.excludeWords, []);
  assert.equal(resolved.pollIntervalMinutes, DEFAULT_PLATFORM_POLL_MINUTES);
  assert.equal(resolved.settingsMode, 'default');
});

test('custom org settings keep that organization words and poll interval', () => {
  const resolved = resolveTenantFeedSettings({
    settingsMode: 'custom',
    includeWords: ['فناوری'],
    excludeWords: ['تبلیغات'],
    pollIntervalMinutes: 30,
  });
  assert.deepEqual(resolved.includeWords, ['فناوری']);
  assert.deepEqual(resolved.excludeWords, ['تبلیغات']);
  assert.equal(resolved.pollIntervalMinutes, 30);
});

test('custom org settings fall back to the system poll interval when missing', () => {
  const resolved = resolveTenantFeedSettings({ settingsMode: 'custom', includeWords: ['ایران'] });
  assert.equal(resolved.pollIntervalMinutes, DEFAULT_PLATFORM_POLL_MINUTES);
});

test('disabled or non-auto subscriptions are not polled', () => {
  assert.equal(isAutoPollingSubscription({ enabled: true, autoPoll: true }), true);
  assert.equal(isAutoPollingSubscription({ enabled: true, autoPoll: null }), true);
  assert.equal(isAutoPollingSubscription({ enabled: false, autoPoll: true }), false);
  assert.equal(isAutoPollingSubscription({ enabled: true, autoPoll: false }), false);
});

test('a subscription is due when it has never synced or its own interval elapsed', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  assert.equal(isSubscriptionDue(null, 240, now), true);
  assert.equal(isSubscriptionDue(new Date('2026-09-20T11:59:00Z'), 5, now), false);
  assert.equal(isSubscriptionDue(new Date('2026-09-20T11:50:00Z'), 5, now), true);
});

test('shared catalog refreshes at the most frequent due organization interval', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  assert.equal(shouldRefreshSharedCatalog(null, [240], now), true);
  assert.equal(shouldRefreshSharedCatalog(new Date('2026-09-20T11:50:00Z'), [30], now), false);
  assert.equal(shouldRefreshSharedCatalog(new Date('2026-09-20T11:50:00Z'), [5, 240], now), true);
  assert.equal(shouldRefreshSharedCatalog(new Date('2026-09-20T11:50:00Z'), [], now), false);
});
