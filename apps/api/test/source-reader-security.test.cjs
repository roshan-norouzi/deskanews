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

test('SourceReader accepts RSS served as application/xhtml+xml or text/html', async () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
    <item><title>Africa news</title><link>https://www.africanews.com/story</link><description>Latest story</description></item>
  </channel></rss>`;
  const service = new SourceReaderService();
  service.resolveAddresses = async () => [{ address: '93.184.216.34', family: 4 }];
  service.requestAddress = async () => response(200, { 'content-type': 'application/xhtml+xml' }, rss);

  const xhtmlEntries = await service.readFeed('https://www.africanews.com/feed/rss');
  assert.equal(xhtmlEntries.length, 1);
  assert.equal(xhtmlEntries[0].title, 'Africa news');
  assert.equal(xhtmlEntries[0].canonicalUrl, 'https://www.africanews.com/story');

  service.requestAddress = async () => response(200, { 'content-type': 'text/html; charset=UTF-8' }, rss);
  const htmlEntries = await service.readFeed('https://www.africanews.com/feed/rss');
  assert.equal(htmlEntries.length, 1);
  assert.equal(htmlEntries[0].title, 'Africa news');
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

test('SourceReader extracts twitter profile photo from syndication payload', async () => {
  const service = new SourceReaderService();
  service.safeFetchText = async () => `<!DOCTYPE html><html><body><script>
    window.__INITIAL_STATE__ = {"profile_image_url_https":"https:\\/\\/pbs.twimg.com\\/profile_images\\/123\\/abc_normal.jpg"};
  </script></body></html>`;

  const photo = await service.resolveFeedProfilePhoto('https://x.com/Reuters', 'twitter');
  assert.equal(photo, 'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg');
});

test('SourceReader resolves telegram profile photo from public userpic url', async () => {
  const service = new SourceReaderService();
  const photo = await service.resolveFeedProfilePhoto('https://t.me/VahidOnline', 'telegram');
  assert.equal(photo, 'https://t.me/i/userpic/320/VahidOnline.jpg');
});

test('SourceReader parses embedded X syndication JSON when legacy DOM selectors are absent', async () => {
  const service = new SourceReaderService();
  const syndicationHtml = `<!DOCTYPE html><html><body><script>
    window.__INITIAL_STATE__ = {"id_str":"9876543210","full_text":"خبر مهم از X برای میز خبر","permalink":"\\/news\\/status\\/9876543210"};
  </script></body></html>`;
  service.safeFetchText = async () => syndicationHtml;

  const twitter = await service.readSource('twitter', 'https://x.com/news');
  assert.equal(twitter.length, 1);
  assert.equal(twitter[0].canonicalUrl, 'https://x.com/news/status/9876543210');
  assert.match(twitter[0].content, /خبر مهم از X/);
  assert.equal(twitter[0].author, '@news');
});

test('SourceReader retries geo-blocked international RSS through Worker', async () => {
  const service = new SourceReaderService({
    getResolvedSourceFetchBridge: async () => ({
      url: 'https://deska.example.workers.dev',
      secret: '',
    }),
  });
  service.safeFetchTextDirect = async () => {
    throw new BadRequestException('منبع با خطای HTTP 403 پاسخ داد');
  };
  service.safeFetchTextViaBridge = async () => `<?xml version="1.0"?><rss version="2.0"><channel><item><title>BBC story</title><link>https://www.bbc.com/news/1</link><description>Summary</description></item></channel></rss>`;

  const entries = await service.readFeed('https://www.bbc.com/news/rss.xml');
  assert.equal(entries.length, 1);
  assert.match(entries[0].title, /BBC story/);
  assert.equal(entries[0].canonicalUrl, 'https://www.bbc.com/news/1');
});

test('SourceReader keeps news direct and social sources on the fetch service', async () => {
  const seen = [];
  const service = new SourceReaderService({
    getSourceFetchPolicy: async () => ({
      url: 'https://deska.example.workers.dev',
      secret: '',
      newsViaBridge: false,
    }),
  });
  service.safeFetchTextDirect = async (url) => {
    seen.push(`direct:${url}`);
    return `<?xml version="1.0"?><rss version="2.0"><channel><item><title>خبر داخلی</title><link>https://www.isna.ir/news/1</link><description>خلاصه</description></item></channel></rss>`;
  };
  service.safeFetchTextViaBridge = async (url) => {
    seen.push(`bridge:${url}`);
    return '<div class="tgme_widget_message"><div class="tgme_widget_message_text">تلگرام</div><a class="tgme_widget_message_date" href="https://t.me/channel/1"><time datetime="2026-09-14T10:00:00+00:00"></time></a></div>';
  };

  const domestic = await service.readFeed('https://www.isna.ir/rss');
  const telegram = await service.readSource('telegram', 'https://t.me/channel');
  assert.match(domestic[0].title, /خبر داخلی/);
  assert.equal(telegram.length, 1);
  assert.match(seen[0], /^direct:/u);
  assert.match(seen[1], /^bridge:/u);
});

