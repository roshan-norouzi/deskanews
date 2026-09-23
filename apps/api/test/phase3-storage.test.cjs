const test = require('node:test');
const assert = require('node:assert/strict');
const { signMediaPath, verifyMediaSignature, mediaSignatureRequired } = require('../dist/common/media-signature');
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

test('article cursor round-trips the stamp and id', () => {
  const stamp = new Date('2026-09-23T12:00:00.000Z');
  const cursor = encodeArticleCursor(stamp, 'article-1');
  assert.deepEqual(decodeArticleCursor(cursor), { stamp, id: 'article-1' });
  assert.equal(decodeArticleCursor('not-a-cursor'), null);
});
