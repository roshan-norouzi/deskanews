require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { GapGptClient, isLikelyPersianNews } = require('../dist/modules/smart-publishing/gapgpt.client');
const { NewsroomService } = require('../dist/modules/smart-publishing/newsroom.service');
const { SocialNetworkPublisherService } = require('../dist/modules/smart-publishing/social-network-publisher.service');
const { SocialStudioService } = require('../dist/modules/smart-publishing/social-studio.service');
const { SocialCoverRendererService } = require('../dist/modules/smart-publishing/social-cover-renderer.service');

const integrationHealth = { success: async () => ({}), failure: async () => ({}) };
const workflow = { record: async () => ({}) };
const usageTracking = { record: async () => {} };
const destinationCategories = {
  categorizeArticlesByCanonicalUrls: async () => {},
  categorizeArticle: async () => ({}),
  assignManualCategory: async () => ({}),
};
const platformFeeds = {
  listForTenant: async () => [],
  ensureSubscriptions: async () => {},
  prepareSharedArticle: async () => null,
  toggleForTenant: async () => ({}),
};
const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function gapGptResponse(content) {
  return {
    ok: true,
    status: 200,
    json: () => ({ choices: [{ message: { content } }] }),
  };
}

test('news language detection distinguishes Persian copy from foreign copy', () => {
  assert.equal(isLikelyPersianNews('رئیس سازمان اعلام کرد که این برنامه برای توسعه همکاری‌های منطقه‌ای اجرا می‌شود.'), true);
  assert.equal(isLikelyPersianNews('The agency announced a new regional cooperation programme after the meeting.'), false);
  assert.equal(isLikelyPersianNews('أعلنت الوكالة عن برنامج جديد للتعاون الإقليمي بعد الاجتماع.'), false);
});

test('Persian news uses its dedicated rewrite prompt', async () => {
  let requestBody;
  const outbound = {
    safeRequest: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return gapGptResponse('{"title":"تیتر بازنویسی‌شده","summary":"خلاصه بازنویسی‌شده خبر فارسی."}');
    },
  };
  const client = new GapGptClient(outbound);
  const result = await client.summarize({
    gapgpt_base_url: 'https://gap.example/v1',
    gapgpt_api_key: 'secret',
    news_summary_prompt: 'FOREIGN_PROMPT',
    news_persian_rewrite_prompt: 'PERSIAN_REWRITE_PROMPT',
  }, {
    sourceName: 'رسانه فارسی',
    title: 'دولت برنامه جدید اقتصادی را اعلام کرد',
    summary: 'این برنامه برای حمایت از تولید و افزایش سرمایه‌گذاری در کشور اجرا می‌شود.',
  });

  assert.equal(requestBody.messages[0].content, 'PERSIAN_REWRITE_PROMPT');
  assert.equal(result.title, 'تیتر بازنویسی‌شده');
});

test('foreign news keeps the translation prompt', async () => {
  let requestBody;
  const outbound = {
    safeRequest: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return gapGptResponse('{"title":"عنوان فارسی","summary":"خلاصه فارسی خبر خارجی."}');
    },
  };
  const client = new GapGptClient(outbound);
  await client.summarize({
    gapgpt_base_url: 'https://gap.example/v1',
    gapgpt_api_key: 'secret',
    news_summary_prompt: 'FOREIGN_TRANSLATION_PROMPT',
    news_persian_rewrite_prompt: 'PERSIAN_REWRITE_PROMPT',
  }, {
    sourceName: 'Foreign media',
    title: 'Government announces a new economic programme',
    summary: 'The programme is intended to support production and increase investment.',
  });

  assert.equal(requestBody.messages[0].content, 'FOREIGN_TRANSLATION_PROMPT');
});