test('SourceReader fetches every source type through Worker when it is configured', async () => {
  const seen = [];
  const service = new SourceReaderService({
    getResolvedSourceFetchBridge: async () => ({
      url: 'https://deska.example.workers.dev',
      secret: '',
    }),
  });
  service.safeFetchTextViaBridge = async (url) => {
    seen.push(url);
    if (url.includes('isna.ir')) {
      return `<?xml version="1.0"?><rss version="2.0"><channel><item><title>خبر داخلی</title><link>https://www.isna.ir/news/1</link><description>خلاصه</description></item></channel></rss>`;
    }
    if (url.includes('t.me')) {
      return '<div class="tgme_widget_message"><div class="tgme_widget_message_text">تلگرام</div><a class="tgme_widget_message_date" href="https://t.me/channel/1"><time datetime="2026-09-14T10:00:00+00:00"></time></a></div>';
    }
    return '<div class="timeline-Tweet" data-tweet-id="1"><p class="timeline-Tweet-text">توییت</p><a href="https://x.com/news/status/1">post</a><time datetime="2026-09-14T11:00:00Z"></time></div>';
  };
  service.safeFetchTextDirect = async () => {
    throw new Error('direct fetch must not run when Worker is configured');
  };

  const domestic = await service.readFeed('https://www.isna.ir/rss');
  const telegram = await service.readSource('telegram', 'https://t.me/channel');
  const twitter = await service.readSource('twitter', 'https://x.com/news');
  assert.match(domestic[0].title, /خبر داخلی/);
  assert.equal(telegram.length, 1);
  assert.equal(twitter.length, 1);
  assert.equal(seen.length, 3);
});

test('SourceReader surfaces Worker host_not_allowed without a direct fallback', async () => {
  const service = new SourceReaderService({
    getResolvedSourceFetchBridge: async () => ({
      url: 'https://deska.example.workers.dev',
      secret: '',
    }),
  });
  service.safeFetchTextViaBridge = async () => {
    throw new BadRequestException('دریافت منبع از طریق Worker ناموفق بود: host_not_allowed');
  };
  service.safeFetchTextDirect = async () => {
    throw new Error('direct fetch must not run after Worker rejected the host');
  };

  await assert.rejects(
    () => service.readFeed('https://www.euronews.com/rss?format=xml'),
    (error) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(error.getResponse().message, /تلگرام و توییتر|منابع خبری/u);
      return true;
    },
  );
});

test('SourceReader keeps news on Worker when bridge is configured for news feeds', async () => {
  const order = [];
  const service = new SourceReaderService({
    getSourceFetchPolicy: async () => ({
      url: 'https://deska.example.workers.dev',
      secret: '',
      newsViaBridge: true,
    }),
  });
  service.safeFetchTextViaBridge = async () => {
    order.push('bridge');
    throw new BadRequestException('دریافت منبع از طریق Worker ناموفق بود: upstream_http_520');
  };
  service.safeFetchTextDirect = async () => {
    order.push('direct');
    throw new Error('direct fetch must not run when news feeds are pinned to Worker');
  };

  await assert.rejects(
    () => service.readFeed('https://www.isna.ir/rss'),
    (error) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(error.getResponse().message, /520/u);
      return true;
    },
  );
  assert.deepEqual(order, ['bridge']);
});

test('SourceReader uses Worker after filtered DNS blocks a direct news fetch', async () => {
  const order = [];
  const service = new SourceReaderService({
    getSourceFetchPolicy: async () => ({
      url: 'https://deska.example.workers.dev',
      secret: '',
      newsViaBridge: false,
    }),
  });
  service.safeFetchTextDirect = async (url) => {
    order.push('direct');
    assert.match(url, /isna\.ir/u);
    throw new BadRequestException('دامنه در DNS سرور به آدرس داخلی فیلترینگ (10.10.34.x) نگاشت شده است؛ دریافت این منبع را از طریق Worker انجام دهید');
  };
  service.safeFetchTextViaBridge = async () => {
    order.push('bridge');
    return `<?xml version="1.0"?><rss version="2.0"><channel><item><title>OK</title><link>https://www.isna.ir/1</link></item></channel></rss>`;
  };

  const entries = await service.readFeed('https://www.isna.ir/rss');
  assert.deepEqual(order, ['direct', 'bridge']);
  assert.equal(entries.length, 1);
});

