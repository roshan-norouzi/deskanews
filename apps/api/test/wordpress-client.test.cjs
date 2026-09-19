require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { WordPressClient } = require('../dist/modules/smart-publishing/wordpress.client');

function response(status, body, headers = {}) {
  const buffer = Buffer.from(JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { 'content-type': 'application/json', ...headers },
    buffer,
    text: () => buffer.toString('utf8'),
    json: () => body,
  };
}

test('WordPress connection and publishing fall back to the rest_route transport after wp-json returns 404', async () => {
  const calls = [];
  let publishedPayload;
  const sourceReader = {
    safeRequest: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' });
      const parsed = new URL(url);
      if (parsed.pathname.includes('/wp-json/')) return response(404, {});
      const route = parsed.searchParams.get('rest_route');
      if (route === '/wp/v2/users/me') return response(200, { id: 7, name: 'Publisher' });
      if (route === '/wp/v2/categories') return response(200, [
        { id: 7, name: 'اقتصاد', slug: 'economy', parent: 0 },
        { id: 8, name: 'فناوری', slug: 'technology', parent: 0 },
      ], { 'x-wp-totalpages': '1' });
      if (route === '/wp/v2/posts' && (options.method || 'GET') === 'GET') return response(200, []);
      if (route === '/wp/v2/posts' && options.method === 'POST') {
        publishedPayload = JSON.parse(options.body);
        return response(201, { id: 42, link: 'https://news.example/deska-story/' });
      }
      return response(404, {});
    },
  };
  const client = new WordPressClient(sourceReader);
  const settings = {
    wp_site_url: 'https://news.example',
    wp_username: 'publisher',
    wp_app_password: 'abcd efgh ijkl',
    wp_post_status: 'draft',
  };

  const connection = await client.test(settings);
  const published = await client.publish(settings, {
    articleId: 'ARTICLE-A',
    title: 'تیتر خبر',
    excerpt: 'خلاصه خبر',
    content: '<p>متن خبر</p>',
    categoryId: 8,
  });

  assert.equal(connection.ok, true);
  assert.deepEqual(connection.categories.map((category) => category.id), [7, 8]);
  assert.deepEqual(published, { postId: '42', url: 'https://news.example/deska-story/' });
  assert.deepEqual(publishedPayload.categories, [8]);
  assert.ok(calls.some((call) => call.url.includes('/wp-json/wp/v2/users/me')));
  assert.ok(calls.some((call) => new URL(call.url).searchParams.get('rest_route') === '/wp/v2/users/me'));
  assert.ok(calls.some((call) => call.method === 'POST' && new URL(call.url).searchParams.get('rest_route') === '/wp/v2/posts'));
});

test('WordPress 404 explains that neither REST transport was found', async () => {
  const sourceReader = { safeRequest: async () => response(404, {}) };
  const client = new WordPressClient(sourceReader);

  await assert.rejects(
    () => client.test({
      wp_site_url: 'https://news.example',
      wp_username: 'publisher',
      wp_app_password: 'abcd efgh ijkl',
    }),
    /REST API وردپرس در مسیرهای \/wp-json و \?rest_route یافت نشد/,
  );
});

test('WordPress operations recover when the cached REST transport starts returning 404', async () => {
  let prettyPostsAvailable = true;
  const calls = [];
  const sourceReader = {
    safeRequest: async (url) => {
      calls.push(url);
      const parsed = new URL(url);
      const route = parsed.searchParams.get('rest_route');
      if (parsed.pathname.endsWith('/wp-json/wp/v2/users/me')) return response(200, { id: 7 });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/categories')) return response(200, [], { 'x-wp-totalpages': '1' });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts')) {
        return prettyPostsAvailable ? response(200, [], { 'x-wp-totalpages': '1' }) : response(404, {});
      }
      if (route === '/wp/v2/posts') return response(200, [{ id: 11, status: 'publish', title: { rendered: 'خبر' } }], { 'x-wp-total': '1', 'x-wp-totalpages': '1' });
      return response(404, {});
    },
  };
  const client = new WordPressClient(sourceReader);
  const settings = { wp_site_url: 'https://news.example', wp_username: 'publisher', wp_app_password: 'abcd efgh ijkl' };

  await client.test(settings);
  prettyPostsAvailable = false;
  const result = await client.listPosts(settings, { status: 'publish' });

  assert.equal(result.posts[0].id, 11);
  assert.ok(calls.some((url) => new URL(url).searchParams.get('rest_route') === '/wp/v2/posts'));
});

