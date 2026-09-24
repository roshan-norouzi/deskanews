const test = require('node:test');
const assert = require('node:assert/strict');
const { signMediaPath, verifyMediaSignature, mediaSignatureRequired, canonicalMediaPath, socialMediaFilename } = require('../dist/common/media-signature');
const { encodeArticleCursor, decodeArticleCursor } = require('../dist/common/article-page');

test('signed media urls expire and reject a tampered signature', () => {
  process.env.MEDIA_URL_SECRET = 'phase3-test-secret';
  assert.equal(mediaSignatureRequired(), true);
  const signed = signMediaPath('/publishing/social/media/file.png', 60);
  const url = new URL(`http://local${signed}`);
  assert.equal(verifyMediaSignature(url.pathname, url.searchParams.get('exp'), url.searchParams.get('sig')), true);
  assert.equal(verifyMediaSignature(url.pathname, url.searchParams.get('exp'), 'tampered'), false);
  delete process.env.MEDIA_URL_SECRET;
});

test('canonical media paths strip signatures and api prefix', () => {
  const signed = '/publishing/settings/images/file/tenant-1/a.png?exp=999&sig=abc';
  assert.equal(canonicalMediaPath(signed), '/publishing/settings/images/file/tenant-1/a.png');
  assert.equal(canonicalMediaPath(`/api${signed.split('?')[0]}`), '/publishing/settings/images/file/tenant-1/a.png');
  const generated = signMediaPath('/publishing/social/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', 60);
  assert.equal(socialMediaFilename(generated), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
});

test('article cursor round-trips the stamp and id', () => {
  const stamp = new Date('2026-09-23T12:00:00.000Z');
  const cursor = encodeArticleCursor(stamp, 'article-1');
  assert.deepEqual(decodeArticleCursor(cursor), { stamp, id: 'article-1' });
  assert.equal(decodeArticleCursor('not-a-cursor'), null);
});
