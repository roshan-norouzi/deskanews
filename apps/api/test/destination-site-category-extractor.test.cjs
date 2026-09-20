require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  attachRssGuideLinks,
  extractCategoryExternalId,
  extractIranSystemServicePath,
  isIranSystemNewsArticlePath,
  parseCategoriesFromHtml,
  parseIranSystemNavCategories,
  parseIranSystemRssGuide,
  stableCategoryId,
} = require('../dist/modules/smart-publishing/destination-site-category-extractor');

test('isIranSystemNewsArticlePath detects article urls', () => {
  assert.equal(isIranSystemNewsArticlePath('/fa/news/2391634/some-title'), true);
  assert.equal(isIranSystemNewsArticlePath('/news/42'), true);
  assert.equal(isIranSystemNewsArticlePath('/fa/film'), false);
  assert.equal(isIranSystemNewsArticlePath('/fa/sport/5'), false);
});

test('extractCategoryExternalId ignores news articles and reads IranSystem main services only', () => {
  assert.equal(extractCategoryExternalId(new URL('https://borna.news/fa/news/2391634/title')), null);
  assert.equal(extractCategoryExternalId(new URL('https://borna.news/fa/news/42')), null);
  assert.equal(extractCategoryExternalId(new URL('https://news.example.ir/news/section/7')), '7');
  assert.equal(extractCategoryExternalId(new URL('https://news.example.ir/fa/news?service_id=15')), '15');

  const film = extractIranSystemServicePath('/fa/film');
  assert.ok(film?.externalId);
  assert.equal(film.slug, 'film');

  assert.equal(extractIranSystemServicePath('/fa/sport/5'), null);
});

test('parseIranSystemNavCategories ignores submenu templates and article links', () => {
  const html = `
    <div class="header_services">
      <a class="nav_link" href="/fa/film"><span>فیلم</span></a>
      <a class="nav_link" href="/fa/sport"><span>ورزشی</span></a>
    </div>
    <script type="x-template">
      <a class="submenu_link" href="/fa/sport/5"><span>فوتبال</span></a>
      <a class="submenu_link" href="/fa/sport/7"><span>کشتی</span></a>
    </script>
    <main><a href="/fa/news/2391634/article-title">خبر</a></main>
  `;

  const categories = parseIranSystemNavCategories(html, 'https://borna.news');
  assert.deepEqual(categories.map((item) => item.name).sort(), ['فیلم', 'ورزشی']);
});

test('parseIranSystemNavCategories reads borna.news header services with service urls', () => {
  const html = `
    <div class="header_services">
      <a class="nav_link" href="/"><span>صفحه اصلی</span></a>
      <a class="nav_link" href="/fa/film"><span>فیلم</span></a>
      <a class="nav_link" href="/fa/photo"><span>عکس</span></a>
      <a class="nav_link" href="/fa/sport"><span>ورزشی</span></a>
      <a class="nav_link" href="/fa/society"><span>اجتماعی</span></a>
      <a class="nav_link" href="/fa/youthclub"><span>باشگاه جوانی</span></a>
      <a class="nav_link" href="/fa/political"><span>سیاسی و بین الملل</span></a>
      <a class="nav_link" href="/fa/culture"><span>فرهنگ و هنر</span></a>
      <a class="nav_link" href="/fa/economic"><span>اقتصادی</span></a>
      <a class="nav_link" href="/fa/science-tech-ai"><span>هوش مصنوعی، علم و فناوری</span></a>
      <a class="nav_link" href="/fa/states"><span>استان ها</span></a>
      <a class="nav_link" href="/fa/media"><span>رسانه ها</span></a>
      <a class="nav_link" href="/fa/market"><span>بازار</span></a>
    </div>
    <main>
      <a href="/fa/news/2391634/article-title">خبر نباید بیاید</a>
    </main>
  `;

  const categories = parseIranSystemNavCategories(html, 'https://borna.news');
  const expectedNames = [
    'فیلم',
    'عکس',
    'ورزشی',
    'اجتماعی',
    'باشگاه جوانی',
    'سیاسی و بین الملل',
    'فرهنگ و هنر',
    'اقتصادی',
    'هوش مصنوعی، علم و فناوری',
    'استان ها',
    'رسانه ها',
    'بازار',
  ];
  assert.equal(categories.length, 12);
  assert.deepEqual(new Set(categories.map((item) => item.name)), new Set(expectedNames));
  assert.ok(categories.every((item) => !/خبر/.test(item.name)));
  const sport = categories.find((item) => item.name === 'ورزشی');
  assert.equal(sport?.serviceUrl, 'https://borna.news/fa/sport');
});

