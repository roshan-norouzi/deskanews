require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { BadRequestException } = require('@nestjs/common');
const { SourceReaderService } = require('../dist/modules/smart-publishing/source-reader.service');

function response(statusCode, headers = {}, body = '') {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  stream.statusCode = statusCode;
  stream.headers = headers;
  return stream;
}

test('SourceReader rejects private, loopback, link-local and metadata IP representations', async () => {
  const service = new SourceReaderService();
  const blockedUrls = [
    'http://0.0.0.0/',
    'http://10.0.0.1/',
    'http://127.0.0.1/',
    'http://0x7f000001/',
    'http://100.64.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://172.16.0.1/',
    'http://168.63.129.16/',
    'http://192.168.0.1/',
    'http://198.18.0.1/',
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a9fe:a9fe]/',
    'http://[::ffff:c0a8:101]/',
    'http://[2600::5efe:7f00:1]/',
  ];

  for (const url of blockedUrls) {
    await assert.rejects(
      () => service.assertPublicUrl(url),
      (error) => error instanceof BadRequestException,
      `expected ${url} to be blocked`,
    );
  }
});

test('SourceReader keeps globally routable IPv4 and IPv6 literals available', async () => {
  const service = new SourceReaderService();

  const ipv4 = await service.assertPublicUrl('https://8.8.8.8/feed');
  const ipv6 = await service.assertPublicUrl('https://[2606:4700:4700::1111]/feed');

  assert.deepEqual(ipv4.addresses, [{ address: '8.8.8.8', family: 4 }]);
  assert.deepEqual(ipv6.addresses, [{ address: '2606:4700:4700::1111', family: 6 }]);
});

test('SourceReader rejects a hostname when any DNS answer is non-public', async () => {
  const service = new SourceReaderService();
  service.resolveAddresses = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '::ffff:7f00:1', family: 6 },
  ];

  await assert.rejects(
    () => service.assertPublicUrl('https://feeds.example/rss.xml'),
    (error) => error instanceof BadRequestException,
  );
});

test('SourceReader pins the socket address while preserving HTTPS Host and SNI', () => {
  const service = new SourceReaderService();
  const options = service.createPinnedRequestOptions(
    new URL('https://feeds.example:8443/rss.xml?lang=fa'),
    { address: '93.184.216.34', family: 4 },
    { Accept: 'application/rss+xml' },
  );

  assert.equal(options.hostname, '93.184.216.34');
  assert.equal(options.family, 4);
  assert.equal(options.servername, 'feeds.example');
  assert.equal(options.path, '/rss.xml?lang=fa');
  assert.equal(options.headers.Host, 'feeds.example:8443');
  assert.equal(options.lookup, undefined);
});

test('SourceReader validates every redirect before opening the next connection', async () => {
  const service = new SourceReaderService();
  let connectionCount = 0;
  service.resolveAddresses = async () => [{ address: '93.184.216.34', family: 4 }];
  service.requestAddress = async (_url, address) => {
    connectionCount += 1;
    assert.equal(address.address, '93.184.216.34');
    return response(302, { location: 'http://[::ffff:7f00:1]/admin' });
  };

  await assert.rejects(
    () => service.safeFetchText('https://feeds.example/rss.xml', 1024, ['application/rss+xml']),
    (error) => error instanceof BadRequestException,
  );
  assert.equal(connectionCount, 1, 'the internal redirect target must never be contacted');
});

