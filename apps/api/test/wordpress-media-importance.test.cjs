require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { WordPressMediaService } = require('../dist/modules/smart-publishing/wordpress-media.service');

test('WordPress media access is denied by default without contacting WordPress', async () => {
  let contacted = false;
  const service = new WordPressMediaService(
    {},
    { getRaw: async () => ({ wp_media_management_enabled: 'false' }) },
    { listPosts: async () => { contacted = true; } },
    {},
    {},
  );

  await assert.rejects(() => service.listPosts('tenant-a', {}), /مدیریت نوشته‌های WordPress غیرفعال است/);
  assert.equal(contacted, false);
});

test('importance queue skips manual and unchanged evaluations and queues stale published posts', async () => {
  const queued = [];
  const posts = [
    { id: 1, modified: '2026-09-10T10:00:00Z' },
    { id: 2, modified: '2026-09-10T10:00:00Z' },
    { id: 3, modified: '2026-09-10T10:00:00Z' },
  ];
  const prisma = { wordPressNewsEvaluation: { findMany: async () => [
    { wordpressPostId: 1, wordpressModifiedAt: new Date('2026-09-10T10:00:00Z'), source: 'ai' },
    { wordpressPostId: 2, wordpressModifiedAt: new Date('2026-01-01T00:00:00Z'), source: 'manual' },
  ] } };
  const service = new WordPressMediaService(
    prisma,
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true' }) },
    { listPosts: async () => ({ posts }), importanceTagIds: async () => ({ important: null, normal: null }) },
    {},
    { enqueue: async (job) => { queued.push(job); return { created: true }; } },
  );

  const result = await service.queueEvaluations('tenant-a', 10);

  assert.equal(result.queued, 1);
  assert.equal(queued[0].type, 'wordpress.importance.evaluate');
  assert.deepEqual(queued[0].payload, { postId: '3' });
});

test('automatic importance queue remains off until the owner enables it', async () => {
  let contacted = false;
  const service = new WordPressMediaService(
    {},
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true', wp_news_importance_auto_enabled: 'false' }) },
    { listPosts: async () => { contacted = true; } },
    {},
    {},
  );

  const result = await service.queueEvaluations('tenant-a', 10, true);

  assert.equal(result.queued, 0);
  assert.equal(result.reason, 'automatic-disabled');
  assert.equal(contacted, false);
});

test('importance queue respects the configured batch size', async () => {
  const queued = [];
  const posts = [1, 2, 3].map((id) => ({ id, modified: `2026-09-10T10:00:0${id}Z`, tags: [] }));
  const service = new WordPressMediaService(
    { wordPressNewsEvaluation: { findMany: async () => [] } },
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true', wp_news_importance_batch_size: '2' }) },
    { listPosts: async () => ({ posts, totalPages: 1 }), importanceTagIds: async () => ({ important: null, normal: null }) },
    {},
    { enqueue: async (job) => { queued.push(job); return { created: true }; } },
  );

  const result = await service.queueEvaluations('tenant-a');

  assert.equal(result.queued, 2);
  assert.equal(queued.length, 2);
});

test('reevaluate all starts one durable coordinator job', async () => {
  let coordinator;
  const service = new WordPressMediaService(
    {},
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true' }) },
    {},
    {},
    { enqueue: async (job) => { coordinator = job; return { created: true }; } },
  );

  const result = await service.queueAllReevaluations('tenant-a');

  assert.equal(result.started, true);
  assert.equal(coordinator.type, 'wordpress.importance.reevaluate-all');
  assert.equal(coordinator.dedupeKey, 'wordpress:importance:reevaluate-all');
  assert.ok(coordinator.payload.batchId);
});

test('reevaluate all queues every published non-manual post across WordPress pages', async () => {
  const queued = [];
  const service = new WordPressMediaService(
    { wordPressNewsEvaluation: { findMany: async ({ where }) => where.wordpressPostId.in.includes(2) ? [{ wordpressPostId: 2, source: 'manual' }] : [] } },
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true' }) },
    { listPosts: async (_settings, query) => query.page === 1
      ? { posts: [{ id: 1 }, { id: 2 }], totalPages: 2 }
      : { posts: [{ id: 3 }], totalPages: 2 } },
    {},
    { enqueue: async (job) => { queued.push(job); return { created: true }; } },
  );

  const result = await service.reevaluateAll('tenant-a', 'batch-1');

  assert.deepEqual(result, { queued: 2, scanned: 3, preservedManual: 1 });
  assert.deepEqual(queued.map((job) => job.payload.postId), ['1', '3']);
  assert.ok(queued.every((job) => job.type === 'wordpress.importance.evaluate'));
});

