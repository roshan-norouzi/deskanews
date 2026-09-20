require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { DestinationCategoryService } = require('../dist/modules/smart-publishing/destination-category.service');

function createPrismaMock() {
  const categories = new Map();
  const articles = new Map();
  let categorySeq = 0;

  const prisma = {
    destinationCategory: {
      upsert: async ({ where, create, update }) => {
        const key = `${where.tenantId_platform_externalId.tenantId}:${where.tenantId_platform_externalId.platform}:${where.tenantId_platform_externalId.externalId}`;
        const existing = categories.get(key);
        if (existing) {
          const next = { ...existing, ...update };
          categories.set(key, next);
          return next;
        }
        const row = { id: `cat-${++categorySeq}`, ...create };
        categories.set(key, row);
        return row;
      },
      findUnique: async ({ where }) => {
        const key = `${where.tenantId_platform_externalId.tenantId}:${where.tenantId_platform_externalId.platform}:${where.tenantId_platform_externalId.externalId}`;
        return categories.get(key) || null;
      },
      findFirst: async ({ where }) => {
        for (const row of categories.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.tenantId && row.tenantId !== where.tenantId) continue;
          if (where.platform && row.platform !== where.platform) continue;
          if (where.externalId && row.externalId !== where.externalId) continue;
          if (where.status && row.status !== where.status) continue;
          return row;
        }
        return null;
      },
      findMany: async ({ where }) => {
        return [...categories.values()].filter((row) => {
          if (where.tenantId && row.tenantId !== where.tenantId) return false;
          if (where.platform && row.platform !== where.platform) return false;
          if (where.status?.not && row.status === where.status.not) return false;
          if (typeof where.status === 'string' && row.status !== where.status) return false;
          if (where.isGeneral === false && row.isGeneral) return false;
          if (where.externalId?.notIn && where.externalId.notIn.includes(row.externalId)) return false;
          if (where.id?.in && !where.id.in.includes(row.id)) return false;
          return true;
        });
      },
      create: async ({ data }) => {
        const row = { id: `cat-${++categorySeq}`, ...data };
        const key = `${row.tenantId}:${row.platform}:${row.externalId}`;
        categories.set(key, row);
        return row;
      },
      update: async ({ where, data }) => {
        for (const [key, row] of categories.entries()) {
          if (row.id === where.id) {
            const next = { ...row, ...data };
            categories.set(key, next);
            return next;
          }
        }
        throw new Error('category not found');
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const [key, row] of categories.entries()) {
          if (where.tenantId && row.tenantId !== where.tenantId) continue;
          if (where.platform && row.platform !== where.platform) continue;
          if (where.isGeneral === false && row.isGeneral) continue;
          if (where.externalId?.notIn && where.externalId.notIn.includes(row.externalId)) continue;
          if (where.status?.not && row.status === where.status.not) continue;
          if (where.id?.in && !where.id.in.includes(row.id)) continue;
          categories.set(key, { ...row, ...data });
          count++;
        }
        return { count };
      },
      delete: async ({ where }) => {
        for (const [key, row] of categories.entries()) {
          if (row.id === where.id) {
            categories.delete(key);
            return row;
          }
        }
        throw new Error('category not found');
      },
    },
    newsArticle: {
      findFirst: async ({ where }) => articles.get(where.id) || null,
      findMany: async ({ where }) => [...articles.values()].filter((row) => {
        if (where.tenantId && row.tenantId !== where.tenantId) return false;
        if (where.canonicalUrl?.in && !where.canonicalUrl.in.includes(row.canonicalUrl)) return false;
        if (where.destinationCategoryId === null && row.destinationCategoryId !== null) return false;
        return true;
      }),
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const [id, row] of articles.entries()) {
          if (where.tenantId && row.tenantId !== where.tenantId) continue;
          if (where.destinationCategoryId && row.destinationCategoryId !== where.destinationCategoryId) continue;
          articles.set(id, { ...row, ...data });
          count++;
        }
        return { count };
      },
      update: async ({ where, data, include }) => {
        const row = { ...articles.get(where.id), ...data };
        articles.set(where.id, row);
        if (include?.destinationCategory) {
          const category = [...categories.values()].find((item) => item.id === row.destinationCategoryId);
          row.destinationCategory = category
            ? { id: category.id, name: category.name, isGeneral: category.isGeneral }
            : null;
        }
        return row;
      },
    },
  };

  return { prisma, categories, articles };
}