test('newsroom preparation fills a missing featured image from article metadata', async () => {
  const article = {
    id: 'news-image-a', status: 'new', featuredImageUrl: '',
    originalUrl: 'https://source.example/story', canonicalUrl: 'https://source.example/story',
    sourceName: 'رسانه نمونه', originalTitle: 'عنوان اصلی', originalSummary: 'چکیده خبر', originalContent: '',
    titleFa: '', summaryFa: '',
  };
  let updateData;
  const prisma = {
    newsArticle: {
      findFirst: async () => article,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => { updateData = data; return { ...article, ...data }; },
    },
  };
  const sourceReader = {
    readArticleMetadata: async (url) => {
      assert.equal(url, article.originalUrl);
      return { featuredImageUrl: 'https://source.example/images/cover.jpg' };
    },
  };
  const newsroom = new NewsroomService(
    prisma,
    { getRaw: async () => ({}) },
    { summarize: async () => ({ title: 'تیتر آماده', summary: 'خلاصه آماده' }) },
    sourceReader,
    {},
    {},
    integrationHealth,
    workflow,
    platformFeeds,
    usageTracking,
    destinationCategories,
  );

  await newsroom.summarize('tenant-a', article.id);

  assert.equal(updateData.featuredImageUrl, 'https://source.example/images/cover.jpg');
  assert.equal(updateData.status, 'ready');
});

test('source health test returns the five latest items without saving them', async () => {
  const publishedAt = (day) => new Date(`2026-09-${String(day).padStart(2, '0')}T10:00:00Z`);
  const entries = Array.from({ length: 6 }, (_, index) => ({
    title: `مطلب ${index + 1}`, summary: `خلاصه ${index + 1}`, content: `متن ${index + 1}`,
    canonicalUrl: `https://source.example/${index + 1}`, featuredImageUrl: '', category: 'فناوری',
    publishedAt: publishedAt(index + 9),
  }));
  const prisma = { newsFeed: { findFirst: async () => ({ id: 'source-a', name: 'منبع نمونه', url: 'https://source.example', sourceType: 'website', includeWords: [], excludeWords: [], resolvedFeedUrl: '' }) } };
  const sourceReader = { readSource: async (sourceType, url) => { assert.equal(sourceType, 'website'); assert.equal(url, 'https://source.example'); return entries; } };
  const newsroom = new NewsroomService(prisma, {}, {}, sourceReader, {}, {}, integrationHealth, workflow, platformFeeds, usageTracking, destinationCategories);

  const result = await newsroom.testFeed('tenant-a', 'source-a');

  assert.equal(result.items.length, 5);
  assert.deepEqual(result.items.map((item) => item.title), ['مطلب 6', 'مطلب 5', 'مطلب 4', 'مطلب 3', 'مطلب 2']);
  assert.equal(result.source.sourceType, 'website');
});

test('source settings are stored independently for each source', async () => {
  let created;
  let updated;
  const feed = { id: 'source-settings-a', tenantId: 'tenant-a', name: 'منبع نمونه', url: 'https://source.example', sourceType: 'rss', purpose: 'news-room', enabled: true, pollIntervalMinutes: 240, autoPoll: true, autoPrepare: true, autoPublish: false, autoSendSocial: false, includeWords: [], excludeWords: [], resolvedFeedUrl: '' };
  const prisma = {
    newsFeed: {
      findFirst: async ({ where }) => where.id ? feed : null,
      create: async ({ data }) => { created = data; return { ...feed, ...data }; },
      update: async ({ data }) => { updated = data; return { ...feed, ...data }; },
    },
    platformFeed: { findUnique: async () => null, findFirst: async () => null },
  };
  const sourceReader = { discoverFeedUrl: async () => 'https://source.example/rss.xml' };
  const newsroom = new NewsroomService(prisma, {}, {}, sourceReader, {}, {}, integrationHealth, workflow, platformFeeds, usageTracking, destinationCategories);

  await newsroom.addFeed('tenant-a', { name: 'منبع اختصاصی', url: 'https://source.example', purpose: 'news-room', sourceType: 'website', includeWords: ['فناوری'], pollIntervalMinutes: 15, autoPoll: true, autoPrepare: false, autoPublish: true, autoSendSocial: false });
  await newsroom.updateFeed('tenant-a', feed.id, { includeWords: ['اقتصاد'], pollIntervalMinutes: 30, autoPoll: false, autoPrepare: true, autoPublish: false, autoSendSocial: true });

  assert.deepEqual(created.includeWords, ['فناوری']);
  assert.equal(created.pollIntervalMinutes, 15);
  assert.equal(created.autoPrepare, false);
  assert.equal(created.autoPublish, true);
  assert.deepEqual(updated.includeWords, ['اقتصاد']);
  assert.equal(updated.pollIntervalMinutes, 30);
  assert.equal(updated.autoPoll, false);
  assert.equal(updated.autoSendSocial, true);
});

