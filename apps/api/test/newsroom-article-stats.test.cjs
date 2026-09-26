const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeNewsroomDashboardStats,
  isNewsInProcessing,
  isNewsReadyForAction,
  newsroomArticleWhere,
  newsroomListViewWhere,
  newsroomStatsFromCounts,
} = require('../dist/modules/smart-publishing/newsroom-article-stats');

test('newsroom stats ignore archived items and match newsroom filters', () => {
  const stats = computeNewsroomDashboardStats([
    { status: 'new', titleFa: '', summaryFa: '', publishedAt: null },
    { status: 'ready', titleFa: 'تیتر', summaryFa: 'خلاصه', publishedAt: null },
    { status: 'ready', titleFa: '', summaryFa: '', publishedAt: null },
    { status: 'published', titleFa: 'تیتر', summaryFa: 'خلاصه', publishedAt: new Date() },
  ], 1);

  assert.equal(stats.processing, 2);
  assert.equal(stats.action, 1);
  assert.equal(stats.archive, 1);
  assert.equal(stats.total, 4);
});

test('dashboard counts match the in-memory newsroom stats', () => {
  const articles = [
    { status: 'new', titleFa: '', summaryFa: '', publishedAt: null },
    { status: 'ready', titleFa: 'تیتر', summaryFa: 'خلاصه', publishedAt: null },
    { status: 'ready', titleFa: '', summaryFa: 'خلاصه', publishedAt: null },
    { status: 'publishing', titleFa: 'تیتر', summaryFa: 'خلاصه', publishedAt: null },
    { status: 'publish_failed', titleFa: 'تیتر', summaryFa: 'خلاصه', publishedAt: null },
    { status: 'failed', titleFa: '', summaryFa: '', publishedAt: null },
    { status: 'published', titleFa: 'تیتر', summaryFa: 'خلاصه', publishedAt: null },
    { status: 'rejected', titleFa: '', summaryFa: '', publishedAt: null },
  ];
  const fromRows = computeNewsroomDashboardStats(articles, 3);
  const fromCounts = newsroomStatsFromCounts({
    total: articles.length,
    rejected: 1,
    archive: 1,
    preparing: 1,
    statusFailed: 1,
    terminalFailed: 1,
    readyPrepared: 1,
    readyUnprepared: 1,
    inbox: 2,
    publishedToday: 3,
  });
  assert.deepEqual(fromCounts, fromRows);
});

test('newsroomArticleWhere includes catalog-synced articles without tenant feed', () => {
  const where = newsroomArticleWhere('tenant-1');
  assert.equal(where.tenantId, 'tenant-1');
  assert.ok(Array.isArray(where.OR));
  assert.ok(where.OR.some((clause) => clause.platformFeedArticleId?.not === null));
});

test('ready without persian summary counts as processing not action', () => {
  const article = { status: 'ready', titleFa: '', summaryFa: '' };
  assert.equal(isNewsInProcessing(article), true);
  assert.equal(isNewsReadyForAction(article), false);
});

test('newsroom list view filters align with dashboard buckets', () => {
  assert.deepEqual(newsroomListViewWhere('archive'), { status: { in: ['published', 'social_sent'] } });
  assert.deepEqual(newsroomListViewWhere('rejected'), { status: 'rejected' });
});
