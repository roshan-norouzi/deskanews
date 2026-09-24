const test = require('node:test');
const assert = require('node:assert/strict');
const { inferFeedTopicLabel, DEFAULT_FEED_TOPIC_LABELS } = require('@deska/shared');

test('default topic labels include the editorial set', () => {
  assert.deepEqual([...DEFAULT_FEED_TOPIC_LABELS], ['عمومی', 'سیاسی', 'اقتصادی', 'اجتماعی', 'ورزشی', 'فرهنگی و هنری', 'بین‌المللی']);
});

test('known sources receive a topic label from their name', () => {
  assert.equal(inferFeedTopicLabel('ورزش۳', 'https://www.varzesh3.com/rss', 'media-domestic'), 'ورزشی');
  assert.equal(inferFeedTopicLabel('سازمان بورس', 'https://www.seo.ir', 'orgs-companies'), 'اقتصادی');
  assert.equal(inferFeedTopicLabel('BBC News', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'media-international'), 'بین‌المللی');
  assert.equal(inferFeedTopicLabel('خبرگزاری ایسنا', 'https://www.isna.ir/rss', 'media-domestic'), 'عمومی');
});
