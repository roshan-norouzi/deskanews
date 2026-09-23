import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { SourceReaderService, type SafeHttpRequestOptions, type SafeHttpResponse } from './source-reader.service';
import { parseWordPressCategories, type WordPressCategory } from './wordpress-category';
import { RedisCache } from '../../common/redis/redis-cache';

interface WordPressText {
  raw?: string;
  rendered?: string;
}

interface WordPressPost {
  id?: number;
  link?: string;
  message?: string;
  code?: string;
  date?: string;
  modified?: string;
  slug?: string;
  status?: string;
  title?: WordPressText | string;
  excerpt?: WordPressText | string;
  content?: WordPressText | string;
  author?: number;
  featured_media?: number;
  categories?: number[];
  tags?: number[];
  source_url?: string;
  _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> };
}

export interface ManagedWordPressPost {
  id: number;
  link: string;
  date: string;
  modified: string;
  slug: string;
  status: string;
  title: string;
  excerpt: string;
  content: string;
  author: number | null;
  featuredMediaId: number | null;
  featuredImageUrl: string;
  categories: number[];
  tags: number[];
}

type WordPressRestStyle = 'pretty' | 'query';

@Injectable()
export class WordPressClient {
  private readonly restStyles = new Map<string, WordPressRestStyle>();

  constructor(
    private readonly sourceReader: SourceReaderService,
    @Optional() private readonly cache?: RedisCache,
  ) {}

  private credentials(settings: PublishingSettings) {
    const siteUrl = String(settings.wp_site_url ?? '').trim().replace(/\/$/, '');
    const username = String(settings.wp_username ?? '').normalize('NFKC').trim();
    // WordPress core removes every non-alphanumeric character before checking
    // an Application Password. Mirroring that behavior also handles pasted
    // spaces, non-breaking spaces, dashes and invisible separators safely.
    const appPassword = String(settings.wp_app_password ?? '')
      .normalize('NFKC')
      .replace(/[^a-z\d]/gi, '');
    if (!siteUrl && !username && !appPassword) {
      throw new BadRequestException('آدرس سایت، نام کاربری و رمز برنامه WordPress را در تنظیمات وارد کنید');
    }
    if (!siteUrl) {
      throw new BadRequestException('آدرس سایت WordPress را وارد کنید (نشانی اصلی نصب، بدون wp-admin).');
    }
    if (!username) {
      throw new BadRequestException('نام کاربری WordPress را وارد کنید.');
    }
    if (!appPassword) {
      throw new BadRequestException(
        'رمز برنامه (Application Password) WordPress را وارد کنید. اگر آدرس سایت را عوض کرده‌اید، رمز را دوباره وارد کنید؛ فقط فاصله و خط تیرهٔ نمایشی حذف می‌شود.',
      );
    }
    let url: URL;
    try { url = new URL(siteUrl); } catch { throw new BadRequestException('آدرس WordPress معتبر نیست'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('آدرس WordPress معتبر نیست');
    if (/\/(?:wp-admin|wp-login\.php)\/?$/iu.test(url.pathname)) {
      throw new BadRequestException('آدرس اصلی محل نصب WordPress را وارد کنید؛ wp-admin یا wp-login.php را به انتهای آدرس اضافه نکنید');
    }
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new BadRequestException('برای حفاظت از رمز برنامه، آدرس WordPress باید HTTPS باشد');
    }
    const authorization = `Basic ${Buffer.from(`${username}:${appPassword}`, 'utf8').toString('base64')}`;
    return { siteUrl, authorization };
  }

  validateSettings(settings: PublishingSettings): void {
    this.credentials(settings);
  }

  resolveSiteUrl(settings: PublishingSettings): string {
    const siteUrl = String(settings.wp_site_url ?? '').trim().replace(/\/$/, '');
    if (!siteUrl) {
      throw new BadRequestException('آدرس سایت مقصد را وارد کنید');
    }
    let url: URL;
    try { url = new URL(siteUrl); } catch { throw new BadRequestException('آدرس سایت معتبر نیست'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('آدرس سایت معتبر نیست');
    if (/\/(?:wp-admin|wp-login\.php)\/?$/iu.test(url.pathname)) {
      throw new BadRequestException('آدرس اصلی محل نصب WordPress را وارد کنید؛ wp-admin یا wp-login.php را به انتهای آدرس اضافه نکنید');
    }
    return siteUrl;
  }

  async categoriesPublic(settings: PublishingSettings): Promise<WordPressCategory[]> {
    const siteUrl = this.resolveSiteUrl(settings);
    const restStyle = await this.resolveRestStylePublic(siteUrl);
    return this.fetchCategories(siteUrl, restStyle);
  }

  async test(settings: PublishingSettings): Promise<{ ok: true; message: string; categories: WordPressCategory[] }> {
    const { siteUrl, authorization } = this.credentials(settings);
    try {
      const restStyle = await this.resolveRestStyle(siteUrl, authorization, true);
      const categories = await this.fetchCategories(siteUrl, restStyle, authorization);
      return { ok: true, message: `اتصال WordPress تأیید و ${categories.length} دسته‌بندی دریافت شد`, categories };
    } catch (error) {
      throw new BadRequestException(`اتصال WordPress برقرار نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`);
    }
  }

  async categories(settings: PublishingSettings): Promise<WordPressCategory[]> {
    const { siteUrl, authorization } = this.credentials(settings);
    const cacheKey = `deska:wp-categories:${siteUrl}`;
    const cached = await this.cache?.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached) as WordPressCategory[]; } catch { /* refill */ }
    }
    const restStyle = await this.resolveRestStyle(siteUrl, authorization);
    const rows = await this.fetchCategories(siteUrl, restStyle, authorization);
    await this.cache?.set(cacheKey, JSON.stringify(rows), 600);
    return rows;
  }

