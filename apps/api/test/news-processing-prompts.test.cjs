require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_NEWS_PROCESSING_PROMPTS,
  DEFAULT_NEWS_SUMMARY_PROMPT,
} = require('../dist/modules/smart-publishing/news-processing-prompts');
const { GapGptClient } = require('../dist/modules/smart-publishing/gapgpt.client');

function gapGptResponse(content) {
  return {
    ok: true,
    status: 200,
    json: () => ({ choices: [{ message: { content } }] }),
  };
}

test('default news processing prompts are defined for all four fields', () => {
  assert.ok(DEFAULT_NEWS_SUMMARY_PROMPT.includes('تیتر'));
  assert.equal(Object.keys(DEFAULT_NEWS_PROCESSING_PROMPTS).length, 4);
  for (const value of Object.values(DEFAULT_NEWS_PROCESSING_PROMPTS)) {
    assert.ok(String(value).trim().length > 120);
  }
});

test('default news processing prompts mention editorial normalization of proper names', () => {
  assert.match(DEFAULT_NEWS_SUMMARY_PROMPT, /ویراستاری/);
  assert.match(DEFAULT_NEWS_SUMMARY_PROMPT, /پاریس‌سن‌ژرمن/);
});

test('summarize falls back to default foreign prompt when setting is empty', async () => {
  let requestBody;
  const outbound = {
    safeRequest: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return gapGptResponse('{"title":"عنوان فارسی","summary":"خلاصه فارسی."}');
    },
  };
  const client = new GapGptClient(outbound);
  await client.summarize({
    gapgpt_base_url: 'https://gap.example/v1',
    gapgpt_api_key: 'secret',
  }, {
    sourceName: 'Foreign media',
    title: 'Government announces a new economic programme',
    summary: 'The programme is intended to support production and increase investment.',
  });

  assert.equal(requestBody.messages[0].content, DEFAULT_NEWS_SUMMARY_PROMPT);
});