test('background reevaluation never overwrites a manual editorial decision', async () => {
  let contacted = false;
  const service = new WordPressMediaService(
    { wordPressNewsEvaluation: { findUnique: async () => ({ source: 'manual' }) } },
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true' }) },
    { getPost: async () => { contacted = true; } },
    { evaluateNewsImportance: async () => { contacted = true; } },
    {},
  );

  const result = await service.evaluate('tenant-a', 72, true);

  assert.deepEqual(result, { skipped: true, reason: 'manual-decision-protected' });
  assert.equal(contacted, false);
});

test('background reevaluation skips a WordPress post deleted after it was queued', async () => {
  const service = new WordPressMediaService(
    { wordPressNewsEvaluation: { findUnique: async () => null, findMany: async () => [] } },
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true' }) },
    { getPost: async () => null },
    { evaluateNewsImportance: async () => { throw new Error('AI must not run'); } },
    {},
  );

  const result = await service.evaluate('tenant-a', 404, true);

  assert.deepEqual(result, { skipped: true, reason: 'wordpress-post-missing' });
});

test('AI importance evaluation receives balanced recent editorial decisions', async () => {
  let aiInput;
  const post = { id: 72, status: 'publish', title: 'خبر تازه', excerpt: 'خلاصه', content: 'متن', link: 'https://news.example/72', modified: '2026-09-10T10:00:00Z', tags: [], categories: [] };
  const manual = [
    { postTitle: 'خبر مهم قبلی', importance: 'important', reason: 'اثر گسترده بر صنعت' },
    { postTitle: 'خبر مهم دوم', importance: 'important', reason: '' },
    { postTitle: 'خبر عادی قبلی', importance: 'normal', reason: 'رویداد روزمره' },
  ];
  const prisma = { wordPressNewsEvaluation: {
    findMany: async (args) => {
      assert.equal(args.where.source, 'manual');
      return manual;
    },
    upsert: async (args) => args.create,
  } };
  const service = new WordPressMediaService(
    prisma,
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true' }) },
    { getPost: async () => post, setImportanceTag: async () => post },
    { evaluateNewsImportance: async (_settings, input) => { aiInput = input; return { importance: 'normal', score: 30, reason: 'اثر محدود', newsValues: [] }; } },
    {},
  );

  await service.evaluate('tenant-a', 72);

  assert.deepEqual(aiInput.editorialExamples.map((item) => item.importance), ['normal', 'important', 'important']);
  assert.equal(aiInput.editorialExamples[0].title, 'خبر عادی قبلی');
  assert.equal(aiInput.editorialExamples[0].reason, 'رویداد روزمره');
});

test('importance automation status proves AI results and queue state without mixing manual decisions', async () => {
  const latest = { wordpressPostId: 15, postTitle: 'خبر ارزیابی‌شده', importance: 'normal', score: 42, reason: 'اثر محدود', evaluatedAt: new Date('2026-09-10T13:00:00Z') };
  const prisma = {
    wordPressNewsEvaluation: {
      groupBy: async () => [
        { source: 'ai', importance: 'normal', _count: { _all: 3 } },
        { source: 'manual', importance: 'important', _count: { _all: 2 } },
      ],
      findFirst: async () => latest,
    },
    automationJob: {
      groupBy: async () => [
        { status: 'queued', _count: { _all: 1 } },
        { status: 'completed', _count: { _all: 3 } },
      ],
      findFirst: async (args) => args.where.status === 'dead' ? null : { id: 'job-1', status: 'completed' },
    },
  };
  const service = new WordPressMediaService(
    prisma,
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true', wp_news_importance_auto_enabled: 'true', wp_news_importance_interval_minutes: '7' }) },
    {}, {}, {},
  );

  const result = await service.automationStatus('tenant-a');

  assert.equal(result.automaticEnabled, true);
  assert.equal(result.intervalMinutes, 7);
  assert.deepEqual(result.evaluations, { ai: 3, manual: 2, important: 2, normal: 3, total: 5 });
  assert.equal(result.jobs.queued, 1);
  assert.equal(result.jobs.completed, 3);
  assert.equal(result.latestAiEvaluation.score, 42);
  assert.equal(result.latestAiEvaluation.evaluatedAt, '2026-09-10T13:00:00.000Z');
});

