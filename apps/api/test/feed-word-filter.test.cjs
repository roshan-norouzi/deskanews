const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesWordFilters, parseWordList, entryFilterText } = require('../dist/modules/smart-publishing/feed-word-filter');

test('parseWordList splits Persian comma separated words', () => {
  assert.deepEqual(parseWordList('فناوری، اقتصاد, ورزش'), ['فناوری', 'اقتصاد', 'ورزش']);
});

test('matchesWordFilters requires include words when configured', () => {
  assert.equal(matchesWordFilters('خبر فناوری امروز', ['فناوری'], []), true);
  assert.equal(matchesWordFilters('خبر ورزشی', ['فناوری'], []), false);
});

test('matchesWordFilters rejects excluded words', () => {
  assert.equal(matchesWordFilters('خبر ورزشی', [], ['ورزش']), false);
  assert.equal(matchesWordFilters('خبر اقتصادی', [], ['ورزش']), true);
});

test('entryFilterText combines title summary and content', () => {
  assert.equal(entryFilterText({ title: 'تیتر', summary: 'خلاصه', content: 'متن' }), 'تیتر خلاصه متن');
});
