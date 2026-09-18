require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { BadRequestException } = require('@nestjs/common');
const { SourceReaderService } = require('../dist/modules/smart-publishing/source-reader.service');
const { SourceAdapterRegistry } = require('../dist/modules/smart-publishing/source-adapters/source-adapter.registry');
const {
  defaultRightsMode,
  effectiveReadTarget,
  normalizeFeedUrl,
  normalizeRightsMode,
  normalizeSourceType,
} = require('../dist/modules/smart-publishing/source-adapters/feed-source.utils');
const { parseAdapterConfig } = require('../dist/modules/smart-publishing/source-adapters/adapter-config');

const telegramFixture = readFileSync(join(__dirname, 'fixtures/telegram-channel.html'), 'utf8');
const sitemapFixture = readFileSync(join(__dirname, 'fixtures/news-sitemap.xml'), 'utf8');

function articleHtml(title) {
  return `<!doctype html><html><head><title>${title}</title><meta property="og:title" content="${title}" /><meta property="og:description" content="خلاصه ${title}" /><meta property="article:published_time" content="2026-09-18T08:00:00Z" /></head><body><article><h1>${title}</h1><p>متن کامل ${title} برای تست سایت‌مپ.</p></article></body></html>`;
}

test('feed source utils normalize source types and rights defaults', () => {
  assert.equal(normalizeSourceType('telegram'), 'telegram');
  assert.equal(normalizeSourceType('unknown'), 'rss');
  assert.equal(defaultRightsMode('rss'), 'quote_ok');
  assert.equal(defaultRightsMode('telegram'), 'rewrite_required');
  assert.equal(normalizeRightsMode(undefined, 'website'), 'rewrite_required');
  assert.equal(normalizeFeedUrl('@sample_channel', 'telegram'), 'https://t.me/sample_channel');
  assert.equal(normalizeFeedUrl('t.me/Sample_Channel', 'telegram'), 'https://t.me/sample_channel');
  assert.deepEqual(parseAdapterConfig({ maxItems: 12, sitemapUrl: 'https://example.com/sitemap.xml' }), {
    maxItems: 12,
    sitemapUrl: 'https://example.com/sitemap.xml',
  });
  assert.deepEqual(effectiveReadTarget({
    sourceType: 'website',
    url: 'https://publisher.example',
    resolvedFeedUrl: 'https://publisher.example/rss.xml',
    adapterConfig: {},
  }), {
    sourceType: 'rss',
    url: 'https://publisher.example/rss.xml',
    adapterConfig: {},
    telegramBridgeUrl: '',
  });
});

test('SourceAdapterRegistry reads telegram fixture through worker bridge', async () => {
  const reader = new SourceReaderService();
  reader.fetchTelegramChannelHtml = async (channelUrl, bridgeUrl) => {
    assert.equal(bridgeUrl, 'https://bridge.example');
    assert.match(channelUrl, /t\.me\/s\/sample/u);
    return telegramFixture;
  };
  const registry = new SourceAdapterRegistry(reader);
  const entries = await registry.readEntries({
    sourceType: 'telegram',
    url: 'https://t.me/sample',
    adapterConfig: { maxItems: 10 },
    telegramBridgeUrl: 'https://bridge.example',
  });
  assert.equal(entries.length, 2);
  assert.match(entries[0].title, /خبر نمونه/u);
  assert.equal(entries[0].canonicalUrl, 'https://t.me/sample/101');
  assert.equal(entries[1].featuredImageUrl, 'https://cdn.example/photo.jpg');
});

test('telegram ingest without bridge returns Iran worker guidance', async () => {
  const reader = new SourceReaderService();
  await assert.rejects(
    () => reader.readTelegramChannel('https://t.me/sample', 10, ''),
    (error) => error instanceof BadRequestException && /Worker تلگرام/u.test(error.message),
  );
});

