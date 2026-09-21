require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { PlatformFeedService } = require('../dist/modules/smart-publishing/platform-feed.service');

function createService() {
  const platformFeeds = new Map();
  const subscriptions = new Map();
  const newsFeeds = [{
    id: 'tenant-feed-1',
    tenantId: 'tenant-a',
    url: 'https://borna.news/fa/rss/allnews',
  }];

  const prisma = {
    platformFeed: {
      findUnique: async ({ where }) => [...platformFeeds.values()].find((row) => row.url === where.url) || null,
      create: async ({ data }) => {
        const row = { id: `pf-${platformFeeds.size + 1}`, ...data };
        platformFeeds.set(row.id, row);
        return row;
      },
    },
    newsFeed: {
      findFirst: async ({ where }) => newsFeeds.find((row) => row.url === where.url) || null,
    },
    tenantPlatformFeed: {
      findMany: async () => [],
      createMany: async () => ({ count: 0 }),
    },
    tenant: {
      findMany: async () => [],
    },
  };

  const sourceReader = {
    discoverFeedUrl: async () => '',
    resolveFeedProfilePhoto: async () => '',
  };

  const service = new PlatformFeedService(prisma, sourceReader, { rememberSourceLanguages: async () => [] }, {}, {}, {});
  return { service, platformFeeds, newsFeeds };
}

test('platform catalog create allows url already used as tenant feed', async () => {
  const { service, platformFeeds } = createService();

  const created = await service.create({
    name: 'برنا',
    url: 'https://borna.news/fa/rss/allnews',
    sourceType: 'rss',
    catalogGroup: 'media-domestic',
    sourceLanguage: 'fa',
  });

  assert.equal(created.url, 'https://borna.news/fa/rss/allnews');
  assert.equal(platformFeeds.size, 1);
});

test('platform catalog create still rejects duplicate platform feed url', async () => {
  const { service, platformFeeds } = createService();
  platformFeeds.set('existing', {
    id: 'existing',
    name: 'برنا',
    url: 'https://borna.news/fa/rss/allnews',
    sourceType: 'rss',
    catalogGroup: 'media-domestic',
    resolvedFeedUrl: '',
    sourceLanguage: 'fa',
    logoUrl: '',
    enabled: true,
    lastError: '',
  });

  await assert.rejects(
    () => service.create({
      name: 'برنا دوباره',
      url: 'https://borna.news/fa/rss/allnews',
      sourceType: 'rss',
    }),
    (error) => /پیش‌فرض قبلاً ثبت/.test(error.message),
  );
});