test('updating a source url and type reuses the same feed record', async () => {
  let createCount = 0;
  let updateCount = 0;
  const feed = {
    id: 'source-url-change-a',
    tenantId: 'tenant-a',
    name: 'خبرگزاری تسنیم',
    url: 'https://www.tasnimnews.com/',
    sourceType: 'website',
    purpose: 'news-room',
    enabled: true,
    pollIntervalMinutes: 240,
    autoPoll: true,
    autoPrepare: true,
    autoPublish: false,
    autoSendSocial: false,
    includeWords: [],
    excludeWords: [],
    resolvedFeedUrl: 'https://www.tasnimnews.com/rss',
  };
  const prisma = {
    newsFeed: {
      findFirst: async ({ where }) => {
        if (where.id) return feed;
        if (where.url && where.NOT?.id) return null;
        return null;
      },
      create: async () => {
        createCount += 1;
        throw new Error('create should not run while editing an existing source');
      },
      update: async ({ where, data }) => {
        updateCount += 1;
        assert.equal(where.id, feed.id);
        Object.assign(feed, data);
        return { ...feed, ...data };
      },
    },
    platformFeed: { findUnique: async () => null, findFirst: async () => null },
  };
  const sourceReader = { discoverFeedUrl: async () => '' };
  const newsroom = new NewsroomService(prisma, {}, {}, sourceReader, {}, {}, integrationHealth, workflow, platformFeeds, usageTracking, destinationCategories);

  await newsroom.updateFeed('tenant-a', feed.id, {
    url: 'https://www.tasnimnews.com/rss',
    sourceType: 'rss',
  });

  assert.equal(createCount, 0);
  assert.equal(updateCount, 1);
  assert.equal(feed.url, 'https://www.tasnimnews.com/rss');
  assert.equal(feed.sourceType, 'rss');
  assert.equal(feed.resolvedFeedUrl, '');
});

test('full Persian articles use the dedicated full-text rewrite prompt', async () => {
  let requestBody;
  const outbound = {
    safeRequest: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return gapGptResponse('متن کامل بازنویسی‌شده با حفظ همه اطلاعات خبر.');
    },
  };
  const client = new GapGptClient(outbound);
  const result = await client.translateFullText({
    gapgpt_base_url: 'https://gap.example/v1',
    gapgpt_api_key: 'secret',
    news_full_translation_prompt: 'FOREIGN_FULL_TEXT_PROMPT',
    news_persian_full_rewrite_prompt: 'PERSIAN_FULL_TEXT_PROMPT',
  }, {
    sourceName: 'رسانه فارسی',
    title: 'جزئیات برنامه جدید توسعه شهری اعلام شد',
    text: 'این برنامه با هدف بهبود خدمات شهری و افزایش دسترسی شهروندان اجرا می‌شود و جزئیات آن امروز اعلام شد.',
    part: 1,
    totalParts: 1,
  });

  assert.match(requestBody.messages[0].content, /^PERSIAN_FULL_TEXT_PROMPT/);
  assert.match(requestBody.messages[0].content, /ارجاع لینک‌دار به منبع را جداگانه/);
  assert.equal(result, 'متن کامل بازنویسی‌شده با حفظ همه اطلاعات خبر.');
});

