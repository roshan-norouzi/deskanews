const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { redactPublishingSecrets } = require('../dist/modules/smart-publishing/publishing-settings.service');

test('publishing settings cached in Redis do not include integration secrets', () => {
  const redacted = redactPublishingSecrets({
    gapgpt_api_key: 'secret-key',
    wp_app_password: 'wp-secret',
    telegram_bot_token: 'bot-secret',
    social_instagram_access_token: 'ig-secret',
    news_summary_prompt: 'prompt',
    wp_site_url: 'https://news.example',
  });

  assert.equal(redacted.gapgpt_api_key, undefined);
  assert.equal(redacted.wp_app_password, undefined);
  assert.equal(redacted.telegram_bot_token, undefined);
  assert.equal(redacted.social_instagram_access_token, undefined);
  assert.equal(redacted.news_summary_prompt, 'prompt');
  assert.equal(redacted.wp_site_url, 'https://news.example');
});

test('image proxy stays authenticated and private file routes require a signature check', () => {
  const source = readFileSync(join(__dirname, '../src/modules/smart-publishing/smart-publishing.controller.ts'), 'utf8');
  const proxyAt = source.indexOf("@Get('proxy/image')");
  const publicAt = source.indexOf("@Controller('publishing/settings/fonts/file')");
  assert.ok(proxyAt > 0 && proxyAt < publicAt);
  assert.match(source.slice(0, proxyAt), /@UseGuards\(JwtAuthGuard, TenantGuard, PermissionsGuard\)/);
  assert.match(source, /assertSignedMedia\(request\)/);
  assert.equal(source.includes("@Public()\n@Controller('publishing')"), false);
});
