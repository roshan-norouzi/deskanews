const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeBody, normalizeUrl } = require('../dist/modules/smart-publishing/source-reader.service');
const { reuseKnownGuids } = require('../dist/modules/smart-publishing/feed-dedupe');

test('decodeBody honours the charset of legacy Persian sources', () => {
  const salam = Buffer.from([0xd3, 0xe1, 0xc7, 0xe3]); // «سلام» in windows-1256
  assert.equal(decodeBody(salam, 'text/html; charset=windows-1256'), 'سلام');
  const xml = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="windows-1256"?><t>'), salam, Buffer.from('</t>')]);
  assert.match(decodeBody(xml, 'application/xml'), /سلام/u);
  assert.equal(decodeBody(Buffer.from('سلام', 'utf8'), 'text/html'), 'سلام');
  assert.equal(decodeBody(Buffer.from('ok'), 'text/html; charset=not-a-charset'), 'ok');
});

test('normalizeUrl drops tracking parameters but keeps article identifiers', () => {
  assert.equal(
    normalizeUrl('https://news.example/story?id=42&utm_source=tg&utm_medium=x&fbclid=abc#top', 'https://news.example/'),
    'https://news.example/story?id=42',
  );
  assert.equal(normalizeUrl('javascript:alert(1)', 'https://news.example/'), '');
});

test('the feed parser refuses exponential entity expansion', () => {
  const { SourceReaderService } = require('../dist/modules/smart-publishing/source-reader.service');
  const reader = new SourceReaderService();
  const levels = ['<!ENTITY a0 "lol">'];
  for (let i = 1; i < 10; i += 1) levels.push(`<!ENTITY a${i} "${`&a${i - 1};`.repeat(10)}">`);
  const bomb = `<?xml version="1.0"?><!DOCTYPE rss [${levels.join('')}]><rss><channel><item><title>&a9;</title></item></channel></rss>`;
  const started = Date.now();
  let parsed = '';
  try {
    parsed = JSON.stringify(reader.parser.parse(bomb));
  } catch {
    parsed = '';
  }
  assert.ok(Date.now() - started < 2000);
  assert.ok(parsed.length < 1_000_000);
});

test('a known guid reuses the stored canonical URL so the unique key catches the repeat', () => {
  const entries = [
    { guid: 'g-1', canonicalUrl: 'https://news.example/a?ref=new' },
    { guid: 'g-2', canonicalUrl: 'https://news.example/b' },
    { guid: '', canonicalUrl: 'https://news.example/b' },
  ];
  const result = reuseKnownGuids(entries, [{ guid: 'g-1', canonicalUrl: 'https://news.example/a' }]);
  assert.deepEqual(result.map((entry) => entry.canonicalUrl), ['https://news.example/a', 'https://news.example/b']);
});

test('concurrent automatic social sends deliver each network once', async () => {
  const { SocialNetworkPublisherService } = require('../dist/modules/smart-publishing/social-network-publisher.service');
  const leases = new Map();
  const article = {
    id: 'social-a', status: 'ready', title: 't', link: 'https://news.example/x', captionText: 'c',
    generatedImageUrl: null, featuredImageUrl: 'https://news.example/i.png',
    telegramSentAt: null, instagramSentAt: null, linkedinSentAt: null, facebookSentAt: null,
  };
  const prisma = {
    schedulerLease: {
      createMany: async ({ data }) => { for (const row of data) if (!leases.has(row.key)) leases.set(row.key, { ...row }); },
      updateMany: async ({ where, data }) => {
        const row = leases.get(where.key);
        if (!row || row.expiresAt > where.expiresAt.lte) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }) => { if (leases.get(where.key)?.holder === where.holder) leases.delete(where.key); },
    },
    socialArticle: {
      findFirst: async () => ({ ...article }),
      update: async ({ data }) => Object.assign(article, data),
    },
  };
  const publisher = new SocialNetworkPublisherService(prisma, {}, {
    proxyImage: async () => ({ buffer: require('sharp') ? await require('sharp')({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer() : Buffer.alloc(0), contentType: 'image/png' }),
  });
  let sends = 0;
  publisher.publish = async () => {
    sends += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    article.telegramSentAt = new Date();
  };
  await Promise.all([
    publisher.publishAutomatically('tenant-a', 'social-a', ['telegram']),
    publisher.publishAutomatically('tenant-a', 'social-a', ['telegram']),
  ]);
  assert.equal(sends, 1);
});