test('smart WordPress categorization only accepts an id from the destination site', async () => {
  let requestBody;
  const outbound = {
    safeRequest: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return gapGptResponse('{"category_id":22}');
    },
  };
  const client = new GapGptClient(outbound);
  const categoryId = await client.chooseWordPressCategory({
    gapgpt_base_url: 'https://gap.example/v1',
    gapgpt_api_key: 'secret',
    gapgpt_model_news_summary: 'gpt-4o-mini',
  }, {
    sourceName: 'رسانه فناوری',
    title: 'شرکت جدیدترین پردازنده خود را معرفی کرد',
    summary: 'این پردازنده برای رایانه‌های همراه عرضه می‌شود.',
    categories: [
      { id: 11, name: 'اقتصاد', slug: 'economy', parent: 0 },
      { id: 22, name: 'فناوری', slug: 'technology', parent: 0 },
    ],
  });

  assert.equal(categoryId, 22);
  assert.match(requestBody.messages[1].content, /22 \| فناوری/);

  outbound.safeRequest = async () => gapGptResponse('{"category_id":999}');
  await assert.rejects(() => client.chooseWordPressCategory({
    gapgpt_base_url: 'https://gap.example/v1',
    gapgpt_api_key: 'secret',
  }, {
    sourceName: 'رسانه', title: 'خبر', summary: 'خلاصه',
    categories: [
      { id: 11, name: 'اقتصاد', slug: 'economy', parent: 0 },
      { id: 22, name: 'فناوری', slug: 'technology', parent: 0 },
    ],
  }), /دسته‌بندی معتبری/);
});

test('newsroom publishes with the category selected from live WordPress categories', async () => {
  const article = {
    id: 'news-category-a',
    status: 'ready',
    wordpressPostUrl: null,
    originalUrl: 'https://source.example/story',
    canonicalUrl: 'https://source.example/story',
    sourceName: 'رسانه فناوری',
    originalTitle: 'عنوان اصلی',
    originalSummary: 'یک شرکت فناوری پردازنده جدید خود را معرفی کرد.',
    originalContent: 'متن کامل خبر',
    originalContentIsFull: true,
    contentFa: 'متن کامل خبر',
    featuredImageUrl: null,
    titleFa: 'معرفی پردازنده جدید',
    summaryFa: 'یک شرکت فناوری پردازنده جدید خود را معرفی کرد.',
  };
  let categoryInput;
  let publishInput;
  const categories = [
    { id: 11, name: 'اقتصاد', slug: 'economy', parent: 0 },
    { id: 22, name: 'فناوری', slug: 'technology', parent: 0 },
  ];
  const prisma = {
    newsArticle: {
      findFirst: async () => article,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => ({ ...article, ...data }),
    },
  };
  const settings = { getRaw: async () => ({ wp_category_id: '11', wp_categories: JSON.stringify(categories) }) };
  const gapGpt = {
    chooseWordPressCategory: async (_settings, input) => { categoryInput = input; return 22; },
  };
  const sourceReader = { readArticleOrFallback: async () => ({ text: article.originalContent, featuredImageUrl: null, contentSource: 'page' }) };
  const wordpress = {
    validateSettings: () => undefined,
    categories: async () => categories,
    publish: async (_settings, input) => { publishInput = input; return { postId: '42', url: 'https://destination.example/post' }; },
  };
  const newsroom = new NewsroomService(prisma, settings, gapGpt, sourceReader, wordpress, {}, integrationHealth, workflow, platformFeeds, usageTracking, destinationCategories);

  await newsroom.publish('tenant-a', article.id);

  assert.deepEqual(categoryInput.categories, categories);
  assert.equal(publishInput.categoryId, 22);
  assert.equal(publishInput.excerpt, article.summaryFa);
  assert.match(publishInput.content, /<p>.*<a href="https:\/\/source\.example\/story"[^>]*>رسانه فناوری<\/a>.*متن کامل خبر<\/p>/);
  assert.doesNotMatch(publishInput.content, /<hr>|<strong>منبع:/);
});