test('credentialed outbound POST requests are pinned to the validated address', async () => {
  const service = new SourceReaderService();
  let observed;
  service.resolveAddresses = async () => [{ address: '93.184.216.34', family: 4 }];
  service.requestAddress = async (url, address, headers, _signal, method, body) => {
    observed = { url: url.toString(), address, headers, method, body: body.toString('utf8') };
    return response(200, { 'content-type': 'application/json' }, '{"ok":true}');
  };

  const result = await service.safeRequest('https://api.example/v1/models', {
    method: 'POST',
    headers: { Authorization: 'Bearer redacted', 'Content-Type': 'application/json' },
    body: '{"probe":true}',
    acceptedTypes: ['application/json'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.json(), { ok: true });
  assert.equal(observed.address.address, '93.184.216.34');
  assert.equal(observed.method, 'POST');
  assert.equal(observed.body, '{"probe":true}');
  assert.equal(observed.headers.Authorization, 'Bearer redacted');
});

test('credentialed outbound requests never follow redirects', async () => {
  const service = new SourceReaderService();
  let requests = 0;
  service.resolveAddresses = async () => [{ address: '93.184.216.34', family: 4 }];
  service.requestAddress = async () => {
    requests += 1;
    return response(302, { location: 'https://other.example/steal' });
  };

  await assert.rejects(
    () => service.safeRequest('https://api.example/v1/models', {
      headers: { Authorization: 'Bearer must-not-be-forwarded' },
    }),
    /آدرس نهایی سرویس/,
  );
  assert.equal(requests, 1);
});

test('SourceReader keeps RSS text when an article page cannot be extracted', async () => {
  const service = new SourceReaderService();
  service.readArticle = async () => {
    throw new BadRequestException('متن کامل خبر از صفحه منبع قابل استخراج نبود');
  };

  const source = await service.readArticleOrFallback('https://www.isna.ir/news/example', {
    title: 'خبر نمونه',
    text: 'این چکیدهٔ معتبر از RSS دریافت شده و باید برای ادامهٔ آماده‌سازی خبر حفظ شود.',
    featuredImageUrl: 'https://www.isna.ir/images/example.jpg',
    author: 'ایسنا',
    category: 'ورزش',
  });

  assert.equal(source.title, 'خبر نمونه');
  assert.match(source.text, /چکیدهٔ معتبر از RSS/);
  assert.equal(source.featuredImageUrl, 'https://www.isna.ir/images/example.jpg');
  assert.equal(source.author, 'ایسنا');
  assert.equal(source.category, 'ورزش');
  assert.equal(source.contentSource, 'feed');
  assert.equal(source.isFullText, false);
});

test('SourceReader distinguishes a feed summary from genuine full feed content', async () => {
  const service = new SourceReaderService();
  const longBody = `متن کامل خبر ${'با جزئیات دقیق و قابل انتشار '.repeat(55)}`;
  service.safeFetchText = async () => `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
      <item><title>خبر خلاصه</title><link>https://news.example/summary</link><description>فقط چکیده کوتاه خبر</description></item>
      <item><title>خبر کامل</title><link>https://news.example/full</link><description>چکیده کوتاه خبر کامل</description><content:encoded><![CDATA[${longBody}]]></content:encoded></item>
    </channel></rss>`;

  const entries = await service.readFeed('https://news.example/rss');

  assert.equal(entries[0].content, entries[0].summary);
  assert.equal(entries[0].contentIsFull, false);
  assert.equal(entries[1].contentIsFull, true);
  assert.match(entries[1].content, /جزئیات دقیق/);
});

test('SourceReader accepts RSS 1.0 RDF feeds and Atom feeds with alternate links', async () => {
  const service = new SourceReaderService();
  service.safeFetchText = async (url) => url.includes('rdf')
    ? `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><item><title>خبر RDF</title><link>/rdf-story</link><description>خلاصه RDF</description><dc:date xmlns:dc="http://purl.org/dc/elements/1.1/">2026-09-13T10:00:00Z</dc:date></item></rdf:RDF>`
    : `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>خبر اتم</title><link rel="self" href="/self"/><link rel="alternate" href="/atom-story"/><summary>خلاصه اتم</summary></entry></feed>`;

  const rdfEntries = await service.readFeed('https://news.example/rdf');
  const atomEntries = await service.readFeed('https://news.example/atom');
  assert.equal(rdfEntries[0].canonicalUrl, 'https://news.example/rdf-story');
  assert.equal(rdfEntries[0].title, 'خبر RDF');
  assert.equal(atomEntries[0].canonicalUrl, 'https://news.example/atom-story');
  assert.equal(atomEntries[0].title, 'خبر اتم');
});

test('SourceReader accepts JSON Feed documents', async () => {
  const service = new SourceReaderService();
  service.safeFetchText = async () => JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    items: [{
      id: 'json-1',
      url: 'https://news.example/json-story',
      title: 'خبر JSON',
      content_text: 'متن JSON',
      date_published: '2026-09-13T10:00:00Z',
      author: { name: 'خبرنگار' },
    }],
  });

  const entries = await service.readFeed('https://news.example/feed.json');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].canonicalUrl, 'https://news.example/json-story');
  assert.equal(entries[0].summary, 'متن JSON');
  assert.equal(entries[0].author, 'خبرنگار');
});

