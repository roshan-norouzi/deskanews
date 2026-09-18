require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConflictException, NotFoundException } = require('@nestjs/common');
const { PlatformFeedService } = require('../dist/modules/smart-publishing/platform-feed.service');

function createMockStore() {
  const feeds = new Map();
  const subscriptions = [];
  const articles = [];
  let feedSeq = 0;

  const prisma = {
    platformFeed: {
      findMany: async () => [...feeds.values()].sort((a, b) => b.createdAt - a.createdAt),
      findUnique: async ({ where }) => {
        if (where.id) return feeds.get(where.id) || null;
        if (where.url) return [...feeds.values()].find((feed) => feed.url === where.url) || null;
        return null;
      },
      findFirst: async ({ where, NOT }) => {
        for (const feed of feeds.values()) {
          if (where.url && feed.url !== where.url) continue;
          if (NOT?.id && feed.id === NOT.id) continue;
          return feed;
        }
        return null;
      },
      create: async ({ data }) => {
        const feed = {
          id: `feed-${++feedSeq}`,
          resolvedFeedUrl: data.resolvedFeedUrl ?? '',
          rightsMode: data.rightsMode ?? 'quote_ok',
          adapterConfig: data.adapterConfig ?? {},
          includeWords: data.includeWords ?? [],
          excludeWords: data.excludeWords ?? [],
          pollIntervalMinutes: data.pollIntervalMinutes ?? 240,
          enabled: data.enabled ?? true,
          lastFetchedAt: null,
          lastError: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        feeds.set(feed.id, feed);
        return feed;
      },
      update: async ({ where, data }) => {
        const feed = feeds.get(where.id);
        if (!feed) throw new Error('missing feed');
        Object.assign(feed, data, { updatedAt: new Date() });
        return feed;
      },
      delete: async ({ where }) => {
        feeds.delete(where.id);
      },
    },
    newsFeed: {
      findFirst: async () => null,
    },
    tenant: {
      findMany: async () => [{ id: 'tenant-a' }, { id: 'tenant-b' }],
    },
    tenantPlatformFeed: {
      createMany: async ({ data }) => {
        subscriptions.push(...data);
        return { count: data.length };
      },
      count: async ({ where }) => subscriptions.filter((row) => {
        if (where.platformFeedId && row.platformFeedId !== where.platformFeedId) return false;
        if (where.enabled === true && !row.enabled) return false;
        return true;
      }).length,
    },
    platformFeedArticle: {
      count: async ({ where }) => articles.filter((row) => row.platformFeedId === where.platformFeedId).length,
    },
  };

  return { prisma, feeds, subscriptions, articles };
}

function buildService(store) {
  const sourceReader = {
    discoverFeedUrl: async (url) => `${url.replace(/\/$/, '')}/rss.xml`,
  };
  return new PlatformFeedService(
    store.prisma,
    sourceReader,
    {},
    {},
    { getRaw: async () => ({}) },
    { record: async () => {} },
  );
}

test('PlatformFeedService creates feed with source types and tenant subscriptions', async () => {
  const store = createMockStore();
  const service = buildService(store);

  const feed = await service.create({
    name: 'کانال نمونه',
    url: '@sample_channel',
    sourceType: 'telegram',
    rightsMode: 'rewrite_required',
    adapterConfig: { maxItems: 25 },
    includeWords: 'فناوری، اقتصاد',
    pollIntervalMinutes: 120,
    enabled: true,
  });

  assert.equal(feed.url, 'https://t.me/sample_channel');
  assert.equal(feed.sourceType, 'telegram');
  assert.equal(feed.rightsMode, 'rewrite_required');
  assert.equal(feed.adapterConfig.maxItems, 25);
  assert.deepEqual(feed.includeWords, ['فناوری', 'اقتصاد']);
  assert.equal(store.subscriptions.length, 2);
  assert.equal(store.subscriptions.every((row) => row.enabled === false), true);
});

test('PlatformFeedService rejects duplicate platform feed URLs', async () => {
  const store = createMockStore();
  const service = buildService(store);
  await service.create({ name: 'منبع اول', url: 'https://news.example/rss.xml', sourceType: 'rss' });

  await assert.rejects(
    () => service.create({ name: 'منبع دوم', url: 'https://news.example/rss.xml', sourceType: 'rss' }),
    (error) => error instanceof ConflictException && /قبلاً ثبت شده/u.test(error.message),
  );
});

test('PlatformFeedService updates feed fields and resolves website RSS', async () => {
  const store = createMockStore();
  const service = buildService(store);
  const created = await service.create({
    name: 'خبرگزاری نمونه',
    url: 'https://publisher.example',
    sourceType: 'website',
  });

  const updated = await service.update(created.id, {
    name: 'خبرگزاری ویرایش‌شده',
    url: 'https://publisher.example/news',
    sourceType: 'website',
    rightsMode: 'monitor_only',
    pollIntervalMinutes: 60,
    enabled: false,
  });

  assert.equal(updated.name, 'خبرگزاری ویرایش‌شده');
  assert.equal(updated.url, 'https://publisher.example/news');
  assert.equal(updated.resolvedFeedUrl, 'https://publisher.example/news/rss.xml');
  assert.equal(updated.rightsMode, 'monitor_only');
  assert.equal(updated.pollIntervalMinutes, 60);
  assert.equal(updated.enabled, false);
});

test('PlatformFeedService deletes feed and reports subscription impact', async () => {
  const store = createMockStore();
  const service = buildService(store);
  const feed = await service.create({ name: 'منبع حذف‌شونده', url: 'https://delete.example/rss', sourceType: 'rss' });
  for (const row of store.subscriptions) {
    if (row.platformFeedId === feed.id && row.tenantId === 'tenant-a') row.enabled = true;
  }
  store.articles.push({ platformFeedId: feed.id }, { platformFeedId: feed.id });

  const result = await service.delete(feed.id);

  assert.equal(result.ok, true);
  assert.equal(result.removed.subscriptions, 2);
  assert.equal(result.removed.enabledSubscriptions, 1);
  assert.equal(result.removed.sharedArticles, 2);
  assert.match(result.message, /منبع «منبع حذف‌شونده» حذف شد/u);
  assert.equal(store.feeds.has(feed.id), false);
});

test('PlatformFeedService delete throws when feed is missing', async () => {
  const store = createMockStore();
  const service = buildService(store);

  await assert.rejects(
    () => service.delete('missing-id'),
    NotFoundException,
  );
});
