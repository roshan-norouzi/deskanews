require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { PlatformFeedService } = require('../dist/modules/smart-publishing/platform-feed.service');

function createService(feeds, checkDelayMs = 50) {
  const prisma = {
    platformFeed: {
      findMany: async () => feeds,
      update: async ({ data }) => ({ ...data }),
    },
  };
  const sourceReader = {
    readSourceWithMeta: async () => {
      await new Promise((resolve) => setTimeout(resolve, checkDelayMs));
      return { entries: [{ title: 'خبر', summary: 'خلاصه' }], resolvedFeedUrl: '' };
    },
  };
  const settings = {
    markCatalogHealthLastRun: async () => {},
  };

  return new PlatformFeedService(
    prisma,
    sourceReader,
    {},
    settings,
    {},
    { categorizeArticlesByCanonicalUrls: async () => {} },
  );
}

test('startCatalogHealthChecksManual returns immediately and finishes in background', async () => {
  const feeds = Array.from({ length: 6 }, (_, index) => ({
    id: `feed-${index}`,
    name: `Feed ${index}`,
    url: `https://example.com/${index}`,
    sourceType: 'rss',
    resolvedFeedUrl: '',
    sourceLanguage: 'auto',
    healthFailSince: null,
  }));
  const service = createService(feeds, 80);

  const started = Date.now();
  const result = await service.startCatalogHealthChecksManual();
  const elapsedMs = Date.now() - started;

  assert.equal(result.started, true);
  assert.equal(result.running, true);
  assert.equal(result.total, 6);
  assert.ok(elapsedMs < 500, `expected fast response, got ${elapsedMs}ms`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = service.getCatalogHealthRunStatus();
    if (!status.running) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const finished = service.getCatalogHealthRunStatus();
  assert.equal(finished.running, false);
  assert.equal(finished.checked, 6);
  assert.equal(finished.total, 6);
  assert.equal(finished.healthy, 6);
});