function createService(prisma, settings, wordpress, gapGpt = {}, sourceReader = { safeRequest: async () => ({ ok: false }) }) {
  return new DestinationCategoryService(prisma, settings, wordpress, sourceReader, gapGpt);
}

test('destination category sync requires site url', async () => {
  const { prisma } = createPrismaMock();
  const settings = { getRaw: async () => ({ destination_platform: 'wordpress', wp_site_url: '' }) };
  const wordpress = { categoriesPublic: async () => [] };
  const service = createService(prisma, settings, wordpress);

  await assert.rejects(
    () => service.syncFromDestination('tenant-a'),
    (error) => error instanceof BadRequestException && /آدرس سایت/.test(error.message),
  );
});

test('destination category sync upserts WordPress categories as pending and keeps general approved', async () => {
  const { prisma, categories } = createPrismaMock();
  const settings = { getRaw: async () => ({ destination_platform: 'wordpress', wp_site_url: 'https://news.example.com' }) };
  const wordpress = {
    categoriesPublic: async () => [
      { id: 11, name: 'اقتصاد', slug: 'economy', parent: 0 },
      { id: 22, name: 'فناوری', slug: 'technology', parent: 0 },
      { id: 33, name: 'زیردسته', slug: 'sub-tech', parent: 22 },
    ],
  };
  const service = createService(prisma, settings, wordpress);

  const result = await service.syncFromDestination('tenant-a', 'user-a');

  assert.equal(result.synced, 2);
  const rows = [...categories.values()];
  assert.equal(rows.length, 3);
  assert.ok(rows.some((row) => row.isGeneral && row.status === 'approved' && row.name === 'عمومی'));
  assert.deepEqual(
    rows.filter((row) => !row.isGeneral).map((row) => row.status),
    ['pending', 'pending'],
  );
  assert.equal(result.changes.added.length, 2);
});

test('destination category sync reports removed and updated categories', async () => {
  const { prisma, categories } = createPrismaMock();
  const settings = { getRaw: async () => ({ destination_platform: 'wordpress', wp_site_url: 'https://news.example.com' }) };
  let syncCall = 0;
  const wordpress = {
    categoriesPublic: async () => {
      syncCall += 1;
      if (syncCall === 1) {
        return [
          { id: 11, name: 'اقتصاد', slug: 'economy', parent: 0 },
          { id: 22, name: 'فناوری', slug: 'technology', parent: 0 },
        ];
      }
      return [{ id: 22, name: 'فناوری جدید', slug: 'technology', parent: 0 }];
    },
  };
  const service = createService(prisma, settings, wordpress);

  await service.syncFromDestination('tenant-a');
  const tech = [...categories.values()].find((row) => row.externalId === '22');
  const economy = [...categories.values()].find((row) => row.externalId === '11');
  await service.updateStatus(tech.id, 'tenant-a', 'approved', 'user-a');
  await service.updateStatus(economy.id, 'tenant-a', 'approved', 'user-a');

  const result = await service.syncFromDestination('tenant-a');

  assert.equal([...categories.values()].find((row) => row.externalId === '11')?.status, 'stale');
  assert.equal([...categories.values()].find((row) => row.externalId === '22')?.status, 'pending');
  assert.equal(result.changes.removed.length, 1);
  assert.equal(result.changes.updated.length, 1);
  assert.equal(result.changes.added.length, 0);
});

