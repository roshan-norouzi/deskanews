const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeSourceIconDomain, SourceIconService } = require('../dist/modules/smart-publishing/source-icon.service');
const { SourceReaderService } = require('../dist/modules/smart-publishing/source-reader.service');

test('sanitizeSourceIconDomain accepts news hostnames', () => {
  assert.equal(sanitizeSourceIconDomain('isna.ir'), 'isna.ir');
  assert.equal(sanitizeSourceIconDomain('www.MehrNews.com'), 'mehrnews.com');
  assert.equal(sanitizeSourceIconDomain('bbc.co.uk'), 'bbc.co.uk');
});

test('sanitizeSourceIconDomain rejects unsafe values', () => {
  assert.equal(sanitizeSourceIconDomain('../etc/passwd'), '');
  assert.equal(sanitizeSourceIconDomain('localhost'), '');
  assert.equal(sanitizeSourceIconDomain(''), '');
  assert.equal(sanitizeSourceIconDomain('http://isna.ir'), '');
  assert.equal(sanitizeSourceIconDomain('%E0%A4%A'), '');
});

test('sanitizeSourceIconDomain rejects IP literals and internal names', () => {
  for (const value of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '192.168.1.1', 'metadata.google.internal', 'printer.local', 'db.lan', '1.2.3.4.in-addr.arpa']) {
    assert.equal(sanitizeSourceIconDomain(value), '', value);
  }
});

test('source icons never reach internal addresses through the guarded fetcher', async () => {
  const reader = new SourceReaderService();
  await assert.rejects(
    () => reader.fetchPublicResource('https://127.0.0.1/favicon.ico', { accept: 'image/*', maxBytes: 1000 }),
    /آدرس داخلی/u,
  );
  await assert.rejects(
    () => reader.fetchPublicResource('http://[::ffff:7f00:1]/', { accept: 'image/*', maxBytes: 1000 }),
    /آدرس داخلی/u,
  );
});

test('source icon service skips third-party lookups for blocked domains', async () => {
  const calls = [];
  const fetcher = {
    fetchPublicResource: async (url) => {
      calls.push(url);
      const { BadRequestException } = require('@nestjs/common');
      throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    },
  };
  const previous = process.env.STORAGE_PATH;
  process.env.STORAGE_PATH = require('node:path').join(require('node:os').tmpdir(), `deska-icon-test-${process.pid}`);
  try {
    const service = new SourceIconService(fetcher);
    assert.equal(await service.getIcon('internal-only.example.com'), null);
    assert.deepEqual(calls, ['https://internal-only.example.com/favicon.ico']);
    const fs = require('node:fs');
    assert.equal(fs.existsSync(require('node:path').join(process.env.STORAGE_PATH, 'source-icons', 'internal-only.example.com.missing')), false);
  } finally {
    if (previous === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = previous;
  }
});
