const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeNewsroomDashboardStats,
  isNewsInProcessing,
  isNewsReadyForAction,
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

test('ready without persian summary counts as processing not action', () => {
  const article = { status: 'ready', titleFa: '', summaryFa: '' };
  assert.equal(isNewsInProcessing(article), true);
  assert.equal(isNewsReadyForAction(article), false);
});
