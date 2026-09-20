require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCategoryExternalId,
  parseCategoriesFromHtml,
  stableCategoryId,
} = require('../dist/modules/smart-publishing/destination-site-category-extractor');

test('extractCategoryExternalId reads numeric IranSystem-style paths', () => {
  assert.equal(extractCategoryExternalId(new URL('https://news.example.ir/fa/news/42')), '42');
  assert.equal(extractCategoryExternalId(new URL('https://news.example.ir/news/section/7')), '7');
  assert.equal(extractCategoryExternalId(new URL('https://news.example.ir/fa/news?service_id=15')), '15');
});

test('parseCategoriesFromHtml collects category links from navigation', () => {
  const html = `
    <html><body>
      <nav>
        <a href="/fa/news/12">اقتصاد</a>
        <a href="/fa/news/34">فناوری</a>
        <a href="/login">ورود</a>
        <a href="https://other.example/fa/news/99">خارجی</a>
      </nav>
    </body></html>
  `;
  const categories = parseCategoriesFromHtml(html, 'https://news.example.ir');
  assert.equal(categories.length, 2);
  assert.deepEqual(
    categories.map((item) => item.name).sort(),
    ['اقتصاد', 'فناوری'],
  );
  assert.ok(categories.every((item) => /^\d+$/.test(item.externalId)));
});

test('stableCategoryId is deterministic for slug-only paths', () => {
  const first = stableCategoryId('/fa/news/politics');
  const second = stableCategoryId('/fa/news/politics');
  assert.equal(first, second);
  assert.ok(first >= 100);
});
