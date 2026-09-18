require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { CreateFeedDto } = require('../dist/modules/smart-publishing/dto/feed.dto');
const { CreatePlatformFeedDto } = require('../dist/platform/admin/dto/platform-feed.dto');

test('CreateFeedDto accepts telegram @username before service normalization', async () => {
  const dto = Object.assign(new CreateFeedDto(), {
    name: 'کانال',
    url: '@samplechannel',
    sourceType: 'telegram',
    purpose: 'news-room',
  });
  const errors = await validate(dto);
  assert.equal(errors.length, 0);
});

test('CreateFeedDto accepts t.me/username for telegram sources', async () => {
  const dto = Object.assign(new CreateFeedDto(), {
    name: 'کانال',
    url: 't.me/samplechannel',
    sourceType: 'telegram',
    purpose: 'news-room',
  });
  const errors = await validate(dto);
  assert.equal(errors.length, 0);
});

test('CreateFeedDto rejects @username when sourceType is rss', async () => {
  const dto = Object.assign(new CreateFeedDto(), {
    name: 'فید',
    url: '@samplechannel',
    sourceType: 'rss',
    purpose: 'news-room',
  });
  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === 'url'));
});

test('CreatePlatformFeedDto accepts telegram @username', async () => {
  const dto = Object.assign(new CreatePlatformFeedDto(), {
    name: 'کانال',
    url: '@samplechannel',
    sourceType: 'telegram',
  });
  const errors = await validate(dto);
  assert.equal(errors.length, 0);
});