test('destination category sync extracts IranSystem categories from site html', async () => {
  const { prisma, categories } = createPrismaMock();
  const settings = { getRaw: async () => ({ destination_platform: 'iransamaneh', is_site_url: 'https://news.example.ir' }) };
  const wordpress = { categoriesPublic: async () => [] };
  const sourceReader = {
    safeRequest: async (url) => ({
      ok: true,
      text: async () => {
        if (String(url).includes('/fa/rss')) {
          return `
            <div class="rss_block">
              <div class="rss_row"><div class="rss_list_pn">اقتصاد:</div><a href="/fa/rss/10" class="rss_list_link">https://news.example.ir/fa/rss/10</a></div>
              <div class="rss_row"><div class="rss_list_pn">فناوری:</div><a href="/fa/rss/16" class="rss_list_link">https://news.example.ir/fa/rss/16</a></div>
            </div>
          `;
        }
        return `
          <div class="header_services">
            <a class="nav_link" href="/fa/economic"><span>اقتصاد</span></a>
            <a class="nav_link" href="/fa/science-tech-ai"><span>فناوری</span></a>
            <a href="/fa/news/2391634/article">خبر</a>
          </div>
        `;
      },
    }),
  };
  const service = createService(prisma, settings, wordpress, {}, sourceReader);

  const result = await service.syncFromDestination('tenant-a');

  assert.equal(result.synced, 2);
  const rows = [...categories.values()].filter((row) => row.platform === 'iransamaneh' && !row.isGeneral);
  assert.deepEqual(rows.map((row) => row.name).sort(), ['اقتصاد', 'فناوری']);
  assert.ok(rows.every((row) => row.serviceUrl.includes('/fa/')));
  assert.ok(rows.every((row) => row.rssUrl.includes('/fa/rss/')));
});

test('destination category reject deletes the row', async () => {
  const { prisma, categories } = createPrismaMock();
  const settings = { getRaw: async () => ({ destination_platform: 'wordpress', wp_site_url: 'https://news.example.com' }) };
  const wordpress = { categoriesPublic: async () => [{ id: 22, name: 'فناوری', slug: 'technology', parent: 0 }] };
  const service = createService(prisma, settings, wordpress);
  await service.syncFromDestination('tenant-a');
  const pending = [...categories.values()].find((row) => row.externalId === '22');

  const rejected = await service.updateStatus(pending.id, 'tenant-a', 'rejected');

  assert.equal(rejected.deleted, true);
  assert.equal([...categories.values()].some((row) => row.id === pending.id), false);
});

test('destination category approve updates status and approver metadata', async () => {
  const { prisma, categories } = createPrismaMock();
  const settings = { getRaw: async () => ({ destination_platform: 'wordpress', wp_site_url: 'https://news.example.com' }) };
  const wordpress = { categoriesPublic: async () => [{ id: 22, name: 'فناوری', slug: 'technology', parent: 0 }] };
  const service = createService(prisma, settings, wordpress);
  await service.syncFromDestination('tenant-a');
  const pending = [...categories.values()].find((row) => row.externalId === '22');

  const approved = await service.updateStatus(pending.id, 'tenant-a', 'approved', 'user-b');

  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvedByUserId, 'user-b');
  assert.ok(approved.approvedAt instanceof Date);
});

test('article categorization falls back to general when AI selection fails', async () => {
  const { prisma, categories, articles } = createPrismaMock();
  const settings = { getRaw: async () => ({ destination_platform: 'wordpress', wp_site_url: 'https://news.example.com' }) };
  const wordpress = { categoriesPublic: async () => [{ id: 22, name: 'فناوری', slug: 'technology', parent: 0 }] };
  const gapGpt = {
    chooseWordPressCategory: async () => { throw new Error('ai unavailable'); },
  };
  const service = createService(prisma, settings, wordpress, gapGpt);
  await service.syncFromDestination('tenant-a');
  const approved = [...categories.values()].find((row) => row.externalId === '22');
  await service.updateStatus(approved.id, 'tenant-a', 'approved', 'user-a');

  articles.set('news-a', {
    id: 'news-a',
    tenantId: 'tenant-a',
    sourceName: 'رسانه',
    originalTitle: 'عنوان',
    originalSummary: 'خلاصه',
    titleFa: '',
    summaryFa: '',
    categorySource: '',
    destinationCategoryId: null,
    canonicalUrl: 'https://source.example/a',
  });

  const updated = await service.categorizeArticle('tenant-a', 'news-a');
  const general = [...categories.values()].find((row) => row.isGeneral);

  assert.equal(updated.destinationCategoryId, general.id);
  assert.equal(updated.categorySource, 'general');
});