test('an explicit empty category does not reuse a stale configured category id', async () => {
  let publishedPayload;
  const sourceReader = {
    safeRequest: async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/wp-json/wp/v2/users/me')) return response(200, { id: 7 });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts') && (options.method || 'GET') === 'GET') return response(200, []);
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts') && options.method === 'POST') {
        publishedPayload = JSON.parse(options.body);
        return response(201, { id: 43, link: 'https://news.example/default-category/' });
      }
      return response(404, {});
    },
  };
  const client = new WordPressClient(sourceReader);

  await client.publish({
    wp_site_url: 'https://news.example',
    wp_username: 'publisher',
    wp_app_password: 'abcd efgh ijkl',
    wp_category_id: '999',
  }, {
    articleId: 'ARTICLE-B',
    title: 'تیتر خبر',
    excerpt: 'خلاصه خبر',
    content: '<p>متن خبر</p>',
    categoryId: null,
  });

  assert.equal('categories' in publishedPayload, false);
});

test('republishing an existing DESKA post updates its body and excerpt', async () => {
  let updatedPayload;
  const sourceReader = {
    safeRequest: async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/wp-json/wp/v2/users/me')) return response(200, { id: 7 });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts') && (options.method || 'GET') === 'GET') {
        return response(200, [{ id: 77, link: 'https://news.example/existing/' }]);
      }
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts/77') && options.method === 'POST') {
        updatedPayload = JSON.parse(options.body);
        return response(200, { id: 77, link: 'https://news.example/existing/' });
      }
      return response(404, {});
    },
  };
  const client = new WordPressClient(sourceReader);

  const result = await client.publish({
    wp_site_url: 'https://news.example', wp_username: 'publisher', wp_app_password: 'abcd efgh ijkl', wp_post_status: 'draft',
  }, {
    articleId: 'ARTICLE-C', title: 'تیتر تازه', excerpt: 'چکیده تازه', content: '<p>متن کامل تازه</p>', categoryId: 8,
  });

  assert.deepEqual(result, { postId: '77', url: 'https://news.example/existing/' });
  assert.deepEqual(updatedPayload, {
    title: 'تیتر تازه', excerpt: 'چکیده تازه', content: '<p>متن کامل تازه</p>', status: 'draft', categories: [8],
  });
});

test('WordPress media management lists editable posts with bounded pagination and search', async () => {
  let listUrl;
  const sourceReader = {
    safeRequest: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/wp-json/wp/v2/users/me')) return response(200, { id: 7 });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts')) {
        listUrl = parsed;
        return response(200, [{
          id: 91,
          link: 'https://news.example/story/',
          status: 'draft',
          slug: 'story',
          modified: '2026-09-10T10:00:00',
          title: { raw: 'تیتر خام', rendered: 'تیتر نمایشی' },
          excerpt: { raw: 'چکیده خام' },
          featured_media: 44,
          _embedded: { 'wp:featuredmedia': [{ source_url: 'https://news.example/uploads/story.jpg' }] },
          categories: [4],
        }], { 'x-wp-total': '61', 'x-wp-totalpages': '4' });
      }
      return response(404, {});
    },
  };
  const client = new WordPressClient(sourceReader);
  const result = await client.listPosts({
    wp_site_url: 'https://news.example', wp_username: 'publisher', wp_app_password: 'abcd efgh ijkl',
  }, { page: 2, perPage: 500, status: 'draft', search: 'اقتصاد ایران', tagId: 21 });

  assert.equal(result.page, 2);
  assert.equal(result.perPage, 100);
  assert.equal(result.total, 61);
  assert.equal(result.totalPages, 4);
  assert.equal(result.posts[0].title, 'تیتر خام');
  assert.equal(result.posts[0].excerpt, 'چکیده خام');
  assert.equal(result.posts[0].featuredImageUrl, 'https://news.example/uploads/story.jpg');
  assert.equal(listUrl.searchParams.get('context'), 'edit');
  assert.equal(listUrl.searchParams.get('status'), 'draft');
  assert.equal(listUrl.searchParams.get('per_page'), '100');
  assert.equal(listUrl.searchParams.get('search'), 'اقتصاد ایران');
  assert.equal(listUrl.searchParams.get('tags'), '21');
  assert.equal(listUrl.searchParams.get('orderby'), 'date');
  assert.equal(listUrl.searchParams.get('order'), 'desc');
});