test('website adapter extracts Iranian news index pages', async () => {
  const isnaHome = readFileSync(join(__dirname, 'fixtures/isna-home.html'), 'utf8');
  const isnaArticle = readFileSync(join(__dirname, 'fixtures/isna-article.html'), 'utf8');
  const irnaHome = readFileSync(join(__dirname, 'fixtures/irna-home.html'), 'utf8');
  const irnaArticle = readFileSync(join(__dirname, 'fixtures/irna-article.html'), 'utf8');
  const reader = new SourceReaderService();
  reader.discoverFeedUrl = async () => null;
  reader.safeFetchText = async (url) => {
    if (url === 'https://www.isna.ir/') return isnaHome;
    if (url === 'https://www.isna.ir/news/14001234567/') return isnaArticle;
    if (url === 'https://www.irna.ir/') return irnaHome;
    if (url === 'https://www.irna.ir/News/1234567890123456/') return irnaArticle;
    throw new Error(`unexpected url ${url}`);
  };
  const registry = new SourceAdapterRegistry(reader);
  const isnaEntries = await registry.readEntries({ sourceType: 'website', url: 'https://www.isna.ir/', adapterConfig: {} });
  const irnaEntries = await registry.readEntries({ sourceType: 'website', url: 'https://www.irna.ir/', adapterConfig: {} });
  assert.equal(isnaEntries[0].title, 'تیتر خبر ایسنا در صفحه فهرست');
  assert.match(isnaEntries[0].content, /متن کامل خبر ایسنا/u);
  assert.equal(irnaEntries[0].title, 'تیتر خبر ایرنا در فهرست اخبار');
  assert.match(irnaEntries[0].content, /متن کامل خبر ایرنا/u);
});

test('SourceAdapterRegistry reads sitemap fixture and article pages', async () => {
  const reader = new SourceReaderService();
  reader.fetchSitemapXml = async (url) => {
    assert.equal(url, 'https://news.example/sitemap.xml');
    return sitemapFixture;
  };
  reader.readPagePreview = async (url) => {
    if (url.endsWith('article-one')) {
      return {
        canonicalUrl: url,
        guid: url,
        title: 'خبر اول',
        summary: 'خلاصه خبر اول',
        content: 'متن کامل خبر اول',
        contentIsFull: true,
        featuredImageUrl: '',
        authorImageUrl: '',
        author: '',
        category: '',
        publishedAt: new Date('2026-09-18T08:00:00Z'),
      };
    }
    return null;
  };
  const registry = new SourceAdapterRegistry(reader);
  const entries = await registry.readEntries({
    sourceType: 'sitemap',
    url: 'https://news.example/sitemap.xml',
    adapterConfig: { maxItems: 5 },
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'خبر اول');
});

test('SourceAdapterRegistry rejects unknown source types', async () => {
  const registry = new SourceAdapterRegistry(new SourceReaderService());
  await assert.rejects(
    () => registry.readEntries({ sourceType: 'twitter', url: 'https://x.com/news', adapterConfig: {} }),
    (error) => error instanceof BadRequestException,
  );
});

test('SourceReader readSource keeps rss and website compatibility', async () => {
  const reader = new SourceReaderService();
  reader.readFeed = async () => [{ canonicalUrl: 'https://feed.example/a', guid: 'a', title: 'A', summary: '', content: 'A', contentIsFull: false, featuredImageUrl: '', authorImageUrl: '', author: '', category: '', publishedAt: null }];
  reader.readWebsiteSource = async () => [{ canonicalUrl: 'https://site.example/a', guid: 'a', title: 'Site', summary: '', content: 'Site', contentIsFull: false, featuredImageUrl: '', authorImageUrl: '', author: '', category: '', publishedAt: null }];
  assert.equal((await reader.readSource('rss', 'https://feed.example/rss.xml'))[0].title, 'A');
  assert.equal((await reader.readSource('website', 'https://site.example'))[0].title, 'Site');
});