test('newsroom never publishes an RSS summary as the full WordPress article', async () => {
  const article = {
    id: 'news-summary-only', status: 'ready', wordpressPostUrl: null,
    originalUrl: 'https://www.isna.ir/news/example', canonicalUrl: 'https://www.isna.ir/news/example',
    sourceName: 'ایسنا', originalTitle: 'عنوان خبر', originalSummary: 'چکیده کوتاه خبر ایسنا',
    originalContent: 'چکیده کوتاه خبر ایسنا', originalContentIsFull: false,
    contentFa: '', featuredImageUrl: '', titleFa: 'عنوان فارسی', summaryFa: 'چکیده فارسی',
  };
  const prisma = {
    newsArticle: {
      findFirst: async () => article,
      updateMany: async () => ({ count: 1 }),
      update: async () => article,
    },
  };
  const sourceReader = {
    readArticleOrFallback: async () => ({ text: article.originalSummary, featuredImageUrl: '', contentSource: 'feed', isFullText: false }),
  };
  const wordpress = { validateSettings: () => undefined, categories: async () => [] };
  const newsroom = new NewsroomService(prisma, { getRaw: async () => ({}) }, {}, sourceReader, wordpress, {}, integrationHealth, workflow, platformFeeds, usageTracking, destinationCategories);

  await assert.rejects(() => newsroom.translateFull('tenant-a', article.id), /فقط چکیده خبر را ارائه می‌کند/);
  await assert.rejects(() => newsroom.publish('tenant-a', article.id), /ترجمه کامل/);
});

test('news automation durably queues social routing instead of publishing to WordPress', async () => {
  const queuedJobs = [];
  const prisma = {
    newsArticle: {
      findMany: async () => [{ id: 'news-a' }],
    },
  };
  const settings = {
    getRaw: async () => ({
      news_auto_prepare: 'false',
      news_auto_publish: 'true',
      news_auto_send_social: 'true',
    }),
  };
  const jobs = {
    enqueue: async (job) => {
      queuedJobs.push(job);
      return { created: true, job: { id: 'job-a' } };
    },
  };
  const newsroom = new NewsroomService(prisma, settings, {}, {}, {}, jobs, integrationHealth, workflow, platformFeeds, usageTracking, destinationCategories);

  const result = await newsroom.queueAutomation('tenant-a', 3);

  assert.equal(queuedJobs.length, 1);
  assert.equal(queuedJobs[0].type, 'news.send-social');
  assert.deepEqual(queuedJobs[0].payload, { articleId: 'news-a' });
  assert.equal(queuedJobs[0].dedupeKey, 'news:news-a:send-social');
  assert.deepEqual(result, { prepared: 0, sentToSocial: 1, published: 0 });
});