test('WordPress media management reads and updates a post without accepting a route injection', async () => {
  let updatedPayload;
  const sourceReader = {
    safeRequest: async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/wp-json/wp/v2/users/me')) return response(200, { id: 7 });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts/52') && (options.method || 'GET') === 'GET') return response(200, {
        id: 52, link: 'https://news.example/story/', status: 'pending', slug: 'story',
        title: { raw: 'عنوان' }, excerpt: { raw: 'چکیده' }, content: { raw: '<p>متن</p>' }, categories: [2],
      });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts/52') && options.method === 'POST') {
        updatedPayload = JSON.parse(options.body);
        return response(200, {
          id: 52, link: 'https://news.example/story/', status: 'publish', slug: 'story-new',
          title: { raw: 'عنوان تازه' }, excerpt: { raw: 'چکیده' }, content: { raw: '<p>متن تازه</p>' }, categories: [2, 3],
        });
      }
      return response(404, {});
    },
  };
  const client = new WordPressClient(sourceReader);
  const settings = { wp_site_url: 'https://news.example', wp_username: 'publisher', wp_app_password: 'abcd efgh ijkl' };

  const current = await client.getPost(settings, 52);
  const updated = await client.updatePost(settings, '52', { title: 'عنوان تازه', slug: 'story-new', content: '<p>متن تازه</p>', status: 'publish', categories: [2, 3, 3] });

  assert.equal(current.content, '<p>متن</p>');
  assert.equal(updated.status, 'publish');
  assert.deepEqual(updatedPayload, { title: 'عنوان تازه', slug: 'story-new', content: '<p>متن تازه</p>', status: 'publish', categories: [2, 3] });
  await assert.rejects(() => client.getPost(settings, '52/../../users'), /شناسه نوشته WordPress معتبر نیست/);
});

test('WordPress media management uploads, attaches, and removes a featured image', async () => {
  const calls = [];
  const sourceReader = {
    safeRequest: async (url, options = {}) => {
      const parsed = new URL(url);
      calls.push({ url, options });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/users/me')) return response(200, { id: 7 });
      if (parsed.pathname.endsWith('/wp-json/wp/v2/media') && options.method === 'POST') {
        assert.ok(Buffer.isBuffer(options.body));
        assert.equal(options.headers['Content-Type'], 'image/png');
        return response(201, { id: 144, source_url: 'https://news.example/uploads/new-cover.png' });
      }
      if (parsed.pathname.endsWith('/wp-json/wp/v2/posts/52') && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        return response(200, {
          id: 52,
          status: 'draft',
          featured_media: payload.featured_media,
          _embedded: payload.featured_media
            ? { 'wp:featuredmedia': [{ source_url: 'https://news.example/uploads/new-cover.png' }] }
            : {},
        });
      }
      return response(404, {});
    },
  };
  const client = new WordPressClient(sourceReader);
  const settings = { wp_site_url: 'https://news.example', wp_username: 'publisher', wp_app_password: 'abcd efgh ijkl' };
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

  const attached = await client.updateFeaturedImage(settings, 52, { originalname: 'cover.png', mimetype: 'image/png', buffer: png });
  const removed = await client.updateFeaturedImage(settings, 52, null);

  assert.equal(attached.featuredMediaId, 144);
  assert.equal(attached.featuredImageUrl, 'https://news.example/uploads/new-cover.png');
  assert.equal(removed.featuredMediaId, null);
  assert.equal(removed.featuredImageUrl, '');
  const postPayloads = calls
    .filter((call) => new URL(call.url).pathname.endsWith('/wp-json/wp/v2/posts/52'))
    .map((call) => JSON.parse(call.options.body));
  assert.deepEqual(postPayloads, [{ featured_media: 144 }, { featured_media: 0 }]);
});

test('WordPress media management rejects spoofed image files before upload', async () => {
  const calls = [];
  const sourceReader = {
    safeRequest: async (url) => {
      calls.push(url);
      if (new URL(url).pathname.endsWith('/wp-json/wp/v2/users/me')) return response(200, { id: 7 });
      return response(404, {});
    },
  };
  const client = new WordPressClient(sourceReader);

  await assert.rejects(() => client.updateFeaturedImage({
    wp_site_url: 'https://news.example', wp_username: 'publisher', wp_app_password: 'abcd efgh ijkl',
  }, 52, {
    originalname: 'not-really-an-image.png', mimetype: 'image/png', buffer: Buffer.from('plain text'),
  }), /محتوای فایل تصویر شاخص معتبر نیست/);

  assert.equal(calls.some((url) => new URL(url).pathname.endsWith('/wp-json/wp/v2/media')), false);
});

