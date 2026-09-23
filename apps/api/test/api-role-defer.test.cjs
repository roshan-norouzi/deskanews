require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { NewsroomService } = require('../dist/modules/smart-publishing/newsroom.service');
const { SocialCoverRendererService } = require('../dist/modules/smart-publishing/social-cover-renderer.service');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('api role enqueues feed fetch and does not read the source', async () => {
  let read = false;
  const queued = [];
  const prisma = {
    newsFeed: {
      findFirst: async () => ({
        id: 'feed-a',
        tenantId: 'tenant-a',
        purpose: 'news-room',
        enabled: true,
        url: 'https://example.com/rss',
      }),
    },
  };
  const newsroom = new NewsroomService(
    prisma,
    {},
    {},
    { readSourceWithMeta: async () => { read = true; return { entries: [], resolvedFeedUrl: '' }; } },
    {},
    { enqueue: async (job) => { queued.push(job); return { job: { id: 'job-1' }, created: true }; } },
    {},
    {},
    {},
    {},
    {},
    { runsHeavyWorkInline: () => false },
  );

  const result = await newsroom.fetchFeed('tenant-a', 'feed-a');

  assert.equal(read, false);
  assert.equal(result.queued, true);
  assert.equal(queued[0].type, 'news.feed.fetch');
  assert.equal(queued[0].payload.feedId, 'feed-a');
});

test('Playwright cover rendering is only invoked from the worker job handler', () => {
  const processor = readFileSync(join(__dirname, '../src/modules/smart-publishing/publishing-automation.processor.ts'), 'utf8');
  const controller = readFileSync(join(__dirname, '../src/modules/smart-publishing/smart-publishing.controller.ts'), 'utf8');
  assert.match(processor, /this\.covers\.generate\(/);
  assert.equal(controller.includes('covers.generate'), false);
  assert.equal(controller.includes('playwright'), false);
  assert.equal(typeof SocialCoverRendererService, 'function');
});