test('automatic social publishing records delivery and does not resend to the same network', async () => {
  let bridgeCalls = 0;
  const article = {
    id: 'social-a', status: 'ready', title: 'تیتر', link: 'https://news.example/story', shortUrl: null,
    captionText: 'کپشن آماده', author: 'نویسنده', category: 'خبر', readingTime: 1,
    leadText: 'لید', summaryText: 'خلاصه', featuredImageUrl: 'https://news.example/image.jpg',
    telegramSentAt: null, instagramSentAt: null, linkedinSentAt: null, facebookSentAt: null,
    feed: { name: 'رسانه' },
  };
  const prisma = {
    socialArticle: {
      findFirst: async () => article,
      update: async ({ data }) => Object.assign(article, data),
    },
  };
  const settings = {
    getRaw: async () => ({
      telegram_bot_token: 'token',
      telegram_chat_id: '@channel',
      telegram_bridge_url: 'https://bridge.example',
      social_caption_template: '{title}\n\n{summary}',
    }),
  };
  const outbound = {
    proxyImage: async () => ({ buffer: TEST_PNG, contentType: 'image/png' }),
    safeRequest: async () => {
      bridgeCalls++;
      return { ok: true, status: 200, json: () => ({ ok: true }) };
    },
  };
  const publisher = new SocialNetworkPublisherService(
    prisma,
    settings,
    outbound,
    { success: async () => { throw new Error('health store unavailable'); }, failure: async () => ({}) },
    { record: async () => { throw new Error('workflow store unavailable'); } },
    usageTracking,
  );

  const first = await publisher.publishAutomatically('tenant-a', article.id, ['telegram', 'telegram']);
  const second = await publisher.publishAutomatically('tenant-a', article.id, ['telegram']);

  assert.deepEqual(first.published, ['telegram']);
  assert.deepEqual(second.published, []);
  assert.equal(bridgeCalls, 1);
  assert.ok(article.telegramSentAt instanceof Date);
});

test('social automation durably queues a cover with the selected default template', async () => {
  const queuedJobs = [];
  const prisma = {
    socialArticle: {
      findMany: async () => [{ id: 'social-cover-a' }],
    },
  };
  const settings = { getRaw: async () => ({
    social_auto_prepare: 'false',
    social_auto_generate_image: 'true',
    social_auto_image_template_id: 'template-telegram',
    social_auto_publish_telegram: 'false',
  }) };
  const jobs = { enqueue: async (job) => { queuedJobs.push(job); return { created: true, job: { id: 'job-cover' } }; } };
  const studio = new SocialStudioService(prisma, settings, {}, {}, jobs, integrationHealth, workflow, usageTracking);

  const result = await studio.queueAutomation('tenant-a', 3);

  assert.equal(queuedJobs.length, 1);
  assert.equal(queuedJobs[0].type, 'social.cover');
  assert.deepEqual(queuedJobs[0].payload, { articleId: 'social-cover-a', templateId: 'template-telegram' });
  assert.equal(queuedJobs[0].dedupeKey, 'social:social-cover-a:cover:template-telegram');
  assert.deepEqual(result, { prepared: 0, generated: 1, published: 0 });
});

test('social automation queues featured-image publishing after cover generation fails', async () => {
  const queuedJobs = [];
  const prisma = {
    socialArticle: {
      findFirst: async () => ({
        id: 'social-fallback-a',
        featuredImageUrl: 'https://source.example/featured.jpg',
        telegramSentAt: null,
        instagramSentAt: new Date(),
        linkedinSentAt: null,
        facebookSentAt: null,
      }),
    },
  };
  const settings = { getRaw: async () => ({
    social_auto_publish_telegram: 'true',
    social_auto_publish_instagram: 'true',
    social_auto_publish_linkedin: 'false',
    social_auto_publish_facebook: 'false',
  }) };
  const jobs = { enqueue: async (job) => { queuedJobs.push(job); return { created: true, job: { id: 'job-fallback' } }; } };
  const studio = new SocialStudioService(prisma, settings, {}, {}, jobs, integrationHealth, workflow, usageTracking);

  const result = await studio.queueFeaturedImageFallback('tenant-a', 'social-fallback-a');

  assert.equal(result.queued, true);
  assert.deepEqual(result.networks, ['telegram']);
  assert.equal(queuedJobs.length, 1);
  assert.equal(queuedJobs[0].type, 'social.publish');
  assert.deepEqual(queuedJobs[0].payload, {
    articleId: 'social-fallback-a',
    networks: ['telegram'],
    imageFallback: 'featured',
  });
  assert.equal(queuedJobs[0].dedupeKey, 'social:social-fallback-a:publish:telegram');
});