test('SourceReader uses Worker first for international RSS when bridge is configured', async () => {
  const order = [];
  const service = new SourceReaderService({
    getResolvedSourceFetchBridge: async () => ({
      url: 'https://deska.example.workers.dev',
      secret: '',
    }),
  });
  service.safeFetchTextViaBridge = async (url) => {
    order.push('bridge');
    assert.match(url, /euronews\.com/u);
    return `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Euro story</title><link>https://www.euronews.com/news/1</link><description>Summary</description></item></channel></rss>`;
  };
  service.safeFetchTextDirect = async () => {
    order.push('direct');
    throw new BadRequestException('اتصال امن به منبع برقرار نشد: read ECONNRESET');
  };

  const entries = await service.readFeed('https://www.euronews.com/rss?format=xml');
  assert.deepEqual(order, ['bridge']);
  assert.match(entries[0].title, /Euro story/);
});

test('SourceReader suggests Worker setup when international direct fetch is blocked', async () => {
  const service = new SourceReaderService({
    getResolvedSourceFetchBridge: async () => ({ url: '', secret: '' }),
  });
  service.safeFetchTextDirect = async () => {
    throw new BadRequestException('اتصال امن به منبع برقرار نشد: read ECONNRESET');
  };

  await assert.rejects(
    () => service.readFeed('https://www.euronews.com/rss?format=xml'),
    (error) => {
      assert.ok(error instanceof BadRequestException);
      const message = error.getResponse().message;
      assert.match(message, /ECONNRESET/u);
      assert.match(message, /Worker Deska/u);
      return true;
    },
  );
});

test('SourceReader scrapes international websites through Worker when RSS is missing', async () => {
  const service = new SourceReaderService({
    getResolvedSourceFetchBridge: async () => ({
      url: 'https://deska.example.workers.dev',
      secret: '',
    }),
  });
  service.safeFetchTextDirect = async () => {
    throw new BadRequestException('منبع با خطای HTTP 451 پاسخ داد');
  };
  service.safeFetchTextViaBridge = async (url) => {
    if (url.includes('/article-1')) {
      return '<html><head><meta property="og:title" content="Blocked outlet story"><meta property="og:description" content="Full article from outside Iran"></head><body><article><p>Full article from outside Iran</p></article></body></html>';
    }
    return '<html><body><main><article><h2><a href="https://www.nytimes.com/article-1">Blocked outlet story</a></h2></article></main></body></html>';
  };
  service.discoverFeedUrl = async () => null;

  const result = await service.readSourceWithMeta('website', 'https://www.nytimes.com/');
  assert.ok(result.entries.length >= 1);
  assert.match(result.entries[0].title, /Blocked outlet story/);
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

test('SourceReader reads the full article from the source AMP link when the page only has a summary', async () => {
  const service = new SourceReaderService();
  const full = 'متن کامل خبر که فقط در نسخه AMP صفحه منبع وجود دارد و برای انتشار کافی است. '.repeat(6);
  service.safeFetchText = async (url) => {
    if (String(url).includes('/amp')) {
      return `<html><head><title>خبر کامل</title></head><body><article><p>${full}</p></article></body></html>`;
    }
    return '<html><head><link rel="amphtml" href="https://news.example/story/amp"><meta property="og:description" content="فقط چکیده"></head><body><article><p>فقط چکیده</p></article></body></html>';
  };
  service.renderArticlePage = async () => { throw new Error('browser should not run'); };

  const source = await service.readArticle('https://news.example/story');

  assert.match(source.text, /نسخه AMP/);
  assert.equal(source.contentSource, 'page');
  assert.equal(source.isFullText, true);
});

test('SourceReader fetches the article page through the worker when the server cannot reach the source', async () => {
  const service = new SourceReaderService({
    getSourceFetchPolicy: async () => ({ url: 'https://deska.example.workers.dev', secret: '', newsViaBridge: false }),
  });
  const full = 'متن کامل خبر که سرور به‌خاطر فیلترینگ مستقیم ندید و از Worker آمد. '.repeat(6);
  service.safeFetchText = async () => {
    throw new BadRequestException('دامنه در DNS سرور به آدرس داخلی فیلترینگ (10.10.34.x) نگاشت شده است؛ دریافت این منبع را از طریق Worker انجام دهید');
  };
  service.safeFetchTextViaBridge = async () => `<html><head><title>از ورکر</title></head><body><article><p>${full}</p></article></body></html>`;
  service.renderArticlePage = async () => { throw new Error('browser should not run'); };

  const source = await service.readArticle('https://news.example/filtered');

  assert.match(source.text, /از Worker آمد/);
  assert.equal(source.contentSource, 'page');
  assert.equal(source.isFullText, true);
});

test('SourceReader extracts a full article stored as plain text inside the body container', async () => {
  const service = new SourceReaderService();
  const full = 'متن کامل خبر داخل یک بلوک بدون پاراگراف جداگانه ذخیره شده است. '.repeat(8);
  service.safeFetchText = async () => `<html><head><title>بلوک</title></head><body><div class="article-content">${full}</div></body></html>`;
  service.renderArticlePage = async () => { throw new Error('browser should not run'); };

  const source = await service.readArticle('https://news.example/block');

  assert.match(source.text, /بدون پاراگراف/);
  assert.equal(source.contentSource, 'page');
});