  async listPosts(settings: PublishingSettings, input: { status?: string; page?: number; perPage?: number; search?: string; tagId?: number } = {}) {
    const { siteUrl, authorization } = this.credentials(settings);
    const page = Math.max(1, Math.trunc(input.page || 1));
    const perPage = Math.min(100, Math.max(1, Math.trunc(input.perPage || 20)));
    const status = input.status || 'any';
    const query: Record<string, string> = {
      context: 'edit',
      status,
      page: String(page),
      per_page: String(perPage),
      orderby: 'date',
      order: 'desc',
      _embed: 'wp:featuredmedia',
      _fields: 'id,date,modified,slug,status,link,title,excerpt,author,featured_media,categories,tags,_links,_embedded',
    };
    const search = String(input.search || '').trim();
    if (search) query.search = search;
    if (Number.isSafeInteger(input.tagId) && Number(input.tagId) > 0) query.tags = String(input.tagId);
    const response = await this.restRequest(siteUrl, authorization, '/wp/v2/posts', query, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      timeoutMs: 30_000,
      maxResponseBytes: 5 * 1024 * 1024,
    });
    const body = this.json<WordPressPost[] | WordPressPost>(response, []);
    if (response.status === 404) {
      throw new BadRequestException('مسیر دریافت نوشته‌های WordPress در هر دو روش /wp-json و ?rest_route پاسخ ۴۰۴ داد؛ آدرس اصلی محل نصب WordPress و تنظیمات reverse proxy یا افزونه امنیتی را بررسی کنید');
    }
    if (!response.ok || !Array.isArray(body)) this.throwWordPressError(response, body);
    return {
      posts: body.map((post) => this.normalizePost(post)),
      page,
      perPage,
      total: this.headerNumber(response, 'x-wp-total'),
      totalPages: this.headerNumber(response, 'x-wp-totalpages'),
    };
  }

  async getPost(settings: PublishingSettings, postId: string | number): Promise<ManagedWordPressPost>;
  async getPost(settings: PublishingSettings, postId: string | number, allowMissing: true): Promise<ManagedWordPressPost | null>;
  async getPost(settings: PublishingSettings, postId: string | number, allowMissing = false): Promise<ManagedWordPressPost | null> {
    const id = this.postId(postId);
    const { siteUrl, authorization } = this.credentials(settings);
    const response = await this.restRequest(siteUrl, authorization, `/wp/v2/posts/${id}`, {
      context: 'edit',
      _embed: 'wp:featuredmedia',
      _fields: 'id,date,modified,slug,status,link,title,excerpt,content,author,featured_media,categories,tags,_links,_embedded',
    }, { headers: { Authorization: authorization, Accept: 'application/json' }, timeoutMs: 30_000, maxResponseBytes: 5 * 1024 * 1024 });
    const body = this.json<WordPressPost>(response);
    if (allowMissing && response.status === 404) return null;
    if (response.status === 404) {
      throw new BadRequestException(`نوشته شماره ${id} در WordPress یافت نشد یا مسیر REST آن توسط reverse proxy یا افزونه امنیتی پنهان شده است`);
    }
    if (!response.ok || !body.id) this.throwWordPressError(response, body);
    return this.normalizePost(body);
  }

  async updatePost(settings: PublishingSettings, postId: string | number, input: {
    title?: string;
    slug?: string;
    excerpt?: string;
    content?: string;
    status?: string;
    categories?: number[];
  }): Promise<ManagedWordPressPost> {
    const id = this.postId(postId);
    const { siteUrl, authorization } = this.credentials(settings);
    const restStyle = await this.resolveRestStyle(siteUrl, authorization);
    const payload: Record<string, unknown> = {};
    if (input.title !== undefined) payload.title = input.title.trim();
    if (input.slug !== undefined) payload.slug = input.slug.trim();
    if (input.excerpt !== undefined) payload.excerpt = input.excerpt;
    if (input.content !== undefined) payload.content = input.content;
    if (input.status !== undefined) payload.status = input.status;
    if (input.categories !== undefined) payload.categories = [...new Set(input.categories)];
    if (!Object.keys(payload).length) throw new BadRequestException('حداقل یک تغییر برای نوشته وارد کنید');
    if (payload.title === '') throw new BadRequestException('عنوان نوشته نمی‌تواند خالی باشد');

    const response = await this.request(this.restUrl(siteUrl, restStyle, `/wp/v2/posts/${id}`, {
      context: 'edit',
      _embed: 'wp:featuredmedia',
      _fields: 'id,date,modified,slug,status,link,title,excerpt,content,author,featured_media,categories,tags,_links,_embedded',
    }), {
      method: 'POST',
      headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 60_000,
      maxResponseBytes: 5 * 1024 * 1024,
    });
    const body = this.json<WordPressPost>(response);
    if (!response.ok || !body.id) this.throwWordPressError(response, body);
    return this.normalizePost(body);
  }

  async updateFeaturedImage(settings: PublishingSettings, postId: string | number, file?: { originalname: string; mimetype?: string; buffer: Buffer } | null): Promise<ManagedWordPressPost> {
    const id = this.postId(postId);
    const { siteUrl, authorization } = this.credentials(settings);
    const restStyle = await this.resolveRestStyle(siteUrl, authorization);
    const uploaded = file ? await this.uploadMediaFile(siteUrl, restStyle, authorization, file) : null;
    const response = await this.request(this.restUrl(siteUrl, restStyle, `/wp/v2/posts/${id}`, {
      context: 'edit',
      _embed: 'wp:featuredmedia',
      _fields: 'id,date,modified,slug,status,link,title,excerpt,content,author,featured_media,categories,tags,_links,_embedded',
    }), {
      method: 'POST',
      headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured_media: uploaded?.id || 0 }),
      timeoutMs: 60_000,
      maxResponseBytes: 5 * 1024 * 1024,
    });
    const body = this.json<WordPressPost>(response);
    if (!response.ok || !body.id) {
      if (uploaded?.id) {
        await this.request(this.restUrl(siteUrl, restStyle, `/wp/v2/media/${uploaded.id}`, { force: 'true' }), {
          method: 'DELETE', headers: { Authorization: authorization, Accept: 'application/json' }, timeoutMs: 20_000,
        }).catch(() => undefined);
      }
      this.throwWordPressError(response, body);
    }
    const post = this.normalizePost(body);
    if (uploaded && !post.featuredImageUrl) post.featuredImageUrl = uploaded.url;
    return post;
  }

  async publish(settings: PublishingSettings, input: {
    articleId: string;
    title: string;
    excerpt: string;
    content: string;
    featuredImageUrl?: string;
    categoryId?: number | null;
  }): Promise<{ postId: string; url: string }> {
    const { siteUrl, authorization } = this.credentials(settings);
    const restStyle = await this.resolveRestStyle(siteUrl, authorization);
    const slug = `deska-${input.articleId.toLowerCase()}`;
    const requestedCategoryId = input.categoryId === undefined ? settings.wp_category_id : input.categoryId;
    const categoryId = Number(requestedCategoryId || 0);

    const existingResponse = await this.request(this.restUrl(siteUrl, restStyle, '/wp/v2/posts', { slug, status: 'any', _fields: 'id,link' }), {
      headers: { Authorization: authorization, Accept: 'application/json' },
      timeoutMs: 20_000,
    });
    let featuredMediaId: number | undefined;
    if (input.featuredImageUrl) {
      featuredMediaId = await this.uploadMedia(siteUrl, restStyle, authorization, input.featuredImageUrl, input.title);
    }
    if (existingResponse.ok) {
      const existing = this.json<WordPressPost[]>(existingResponse, []);
      if (existing[0]?.id && existing[0]?.link) {
        const update: Record<string, unknown> = {
          title: input.title,
          excerpt: input.excerpt,
          content: input.content,
          status: settings.wp_post_status || 'publish',
        };
        if (featuredMediaId) update.featured_media = featuredMediaId;
        if (Number.isSafeInteger(categoryId) && categoryId > 0) update.categories = [categoryId];
        const updateResponse = await this.request(this.restUrl(siteUrl, restStyle, `/wp/v2/posts/${existing[0].id}`), { method: 'POST', headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(update), timeoutMs: 30_000 });
        const updated = this.json<WordPressPost>(updateResponse);
        if (!updateResponse.ok) {
          throw new Error(updated.message || `به‌روزرسانی نوشته WordPress با خطای HTTP ${updateResponse.status} روبه‌رو شد`);
        }
        return { postId: String(existing[0].id), url: updated.link || existing[0].link };
      }
    }

    const payload: Record<string, unknown> = {
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      status: settings.wp_post_status || 'publish',
      slug,
    };
    if (Number.isSafeInteger(categoryId) && categoryId > 0) payload.categories = [categoryId];
    if (featuredMediaId) payload.featured_media = featuredMediaId;

    const response = await this.request(this.restUrl(siteUrl, restStyle, '/wp/v2/posts'), {
      method: 'POST',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeoutMs: 60_000,
    });
    const body = this.json<WordPressPost>(response);
    if (!response.ok || !body.id || !body.link) {
      throw new Error(body.message || `WordPress HTTP ${response.status}`);
    }
    return { postId: String(body.id), url: body.link };
  }

  private async uploadMedia(siteUrl: string, restStyle: WordPressRestStyle, authorization: string, imageUrl: string, title: string): Promise<number> {
    try {
      const image = await this.sourceReader.proxyImage(imageUrl);
      return (await this.uploadMediaBytes(siteUrl, restStyle, authorization, image.buffer, image.contentType, title)).id;
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'آپلود تصویر شاخص انجام نشد'); }
  }

  private async uploadMediaFile(siteUrl: string, restStyle: WordPressRestStyle, authorization: string, file: { originalname: string; mimetype?: string; buffer: Buffer }): Promise<{ id: number; url: string }> {
    if (!file?.buffer?.length) throw new BadRequestException('فایل تصویر شاخص انتخاب نشده است');
    if (file.buffer.length > 15 * 1024 * 1024) throw new BadRequestException('حجم تصویر شاخص حداکثر ۱۵ مگابایت است');
    const extension = file.originalname.toLowerCase().match(/\.(jpe?g|png|webp|avif)$/u)?.[1];
    if (!extension) throw new BadRequestException('فرمت تصویر باید JPG، PNG، WebP یا AVIF باشد');
    const contentType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
    if (file.mimetype && file.mimetype.toLowerCase() !== contentType) throw new BadRequestException('پسوند و نوع فایل تصویر با یکدیگر سازگار نیستند');
    return this.uploadMediaBytes(siteUrl, restStyle, authorization, file.buffer, contentType, file.originalname);
  }

  private async uploadMediaBytes(siteUrl: string, restStyle: WordPressRestStyle, authorization: string, buffer: Buffer, requestedContentType: string, _title: string): Promise<{ id: number; url: string }> {
    const contentType = requestedContentType.split(';')[0].trim().toLowerCase() === 'image/jpg' ? 'image/jpeg' : requestedContentType.split(';')[0].trim().toLowerCase();
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
    const extension = extensions[contentType];
    if (!extension || !this.hasImageSignature(buffer, contentType)) throw new BadRequestException('محتوای فایل تصویر شاخص معتبر نیست');
    const filename = `deska-featured-${Date.now()}.${extension}`;
    const response = await this.request(this.restUrl(siteUrl, restStyle, '/wp/v2/media'), { method: 'POST', headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` }, body: buffer, timeoutMs: 60_000, maxResponseBytes: 4 * 1024 * 1024 });
    const body = this.json<WordPressPost & { message?: string }>(response);
    if (!response.ok || !body.id) throw new BadRequestException(body.message || `آپلود تصویر شاخص در WordPress با خطای HTTP ${response.status} انجام شد`);
    return { id: body.id, url: String(body.source_url || '') };
  }

  private hasImageSignature(buffer: Buffer, contentType: string): boolean {
    if (contentType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (contentType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (contentType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (contentType === 'image/avif') return buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp' && /(?:avif|avis)/u.test(buffer.toString('ascii', 8, Math.min(buffer.length, 40)));
    return false;
  }

  private request(url: string, options: SafeHttpRequestOptions = {}): Promise<SafeHttpResponse> {
    return this.sourceReader.safeRequest(url, {
      ...options,
      maxResponseBytes: options.maxResponseBytes ?? 2 * 1024 * 1024,
      allowLocalhostInDevelopment: true,
    });
  }

  private async restRequest(
    siteUrl: string,
    authorization: string,
    route: string,
    query: Record<string, string>,
    options: SafeHttpRequestOptions,
  ): Promise<SafeHttpResponse> {
    const style = await this.resolveRestStyle(siteUrl, authorization);
    const response = await this.request(this.restUrl(siteUrl, style, route, query), options);
    if (response.status !== 404) return response;

    // Reverse proxies and permalink/security settings can change while the API
    // process is alive. A cached REST transport must therefore never make a
    // temporary routing change permanent for subsequent WordPress operations.
    const alternate: WordPressRestStyle = style === 'pretty' ? 'query' : 'pretty';
    const fallback = await this.request(this.restUrl(siteUrl, alternate, route, query), options);
    if (fallback.status !== 404) this.restStyles.set(siteUrl, alternate);
    return fallback;
  }

  private postId(value: string | number): number {
    const normalized = String(value).trim();
    if (!/^\d{1,10}$/u.test(normalized)) throw new BadRequestException('شناسه نوشته WordPress معتبر نیست');
    const id = Number(normalized);
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('شناسه نوشته WordPress معتبر نیست');
    return id;
  }

  private normalizePost(post: WordPressPost): ManagedWordPressPost {
    return {
      id: Number(post.id || 0),
      link: String(post.link || ''),
      date: String(post.date || ''),
      modified: String(post.modified || ''),
      slug: String(post.slug || ''),
      status: String(post.status || 'draft'),
      title: this.postText(post.title),
      excerpt: this.postText(post.excerpt),
      content: this.postText(post.content),
      author: Number.isSafeInteger(Number(post.author)) && Number(post.author) > 0 ? Number(post.author) : null,
      featuredMediaId: Number.isSafeInteger(Number(post.featured_media)) && Number(post.featured_media) > 0 ? Number(post.featured_media) : null,
      featuredImageUrl: String(post._embedded?.['wp:featuredmedia']?.[0]?.source_url || ''),
      categories: Array.isArray(post.categories) ? post.categories.filter((id) => Number.isSafeInteger(id) && id > 0) : [],
      tags: Array.isArray(post.tags) ? post.tags.filter((id) => Number.isSafeInteger(id) && id > 0) : [],
    };
  }

  private postText(value: WordPressText | string | undefined): string {
    if (typeof value === 'string') return value;
    return String(value?.raw ?? value?.rendered ?? '');
  }

  private headerNumber(response: SafeHttpResponse, name: string): number {
    const value = response.headers[name.toLowerCase()];
    const parsed = Number(Array.isArray(value) ? value[0] : value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  private throwWordPressError(response: SafeHttpResponse, body: unknown): never {
    const message = body && typeof body === 'object' && !Array.isArray(body) && 'message' in body
      ? String((body as WordPressPost).message || '')
      : '';
    throw new BadRequestException(message || `مدیریت نوشته‌های WordPress با خطای HTTP ${response.status} روبه‌رو شد`);
  }

  private async fetchCategories(siteUrl: string, restStyle: WordPressRestStyle, authorization?: string): Promise<WordPressCategory[]> {
    const collected: unknown[] = [];
    for (let page = 1; page <= 10; page++) {
      const response = await this.request(this.restUrl(siteUrl, restStyle, '/wp/v2/categories', {
        per_page: '100',
        page: String(page),
        orderby: 'name',
        order: 'asc',
        hide_empty: 'false',
        _fields: 'id,name,slug,parent',
      }), {
        headers: {
          Accept: 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        timeoutMs: 20_000,
      });
      const body = this.json<unknown>(response, []);
      if (!response.ok) {
        const error = body && typeof body === 'object' && !Array.isArray(body) ? body as WordPressPost : {};
        throw new Error(error.message || `دریافت دسته‌بندی‌های WordPress با خطای HTTP ${response.status} روبه‌رو شد`);
      }
      if (!Array.isArray(body)) throw new Error('پاسخ دسته‌بندی‌های WordPress معتبر نبود');
      collected.push(...body);
      const totalPages = Number(response.headers['x-wp-totalpages'] || 0);
      if ((totalPages > 0 && page >= totalPages) || body.length < 100) break;
    }
    return parseWordPressCategories(collected);
  }

  private async resolveRestStyle(siteUrl: string, authorization: string, verify = false): Promise<WordPressRestStyle> {
    const cached = this.restStyles.get(siteUrl);
    if (cached && !verify) return cached;
    const styles: WordPressRestStyle[] = cached
      ? [cached, cached === 'pretty' ? 'query' : 'pretty']
      : ['pretty', 'query'];
    let lastResponse: SafeHttpResponse | undefined;
    let lastBody: WordPressPost = {};
    const headers = {
      Authorization: authorization,
      Accept: 'application/json',
      'User-Agent': 'DESKA-News/1.0 WordPress publisher',
    };

    for (const style of styles) {
      let response = await this.request(this.restUrl(siteUrl, style, '/wp/v2/users/me', { context: 'edit' }), { headers, timeoutMs: 20_000 });
      let body = this.json<WordPressPost>(response);
      // Some security plugins reject `context=edit`. The endpoint without it
      // still verifies that WordPress accepted the Application Password.
      if (!response.ok && [401, 403, 404].includes(response.status)) {
        response = await this.request(this.restUrl(siteUrl, style, '/wp/v2/users/me'), { headers, timeoutMs: 20_000 });
        body = this.json<WordPressPost>(response);
      }
      if (response.ok) {
        this.restStyles.set(siteUrl, style);
        return style;
      }
      lastResponse = response;
      lastBody = body;
      if (response.status !== 404) break;
    }

    if (lastResponse?.status === 401 || lastResponse?.status === 403) {
      if (lastBody.code === 'rest_not_logged_in') {
        throw new Error('WordPress کاربر API را واردشده تشخیص نداد؛ ممکن است هدر Authorization به PHP نرسیده باشد یا Application Password حذف، لغو یا نامعتبر شده باشد');
      }
      throw new Error('WordPress احراز هویت را نپذیرفت؛ نام کاربری و Application Password را بررسی کنید و مطمئن شوید REST API یا Application Passwords توسط افزونه امنیتی مسدود نشده است');
    }
    if (lastResponse?.status === 404) {
      throw new Error('REST API وردپرس در مسیرهای /wp-json و ?rest_route یافت نشد؛ آدرس سایت باید نشانی اصلی محل نصب WordPress باشد و REST API نیز نباید غیرفعال شده باشد');
    }
    throw new Error(lastBody.message || `HTTP ${lastResponse?.status ?? 'نامشخص'}`);
  }

  private async resolveRestStylePublic(siteUrl: string): Promise<WordPressRestStyle> {
    const cacheKey = `${siteUrl}::public`;
    const cached = this.restStyles.get(cacheKey);
    if (cached) return cached;

    const styles: WordPressRestStyle[] = ['pretty', 'query'];
    let lastStatus = 0;
    for (const style of styles) {
      const response = await this.request(this.restUrl(siteUrl, style, '/wp/v2/categories', {
        per_page: '1',
        _fields: 'id',
      }), {
        headers: { Accept: 'application/json' },
        timeoutMs: 20_000,
      });
      lastStatus = response.status;
      if (response.ok) {
        this.restStyles.set(cacheKey, style);
        return style;
      }
      if (response.status !== 404) break;
    }

    if (lastStatus === 401 || lastStatus === 403) {
      throw new Error('دسته‌بندی‌های این سایت به‌صورت عمومی در دسترس نیستند؛ REST API وردپرس باید بدون احراز هویت قابل خواندن باشد');
    }
    if (lastStatus === 404) {
      throw new Error('REST API وردپرس در مسیرهای /wp-json و ?rest_route یافت نشد؛ آدرس سایت باید نشانی اصلی محل نصب WordPress باشد');
    }
    throw new Error(`دریافت دسته‌بندی‌ها با خطای HTTP ${lastStatus || 'نامشخص'} انجام نشد`);
  }

  private restUrl(siteUrl: string, style: WordPressRestStyle, route: string, query: Record<string, string> = {}): string {
    const url = new URL(siteUrl);
    const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
    url.hash = '';
    url.search = '';
    if (style === 'pretty') {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/wp-json${normalizedRoute}`;
    } else {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/`;
      url.searchParams.set('rest_route', normalizedRoute);
    }
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  }

  private json<T>(response: SafeHttpResponse, fallback: T = {} as T): T {
    try { return response.json<T>(); } catch { return fallback; }
  }
}