test('SourceReader extracts featured images from JSON feeds and page metadata', async () => {
  const service = new SourceReaderService();
  service.safeFetchText = async (url) => url.includes('json')
    ? JSON.stringify({ items: [{ id: '1', url: 'https://news.example/story', title: 'خبر', image: '/images/cover.jpg' }] })
    : '<html><head><meta property="og:image" content="/images/og-cover.jpg"><script type="application/ld+json">'
      + JSON.stringify({ '@type': 'NewsArticle', image: { url: 'https://news.example/images/structured.jpg' } })
      + '</script></head><body><article><img data-lazy-src="/images/lazy-cover.jpg"></article></body></html>';

  const feedEntries = await service.readFeed('https://news.example/json-feed');
  const metadata = await service.readArticleMetadata('https://news.example/story');
  assert.equal(feedEntries[0].featuredImageUrl, 'https://news.example/images/cover.jpg');
  assert.equal(metadata.featuredImageUrl, 'https://news.example/images/og-cover.jpg');
});

test('SourceReader monitors websites and blogs by discovering article pages', async () => {
  const service = new SourceReaderService();
  service.safeFetchText = async (url) => url === 'https://publisher.example'
    ? '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body></body></html>'
    : url.includes('feed.xml')
      ? '<rss><channel><item><title>خبر از RSS خودکار</title><link>/story</link><description>متن خبر</description></item></channel></rss>'
      : '<html><head><meta property="og:title" content="خبر وبلاگ"><meta name="description" content="چکیده خبر وبلاگ"></head><body><article><p>متن کامل خبر وبلاگ که از صفحهٔ فهرست کشف شده است و برای پایش ذخیره می‌شود.</p></article></body></html>';

  const rssEntries = await service.readSource('website', 'https://publisher.example');
  assert.equal(rssEntries[0].canonicalUrl, 'https://publisher.example/story');

  service.safeFetchText = async (url) => url === 'https://blog.example'
    ? '<html><body><main><article><a href="/post-1">عنوان مطلب وبلاگ</a></article></main></body></html>'
    : '<html><head><meta property="og:title" content="عنوان مطلب وبلاگ"><meta property="og:description" content="خلاصه مطلب وبلاگ"></head><body><article><p>متن مطلب وبلاگ در صفحهٔ مقصد قرار دارد و باید به‌عنوان ورودی منبع دریافت شود.</p></article></body></html>';
  const blogEntries = await service.readSource('blog', 'https://blog.example');
  assert.equal(blogEntries[0].title, 'عنوان مطلب وبلاگ');
  assert.equal(blogEntries[0].canonicalUrl, 'https://blog.example/post-1');
});

test('SourceReader uses cached resolvedFeedUrl for website sources without rescraping the homepage', async () => {
  const service = new SourceReaderService();
  let feedCalls = 0;
  service.readFeed = async (url) => {
    feedCalls += 1;
    assert.equal(url, 'https://publisher.example/feed.xml');
    return [{
      canonicalUrl: 'https://publisher.example/story',
      guid: '1',
      title: 'خبر از فید کشف‌شده',
      summary: 'متن خبر',
      content: 'متن خبر',
      contentIsFull: false,
      featuredImageUrl: '',
      authorImageUrl: '',
      author: '',
      category: '',
      publishedAt: null,
    }];
  };

  const result = await service.readSourceWithMeta('website', 'https://publisher.example', {
    resolvedFeedUrl: 'https://publisher.example/feed.xml',
  });

  assert.equal(feedCalls, 1);
  assert.equal(result.entries.length, 1);
  assert.equal(result.resolvedFeedUrl, 'https://publisher.example/feed.xml');
});

test('SourceReader parses embedded X syndication JSON when legacy DOM selectors are absent', async () => {
  const service = new SourceReaderService();
  const syndicationHtml = `<!DOCTYPE html><html><body><script>
    window.__INITIAL_STATE__ = {"id_str":"9876543210","full_text":"خبر مهم از X برای اتاق خبر","permalink":"\\/news\\/status\\/9876543210"};
  </script></body></html>`;
  service.safeFetchText = async () => syndicationHtml;

  const twitter = await service.readSource('twitter', 'https://x.com/news');
  assert.equal(twitter.length, 1);
  assert.equal(twitter[0].canonicalUrl, 'https://x.com/news/status/9876543210');
  assert.match(twitter[0].content, /خبر مهم از X/);
  assert.equal(twitter[0].author, '@news');
});

