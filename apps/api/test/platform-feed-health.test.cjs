require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_CATALOG_HEALTH_INTERVAL_HOURS,
  PLATFORM_FEED_HEALTH_DOWN_MS,
  evaluatePlatformFeedHealth,
  normalizeCatalogHealthIntervalHours,
  orderCatalogHealthCheckFeeds,
  parseCatalogHealthEnabled,
} = require('../dist/modules/smart-publishing/platform-feed-health');

test('evaluatePlatformFeedHealth marks five items as healthy', () => {
  const result = evaluatePlatformFeedHealth({ itemCount: 5, totalEntries: 20, previousFailSince: new Date('2026-01-01') });
  assert.equal(result.status, 'healthy');
  assert.equal(result.failSince, null);
});

test('evaluatePlatformFeedHealth accepts small feeds with fewer entries', () => {
  const result = evaluatePlatformFeedHealth({ itemCount: 2, totalEntries: 2, previousFailSince: null });
  assert.equal(result.status, 'healthy');
});

test('evaluatePlatformFeedHealth marks fresh failures as degraded', () => {
  const now = new Date('2026-09-21T00:00:00.000Z');
  const result = evaluatePlatformFeedHealth({
    itemCount: 0,
    totalEntries: 0,
    previousFailSince: new Date(now.getTime() - 60 * 60 * 1000),
    failed: true,
    errorMessage: 'timeout',
    now,
  });
  assert.equal(result.status, 'degraded');
});

test('evaluatePlatformFeedHealth marks long failures as down', () => {
  const now = new Date('2026-09-21T00:00:00.000Z');
  const result = evaluatePlatformFeedHealth({
    itemCount: 0,
    totalEntries: 0,
    previousFailSince: new Date(now.getTime() - PLATFORM_FEED_HEALTH_DOWN_MS - 1000),
    failed: true,
    now,
  });
  assert.equal(result.status, 'down');
});

test('normalizeCatalogHealthIntervalHours clamps values', () => {
  assert.equal(normalizeCatalogHealthIntervalHours('0'), 1);
  assert.equal(normalizeCatalogHealthIntervalHours('999'), 168);
  assert.equal(normalizeCatalogHealthIntervalHours(undefined), DEFAULT_CATALOG_HEALTH_INTERVAL_HOURS);
});

test('parseCatalogHealthEnabled reads boolean-like values', () => {
  assert.equal(parseCatalogHealthEnabled('false'), false);
  assert.equal(parseCatalogHealthEnabled('true'), true);
  assert.equal(parseCatalogHealthEnabled(undefined), true);
});

test('orderCatalogHealthCheckFeeds checks untested sources before retests', () => {
  const ordered = orderCatalogHealthCheckFeeds([
    {
      id: 'old',
      name: 'ب',
      catalogGroup: 'media-domestic',
      healthCheckedAt: new Date('2026-09-20T10:00:00Z'),
      healthStatus: 'healthy',
    },
    {
      id: 'new',
      name: 'الف',
      catalogGroup: 'media-domestic',
      healthCheckedAt: null,
      healthStatus: 'unknown',
    },
    {
      id: 'older',
      name: 'ج',
      catalogGroup: 'media-domestic',
      healthCheckedAt: new Date('2026-09-19T10:00:00Z'),
      healthStatus: 'degraded',
    },
  ]);

  assert.deepEqual(
    ordered.map((feed) => feed.id),
    ['new', 'older', 'old'],
  );
});

test('catalog health concurrency constant is positive', () => {
  const { CATALOG_HEALTH_CHECK_CONCURRENCY } = require('../dist/modules/smart-publishing/platform-feed-health');
  assert.ok(CATALOG_HEALTH_CHECK_CONCURRENCY >= 1);
});