test('editorial memory summary aggregates learned patterns without exposing individual posts', async () => {
  const prisma = {
    wordPressNewsEvaluation: {
      findMany: async () => [
        { importance: 'important', reason: 'اثر مستقیم و گسترده بر صنعت', newsValues: ['impact', 'magnitude'], updatedAt: new Date('2026-09-10T14:00:00Z') },
        { importance: 'important', reason: 'اثر مستقیم و گسترده بر صنعت', newsValues: ['impact'], updatedAt: new Date('2026-09-10T13:00:00Z') },
        { importance: 'important', reason: 'تصمیم سردبیر ثبت شد؛ استخراج دلایل اهمیت در صف پردازش است.', newsValues: [], updatedAt: new Date('2026-09-10T12:00:00Z') },
        { importance: 'normal', reason: 'این خبر عادی است', newsValues: [], updatedAt: new Date('2026-09-10T11:00:00Z') },
      ],
    },
    automationJob: {
      groupBy: async () => [
        { status: 'queued', _count: { _all: 1 } },
        { status: 'dead', _count: { _all: 2 } },
      ],
    },
  };
  const service = new WordPressMediaService(
    prisma,
    { getRaw: async () => ({ wp_news_importance_memory_examples: '12' }) },
    {}, {}, {},
  );

  const result = await service.editorialMemorySummary('tenant-a');

  assert.deepEqual(result.decisions, { total: 4, important: 3, normal: 1 });
  assert.deepEqual(result.learnedRules, [{ text: 'اثر مستقیم و گسترده بر صنعت', count: 2 }]);
  assert.deepEqual(result.newsValues, [{ key: 'impact', count: 2 }, { key: 'magnitude', count: 1 }]);
  assert.equal(result.activeExamples, 4);
  assert.deepEqual(result.learningJobs, { pending: 1, failed: 2 });
  assert.equal(result.lastLearnedAt, '2026-09-10T14:00:00.000Z');
  assert.equal(JSON.stringify(result).includes('postTitle'), false);
  assert.equal(JSON.stringify(result).includes('wordpressPostId'), false);
});

test('manual importance correction is written to WordPress and DESKA together', async () => {
  let wordpressImportance;
  let upsertArgs;
  let learningJob;
  const post = { id: 52, status: 'publish', title: 'خبر', excerpt: '', content: '', link: 'https://news.example/52', modified: '2026-09-10T10:00:00Z', tags: [], categories: [] };
  const prisma = { wordPressNewsEvaluation: { upsert: async (args) => { upsertArgs = args; return { ...args.create }; } } };
  const service = new WordPressMediaService(
    prisma,
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true' }) },
    { getPost: async () => post, setImportanceTag: async (_settings, _id, importance) => { wordpressImportance = importance; } },
    {},
    { enqueue: async (job) => { learningJob = job; return { created: true }; } },
  );

  const result = await service.override('tenant-a', 52, 'important');

  assert.equal(wordpressImportance, 'important');
  assert.equal(upsertArgs.create.importance, 'important');
  assert.equal(upsertArgs.create.source, 'manual');
  assert.match(upsertArgs.create.reason, /در صف پردازش/);
  assert.equal(learningJob.type, 'wordpress.importance.learn');
  assert.deepEqual(learningJob.payload, { postId: '52' });
  assert.equal(result.score, 100);
});