test('parseIranSystemRssGuide reads fresh news rss links', () => {
  const html = `
    <div class="rss_block">
      <div class="rss_row"><div class="rss_list_pn">کل اخبار:</div><a href="/fa/rss/allnews" class="rss_list_link">https://borna.news/fa/rss/allnews</a></div>
      <div class="rss_row"><div class="rss_list_pn">فیلم:</div><a href="/fa/rss/2" class="rss_list_link">https://borna.news/fa/rss/2</a></div>
      <div class="rss_row"><div class="rss_list_pn">ورزشی:</div><a href="/fa/rss/7" class="rss_list_link">https://borna.news/fa/rss/7</a></div>
    </div>
    <div class="rss_block">
      <div class="rss_row"><div class="rss_list_pn">ورزشی:</div><a href="/fa/rss/7/mostvisited" class="rss_list_link">https://borna.news/fa/rss/7/mostvisited</a></div>
    </div>
  `;
  const rssByName = parseIranSystemRssGuide(html, 'https://borna.news');
  assert.equal(rssByName.get('فیلم'), 'https://borna.news/fa/rss/2');
  assert.equal(rssByName.get('ورزشی'), 'https://borna.news/fa/rss/7');
  assert.equal(rssByName.has('کل اخبار'), false);
});

test('parseCategoriesFromHtml merges nav services with rss guide', () => {
  const navHtml = `
    <div class="header_services">
      <a class="nav_link" href="/fa/film"><span>فیلم</span></a>
      <a class="nav_link" href="/fa/sport"><span>ورزشی</span></a>
      <a class="nav_link" href="/fa/economic"><span>اقتصادی</span></a>
    </div>
  `;
  const rssHtml = `
    <div class="rss_block">
      <div class="rss_row"><div class="rss_list_pn">فیلم:</div><a href="/fa/rss/2" class="rss_list_link">https://borna.news/fa/rss/2</a></div>
      <div class="rss_row"><div class="rss_list_pn">ورزشی:</div><a href="/fa/rss/7" class="rss_list_link">https://borna.news/fa/rss/7</a></div>
      <div class="rss_row"><div class="rss_list_pn">اقتصادی:</div><a href="/fa/rss/10" class="rss_list_link">https://borna.news/fa/rss/10</a></div>
    </div>
  `;
  const categories = parseCategoriesFromHtml(navHtml, 'https://borna.news', rssHtml);
  assert.equal(categories.length, 3);
  const sport = categories.find((item) => item.name === 'ورزشی');
  assert.equal(sport?.serviceUrl, 'https://borna.news/fa/sport');
  assert.equal(sport?.rssUrl, 'https://borna.news/fa/rss/7');
});

test('attachRssGuideLinks keeps existing rss when guide has no match', () => {
  const merged = attachRssGuideLinks([
    { externalId: '1', name: 'ورزشی', slug: 'sport', parentExternalId: '', serviceUrl: 'https://borna.news/fa/sport', rssUrl: '' },
  ], new Map([['فیلم', 'https://borna.news/fa/rss/2']]));
  assert.equal(merged[0].rssUrl, '');
});

test('parseCategoriesFromHtml ignores news article links in fallback mode', () => {
  const html = `
    <html><body>
      <nav>
        <a href="/fa/news/12">اقتصاد</a>
        <a href="/fa/news/34">فناوری</a>
        <a href="/fa/economic">اقتصادی</a>
        <a href="/login">ورود</a>
        <a href="https://other.example/fa/news/99">خارجی</a>
      </nav>
    </body></html>
  `;
  const categories = parseCategoriesFromHtml(html, 'https://news.example.ir');
  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, 'اقتصادی');
});

test('stableCategoryId is deterministic for slug-only paths', () => {
  const first = stableCategoryId('/fa/film');
  const second = stableCategoryId('/fa/film');
  assert.equal(first, second);
  assert.ok(first >= 100);
});
