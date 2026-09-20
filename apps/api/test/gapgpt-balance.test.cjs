require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { GapGptClient } = require('../dist/modules/smart-publishing/gapgpt.client');

function usageResponse(body) {
  return {
    ok: true,
    status: 200,
    json: () => body,
  };
}

test('accountBalance reports not configured when credentials are missing', async () => {
  const client = new GapGptClient({ safeRequest: async () => usageResponse({}) });
  const result = await client.accountBalance({ gapgpt_base_url: '', gapgpt_api_key: '' });
  assert.equal(result.configured, false);
  assert.match(result.message ?? '', /پیکربندی نشده/);
});

test('accountBalance parses remaining tokens from usage endpoint', async () => {
  const client = new GapGptClient({
    safeRequest: async (url) => {
      assert.match(String(url), /\/usage$/);
      return usageResponse({ used_tokens: 187350, remaining: 262650, billing_period: '1403/04' });
    },
  });
  const result = await client.accountBalance({
    gapgpt_base_url: 'https://gapgpt.app/api/v1',
    gapgpt_api_key: 'secret',
  });
  assert.equal(result.configured, true);
  assert.equal(result.remaining, 262650);
  assert.equal(result.used, 187350);
  assert.equal(result.unitLabel, 'توکن');
  assert.equal(result.billingPeriod, '1403/04');
});

test('accountBalance returns graceful error when usage endpoint fails', async () => {
  const client = new GapGptClient({
    safeRequest: async () => ({
      ok: false,
      status: 403,
      json: () => ({ error: { message: 'invalid key' } }),
    }),
  });
  const result = await client.accountBalance({
    gapgpt_base_url: 'https://gapgpt.app/api/v1',
    gapgpt_api_key: 'bad-key',
  });
  assert.equal(result.configured, true);
  assert.equal(result.remaining, null);
  assert.match(result.message ?? '', /invalid key/);
});