test('important editorial decisions are analyzed and stored only while the decision is still current', async () => {
  let updateArgs;
  const post = { id: 52, status: 'publish', title: '<b>تصمیم اقتصادی</b>', excerpt: 'خلاصه', content: 'متن خبر', link: 'https://news.example/52', modified: '2026-09-10T10:00:00Z', tags: [], categories: [] };
  const prisma = { wordPressNewsEvaluation: {
    findUnique: async () => ({ id: 'evaluation-52', source: 'manual', importance: 'important' }),
    updateMany: async (args) => { updateArgs = args; return { count: 1 }; },
  } };
  let analysisInput;
  const service = new WordPressMediaService(
    prisma,
    { getRaw: async () => ({ wp_news_importance_audience: 'مدیران صنعت' }) },
    { getPost: async () => post },
    { extractEditorialImportanceReasons: async (_settings, input) => { analysisInput = input; return { reason: 'اثر مستقیم بر بازار و دامنه ملی', newsValues: ['impact', 'magnitude'] }; } },
    {},
  );

  const result = await service.learnFromImportantDecision('tenant-a', '52');

  assert.equal(analysisInput.title, 'تصمیم اقتصادی');
  assert.equal(analysisInput.audience, 'مدیران صنعت');
  assert.deepEqual(updateArgs.where, { id: 'evaluation-52', tenantId: 'tenant-a', source: 'manual', importance: 'important' });
  assert.equal(updateArgs.data.reason, 'اثر مستقیم بر بازار و دامنه ملی');
  assert.deepEqual(updateArgs.data.newsValues, ['impact', 'magnitude']);
  assert.equal(result.updated, 1);
});

test('importance learning skips a stale job after the editor changes the decision', async () => {
  let analyzed = false;
  const service = new WordPressMediaService(
    { wordPressNewsEvaluation: { findUnique: async () => ({ id: 'evaluation-52', source: 'manual', importance: 'normal' }) } },
    { getRaw: async () => ({}) },
    { getPost: async () => ({ id: 52, title: 'خبر', excerpt: '', content: '' }) },
    { extractEditorialImportanceReasons: async () => { analyzed = true; } },
    {},
  );

  const result = await service.learnFromImportantDecision('tenant-a', '52');

  assert.equal(result.skipped, true);
  assert.equal(analyzed, false);
});

test('a tag correction made in WordPress becomes a protected manual decision', async () => {
  let persisted;
  let queued = false;
  const post = { id: 9, modified: '2026-09-10T10:00:00Z', title: 'خبر', link: 'https://news.example/9', tags: [22] };
  const prisma = { wordPressNewsEvaluation: {
    findMany: async () => [{ wordpressPostId: 9, wordpressModifiedAt: new Date('2026-01-01T00:00:00Z'), source: 'ai', importance: 'important' }],
    upsert: async (args) => { persisted = args; return args.create; },
  } };
  const service = new WordPressMediaService(
    prisma,
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true' }) },
    {
      listPosts: async () => ({ posts: [post] }),
      importanceTagIds: async () => ({ important: 21, normal: 22 }),
    },
    {},
    { enqueue: async () => { queued = true; return { created: true }; } },
  );

  const result = await service.queueEvaluations('tenant-a', 10);

  assert.equal(result.queued, 0);
  assert.equal(queued, false);
  assert.equal(persisted.create.importance, 'normal');
  assert.equal(persisted.create.source, 'manual');
});

test('opening media management remembers an importance decision made directly in WordPress', async () => {
  let persisted;
  let learningJob;
  const post = { id: 33, modified: '2026-09-10T10:00:00Z', title: 'تصمیم وردپرس', link: 'https://news.example/33', tags: [21] };
  const prisma = { wordPressNewsEvaluation: {
    findMany: async () => [],
    upsert: async (args) => { persisted = args; return args.create; },
  } };
  const service = new WordPressMediaService(
    prisma,
    { getRaw: async () => ({ wp_media_management_enabled: 'true', wp_news_importance_enabled: 'true', wp_news_importance_auto_enabled: 'false' }) },
    {
      listPosts: async () => ({ posts: [post], page: 1, perPage: 20, total: 1, totalPages: 1 }),
      importanceTagIds: async () => ({ important: 21, normal: 22 }),
    },
    {},
    { enqueue: async (job) => { learningJob = job; return { created: true }; } },
  );

  const result = await service.listPosts('tenant-a', {});

  assert.equal(result.posts[0].importanceEvaluation.importance, 'important');
  assert.equal(persisted.create.importance, 'important');
  assert.equal(persisted.create.source, 'manual');
  assert.equal(learningJob.type, 'wordpress.importance.learn');
});