test('server cover renderer stores the selected visual template result on the article', async () => {
  let capturedHtml = '';
  let updateData;
  const article = {
    id: 'social-cover-b', tenantId: 'tenant-a', title: 'تیتر اجتماعی', link: 'https://source.example/story',
    shortUrl: null, leadText: 'لید کوتاه', author: 'نویسنده', category: 'خبر', readingTime: 2,
    summaryText: 'خلاصه مطلب', featuredImageUrl: null, authorImageUrl: null, feed: { name: 'رسانه نمونه' },
  };
  const prisma = { socialArticle: {
    findFirst: async () => article,
    update: async ({ data }) => { updateData = data; return { ...article, ...data }; },
  } };
  const publisher = { storeGeneratedMedia: async () => ({ filename: 'generated.png', url: '/api/publishing/social/media/generated.png' }) };
  const renderer = new SocialCoverRendererService(prisma, {}, {}, publisher, usageTracking);
  renderer.queuedScreenshot = async (html) => { capturedHtml = html; return Buffer.from('png'); };
  const settings = { social_image_templates: JSON.stringify({
    version: 1, defaultTemplateId: 'default', templates: [
      { id: 'default', name: 'پیش‌فرض', template: { version: 1, width: 1080, height: 1080, backgroundColor: '#000000', layers: [] } },
      { id: 'telegram', name: 'تلگرام', template: { version: 1, width: 1080, height: 1080, backgroundColor: '#112233', layers: [
        { id: 'title', type: 'text', binding: 'title', x: 5, y: 5, width: 90, height: 30, visible: true, opacity: 100 },
      ] } },
    ],
  }) };

  await renderer.generate('tenant-a', article.id, settings, 'telegram');

  assert.match(capturedHtml, /تیتر اجتماعی/);
  assert.match(capturedHtml, /background:#112233/);
  assert.equal(updateData.generatedImageTemplateId, 'telegram');
  assert.equal(updateData.generatedImageUrl, '/api/publishing/social/media/generated.png');
});

test('automatic publisher prefers a generated cover over the source image', async () => {
  let sourceImageCalls = 0;
  let bridgeCalls = 0;
  const article = {
    id: 'social-generated', status: 'ready', featuredImageUrl: 'https://source.example/image.jpg',
    generatedImageUrl: '/api/publishing/social/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', captionText: 'کپشن',
    telegramSentAt: null, instagramSentAt: null, linkedinSentAt: null, facebookSentAt: null,
    title: 'تیتر', link: 'https://source.example/story', author: 'نویسنده', category: 'خبر',
    readingTime: 1, leadText: 'لید', summaryText: 'خلاصه', shortUrl: null, feed: { name: 'رسانه' },
  };
  const prisma = { socialArticle: {
    findFirst: async () => article,
    update: async ({ data }) => Object.assign(article, data),
  } };
  const settings = { getRaw: async () => ({ telegram_bot_token: 'token', telegram_chat_id: '@channel', telegram_bridge_url: 'https://bridge.example' }) };
  const outbound = {
    proxyImage: async () => { sourceImageCalls += 1; return { buffer: TEST_PNG, contentType: 'image/png' }; },
    safeRequest: async () => { bridgeCalls += 1; return { ok: true, status: 200, json: () => ({ ok: true }) }; },
  };
  const publisher = new SocialNetworkPublisherService(prisma, settings, outbound, integrationHealth, workflow, usageTracking);
  publisher.publicMedia = async () => ({ buffer: Buffer.from('generated'), contentType: 'image/png' });

  const result = await publisher.publishAutomatically('tenant-a', article.id, ['telegram']);

  assert.deepEqual(result.published, ['telegram']);
  assert.equal(sourceImageCalls, 0);
  assert.equal(bridgeCalls, 1);
});

test('automatic publisher falls back to the featured image when generated media is unavailable', async () => {
  let sourceImageCalls = 0;
  let bridgeCalls = 0;
  let bridgePhoto = '';
  const article = {
    id: 'social-generated-fallback', status: 'ready', featuredImageUrl: 'https://source.example/image.jpg',
    generatedImageUrl: '/api/publishing/social/media/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png',
    generatedImageTemplateId: 'template-a', captionText: 'کپشن',
    telegramSentAt: null, instagramSentAt: null, linkedinSentAt: null, facebookSentAt: null,
    title: 'تیتر', link: 'https://source.example/story', author: 'نویسنده', category: 'خبر',
    readingTime: 1, leadText: 'لید', summaryText: 'خلاصه', shortUrl: null, feed: { name: 'رسانه' },
  };
  const prisma = { socialArticle: {
    findFirst: async () => article,
    update: async ({ data }) => Object.assign(article, data),
  } };
  const settings = { getRaw: async () => ({ telegram_bot_token: 'token', telegram_chat_id: '@channel', telegram_bridge_url: 'https://bridge.example' }) };
  const outbound = {
    proxyImage: async () => { sourceImageCalls += 1; return { buffer: TEST_PNG, contentType: 'image/png' }; },
    safeRequest: async (_url, options) => { bridgeCalls += 1; bridgePhoto = JSON.parse(options.body).photo_base64; return { ok: true, status: 200, json: () => ({ ok: true }) }; },
  };
  const publisher = new SocialNetworkPublisherService(prisma, settings, outbound, integrationHealth, workflow, usageTracking);
  publisher.publicMedia = async () => { throw new Error('generated file is unavailable'); };

  const result = await publisher.publishAutomatically('tenant-a', article.id, ['telegram']);

  assert.deepEqual(result.published, ['telegram']);
  assert.equal(sourceImageCalls, 1);
  assert.equal(bridgeCalls, 1);
  assert.equal(Buffer.from(bridgePhoto, 'base64').subarray(0, 3).toString('hex'), 'ffd8ff');
  assert.equal(article.generatedImageUrl, null);
  assert.equal(article.generatedImageTemplateId, null);
});

test('explicit featured-image fallback bypasses a stale generated cover', async () => {
  let generatedImageCalls = 0;
  let featuredImageCalls = 0;
  const article = {
    id: 'social-forced-fallback', status: 'ready', featuredImageUrl: 'https://source.example/image.jpg',
    generatedImageUrl: '/api/publishing/social/media/cccccccc-cccc-cccc-cccc-cccccccccccc.png', captionText: 'کپشن',
    telegramSentAt: null, instagramSentAt: null, linkedinSentAt: null, facebookSentAt: null,
    title: 'تیتر', link: 'https://source.example/story', author: 'نویسنده', category: 'خبر',
    readingTime: 1, leadText: 'لید', summaryText: 'خلاصه', shortUrl: null, feed: { name: 'رسانه' },
  };
  const prisma = { socialArticle: {
    findFirst: async () => article,
    update: async ({ data }) => Object.assign(article, data),
  } };
  const settings = { getRaw: async () => ({ telegram_bot_token: 'token', telegram_chat_id: '@channel', telegram_bridge_url: 'https://bridge.example' }) };
  const outbound = {
    proxyImage: async () => { featuredImageCalls += 1; return { buffer: TEST_PNG, contentType: 'image/png' }; },
    safeRequest: async () => ({ ok: true, status: 200, json: () => ({ ok: true }) }),
  };
  const publisher = new SocialNetworkPublisherService(prisma, settings, outbound, integrationHealth, workflow, usageTracking);
  publisher.publicMedia = async () => { generatedImageCalls += 1; return { buffer: Buffer.from('generated'), contentType: 'image/png' }; };

  const result = await publisher.publishAutomatically('tenant-a', article.id, ['telegram'], true);

  assert.deepEqual(result.published, ['telegram']);
  assert.equal(generatedImageCalls, 0);
  assert.equal(featuredImageCalls, 1);
});
