const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWorkbook,
  parseBooleanCell,
  parseWorkbookRows,
  PLATFORM_BULK_COLUMNS,
} = require('../dist/modules/smart-publishing/feed-bulk-xlsx');

test('workbook round-trip keeps platform feed rows', () => {
  const buffer = buildWorkbook(PLATFORM_BULK_COLUMNS, [{
    id: 'feed-1',
    name: 'خبرگزاری نمونه',
    url: 'https://example.com/rss',
    sourceType: 'rss',
    sourceLanguage: 'fa',
    catalogGroup: 'media-domestic',
    enabled: true,
  }], ['راهنما']);
  const rows = parseWorkbookRows(buffer, PLATFORM_BULK_COLUMNS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].values.id, 'feed-1');
  assert.equal(rows[0].values.name, 'خبرگزاری نمونه');
  assert.equal(rows[0].values.url, 'https://example.com/rss');
});

test('parseBooleanCell accepts Persian yes/no labels', () => {
  assert.equal(parseBooleanCell('بله'), true);
  assert.equal(parseBooleanCell('خیر'), false);
  assert.equal(parseBooleanCell(''), false);
});