test('SourceReader routes Telegram and X through the source fetch bridge', async () => {
  const service = new SourceReaderService({
    getResolvedSourceFetchBridge: async () => ({
      url: 'https://deska.roshan-norouzi.workers.dev',
      secret: '',
    }),
  });
  const bridgedUrls = [];
  service.safeFetchTextViaBridge = async (url) => {
    bridgedUrls.push(url);
    if (url.includes('t.me/s')) {
      return '<div class="tgme_widget_message"><div class="tgme_widget_message_text">خبر از Worker</div><a class="tgme_widget_message_date" href="https://t.me/channel/99"><time datetime="2026-09-14T10:00:00+00:00"></time></a></div>';
    }
    return '<div class="timeline-Tweet" data-tweet-id="456"><p class="timeline-Tweet-text">پست X از Worker</p><a href="https://x.com/news/status/456">post</a><time datetime="2026-09-14T11:00:00Z"></time></div>';
  };

  const telegram = await service.readSource('telegram', 'https://t.me/channel');
  const twitter = await service.readSource('twitter', 'https://x.com/news');
  assert.equal(bridgedUrls.length, 2);
  assert.match(bridgedUrls[0], /t\.me\/s\/channel/u);
  assert.match(bridgedUrls[1], /syndication\.twitter\.com/u);
  assert.equal(telegram[0].canonicalUrl, 'https://t.me/channel/99');
  assert.equal(twitter[0].canonicalUrl, 'https://x.com/news/status/456');
});

test('SourceReader monitors public Telegram channels and public X accounts', async () => {
  const service = new SourceReaderService();
  service.safeFetchText = async (url) => url.includes('t.me/s')
    ? '<div class="tgme_widget_message"><div class="tgme_widget_message_text">خبر کانال تلگرام<br>جزئیات خبر</div><a class="tgme_widget_message_date" href="https://t.me/channel/42"><time datetime="2026-09-14T10:00:00+00:00"></time></a></div>'
    : '<div class="timeline-Tweet" data-tweet-id="123"><p class="timeline-Tweet-text">یک پست عمومی در حساب X برای پایش</p><a href="https://x.com/news/status/123">post</a><time datetime="2026-09-14T11:00:00Z"></time></div>';

  const telegram = await service.readSource('telegram', 'https://t.me/channel');
  const twitter = await service.readSource('twitter', 'https://x.com/news');
  assert.equal(telegram[0].canonicalUrl, 'https://t.me/channel/42');
  assert.equal(telegram[0].category, 'تلگرام');
  assert.equal(twitter[0].canonicalUrl, 'https://x.com/news/status/123');
  assert.equal(twitter[0].author, '@news');
});

test('SourceReader extracts JSON-LD article bodies without executing source scripts', async () => {
  const service = new SourceReaderService();
  service.safeFetchText = async () => `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: 'تیتر نمونه',
      articleBody: 'این متن کامل خبر از دادهٔ ساخت‌یافتهٔ صفحه استخراج می‌شود و به اندازهٔ کافی طولانی است تا به‌عنوان متن مقاله پذیرفته شود. این روش برای سایت‌هایی که بدنه را در HTML معمولی نشان نمی‌دهند نیز کاربرد دارد.',
    })}</script>
  </head><body><main></main></body></html>`;

  const source = await service.readArticle('https://news.example/story');

  assert.equal(source.title, 'تیتر نمونه');
  assert.match(source.text, /دادهٔ ساخت‌یافته/);
  assert.equal(source.contentSource, 'page');
  assert.equal(source.isFullText, true);
});

test('SourceReader uses browser-rendered HTML only after direct extraction fails', async () => {
  const service = new SourceReaderService();
  let browserCalls = 0;
  service.safeFetchText = async () => '<html><body>Transferring to the website...</body></html>';
  service.renderArticlePage = async () => {
    browserCalls += 1;
    return {
      url: 'https://news.example/story',
      html: `<html><head><title>خبر پویا</title></head><body><article><div class="article-content">
        <p>${'این متن پس از اجرای جاوااسکریپت صفحه در مرورگر ایزوله دریافت شده است. '.repeat(8)}</p>
      </div></article></body></html>`,
    };
  };

  const source = await service.readArticle('https://news.example/story');

  assert.equal(browserCalls, 1);
  assert.equal(source.title, 'خبر پویا');
  assert.equal(source.contentSource, 'page');
  assert.match(source.text, /مرورگر ایزوله/);
});

test('SourceReader skips browser rendering when ordinary HTML already contains the full article', async () => {
  const service = new SourceReaderService();
  service.safeFetchText = async () => `<html><head><title>خبر عادی</title></head><body><article>
    <p>${'متن کامل خبر از همان پاسخ عادی و بدون اجرای مرورگر دریافت شده است. '.repeat(8)}</p>
  </article></body></html>`;
  service.renderArticlePage = async () => { throw new Error('browser should not run'); };

  const source = await service.readArticle('https://news.example/story');

  assert.equal(source.title, 'خبر عادی');
  assert.match(source.text, /بدون اجرای مرورگر/);
});
