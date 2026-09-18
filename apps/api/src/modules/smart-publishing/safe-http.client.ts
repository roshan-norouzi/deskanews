import { BadRequestException, Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 5;

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

interface ValidatedTarget {
  url: URL;
  addresses: ResolvedAddress[];
}

export interface SafeHttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array;
  maxResponseBytes?: number;
  timeoutMs?: number;
  acceptedTypes?: string[];
  allowLocalhostInDevelopment?: boolean;
}

export interface SafeHttpResponse {
  ok: boolean;
  status: number;
  headers: IncomingHttpHeaders;
  buffer: Buffer;
  text(): string;
  json<T = unknown>(): T;
}

function parseIpv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split('.').map((part) => Number.parseInt(part, 10));
  return octets.length === 4 ? octets : null;
}

function parseIpv6(address: string): number[] | null {
  let normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.includes('%') || isIP(normalized) !== 6) return null;

  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (ipv4Tail) {
    const octets = parseIpv4(ipv4Tail);
    if (!octets) return null;
    normalized = `${normalized.slice(0, -ipv4Tail.length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || (halves.length === 2 && omitted < 1)) return null;

  const groups = [...left, ...Array.from({ length: omitted }, () => '0'), ...right]
    .map((part) => Number.parseInt(part, 16));
  return groups.length === 8 && groups.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? groups
    : null;
}

function embeddedIpv4(groups: number[], offset: number): string {
  return `${groups[offset] >> 8}.${groups[offset] & 0xff}.${groups[offset + 1] >> 8}.${groups[offset + 1] & 0xff}`;
}

/** Reject every address that is not globally routable unicast. */
function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = parseIpv4(normalized);
  if (ipv4) {
    const [a, b, c, d] = ipv4;
    return a === 0
      || a === 10
      || a === 127
      || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || (a === 168 && b === 63 && c === 129 && d === 16);
  }

  const ipv6 = parseIpv6(normalized);
  if (!ipv6) return true;

  const firstFiveZero = ipv6.slice(0, 5).every((part) => part === 0);
  if (firstFiveZero && ipv6[5] === 0xffff) return isBlockedAddress(embeddedIpv4(ipv6, 6));
  if (ipv6.slice(0, 6).every((part) => part === 0)) return true;
  const isIsatap = (ipv6[4] === 0 || ipv6[4] === 0x0200) && ipv6[5] === 0x5efe;
  if (isIsatap && isBlockedAddress(embeddedIpv4(ipv6, 6))) return true;

  if ((ipv6[0] & 0xe000) !== 0x2000) return true;
  return (ipv6[0] === 0x2001 && ipv6[1] === 0x0000)
    || (ipv6[0] === 0x2001 && ipv6[1] === 0x0002)
    || (ipv6[0] === 0x2001 && ipv6[1] === 0x0db8)
    || (ipv6[0] === 0x2002)
    || (ipv6[0] === 0x3fff && (ipv6[1] & 0xf000) === 0x0000);
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

@Injectable()
export class SafeHttpClient {
  private async resolveAddresses(hostname: string): Promise<ResolvedAddress[]> {
    if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses
      .filter((item): item is ResolvedAddress => item.family === 4 || item.family === 6)
      .map((item) => ({ address: item.address, family: item.family }));
  }

  async assertPublicUrl(value: string, allowLocalhostInDevelopment = false): Promise<ValidatedTarget> {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('آدرس منبع معتبر نیست'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('آدرس منبع معتبر نیست');
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/u, '');
    if (!hostname) throw new BadRequestException('آدرس منبع معتبر نیست');
    const allowLocalhost = allowLocalhostInDevelopment
      && process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1', '::1'].includes(hostname);
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      if (!allowLocalhost) throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    }
    if (isIP(hostname) && isBlockedAddress(hostname) && !allowLocalhost) throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    try {
      const addresses = await this.resolveAddresses(hostname);
      if (!addresses.length || (!allowLocalhost && addresses.some((item) => isBlockedAddress(item.address)))) {
        throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
      }
      if (!isIP(hostname)) url.hostname = hostname;
      return { url, addresses };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('نام میزبان منبع قابل شناسایی نیست');
    }
  }

  private async assertRedirect(location: string, currentUrl: URL): Promise<ValidatedTarget> {
    try {
      return await this.assertPublicUrl(new URL(location, currentUrl).toString());
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('آدرس تغییر مسیر معتبر نیست');
    }
  }

  private createPinnedRequestOptions(
    url: URL,
    address: ResolvedAddress,
    headers: Record<string, string>,
    signal: AbortSignal = AbortSignal.timeout(30_000),
    method = 'GET',
  ): RequestOptions {
    const originalHostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return {
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port: url.port || undefined,
      method,
      path: `${url.pathname}${url.search}`,
      headers: { ...headers, Host: url.host, 'Accept-Encoding': 'identity' },
      signal,
      ...(url.protocol === 'https:' && isIP(originalHostname) === 0 ? { servername: originalHostname } : {}),
    };
  }

  private requestAddress(
    url: URL,
    address: ResolvedAddress,
    headers: Record<string, string>,
    signal: AbortSignal,
    method = 'GET',
    body?: Buffer,
  ): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const options = this.createPinnedRequestOptions(url, address, headers, signal, method);
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(options, resolve);
      request.once('error', reject);
      if (body?.length) request.write(body);
      request.end();
    });
  }

  private async requestPinned(
    target: ValidatedTarget,
    headers: Record<string, string>,
    method = 'GET',
    body?: Buffer,
    timeoutMs = 30_000,
  ): Promise<IncomingMessage> {
    let lastError: unknown;
    const signal = AbortSignal.timeout(timeoutMs);
    for (const address of target.addresses) {
      try {
        return await this.requestAddress(target.url, address, headers, signal, method, body);
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : 'connection failed';
    throw new BadRequestException(`اتصال امن به منبع برقرار نشد: ${reason}`);
  }

  private async readResponse(response: IncomingMessage, maxBytes: number, sizeError: string): Promise<Buffer> {
    const declaredLength = Number(headerValue(response.headers, 'content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      response.destroy();
      throw new BadRequestException(sizeError);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const rawChunk of response) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy();
        throw new BadRequestException(sizeError);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  }

  /**
   * Send credentials or request bodies only after DNS validation, then pin the
   * socket to that exact public address. Redirects are intentionally not
   * followed because forwarding secrets to a second origin is unsafe.
   */
  async safeRequest(value: string, options: SafeHttpRequestOptions = {}): Promise<SafeHttpResponse> {
    const method = String(options.method || 'GET').trim().toUpperCase();
    if (!/^[A-Z]{3,10}$/u.test(method)) throw new BadRequestException('روش درخواست خروجی معتبر نیست');
    const body = options.body === undefined
      ? undefined
      : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(options.body);
    if (body && body.length > 25 * 1024 * 1024) throw new BadRequestException('حجم درخواست خروجی بیش از حد مجاز است');

    const target = await this.assertPublicUrl(value, options.allowLocalhostInDevelopment);
    const headers = { ...(options.headers ?? {}) };
    if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
      headers['Content-Length'] = String(body.length);
    }
    const response = await this.requestPinned(
      target,
      headers,
      method,
      body,
      Math.min(120_000, Math.max(1_000, options.timeoutMs ?? 30_000)),
    );
    const status = response.statusCode || 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.resume();
      throw new BadRequestException('مقصد خروجی تغییر مسیر داد؛ آدرس نهایی سرویس را وارد کنید');
    }
    const contentType = headerValue(response.headers, 'content-type').toLowerCase();
    if (contentType && options.acceptedTypes?.length && !options.acceptedTypes.some((type) => contentType.includes(type))) {
      response.resume();
      throw new BadRequestException('نوع محتوای پاسخ سرویس قابل قبول نیست');
    }
    const buffer = await this.readResponse(
      response,
      options.maxResponseBytes ?? 2 * 1024 * 1024,
      'حجم پاسخ سرویس بیش از حد مجاز است',
    );
    const text = () => new TextDecoder('utf-8').decode(buffer);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: response.headers,
      buffer,
      text,
      json: <T = unknown>() => JSON.parse(text()) as T,
    };
  }

  async safeFetchText(initialUrl: string, maxBytes: number, acceptedTypes: string[]): Promise<string> {
    let target = await this.assertPublicUrl(initialUrl);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const response = await this.requestPinned(target, {
        'user-agent': 'Mozilla/5.0 (compatible; DESKA-Newsroom/1.0; +https://pixad.ir)',
        Accept: `${acceptedTypes.join(', ')}, */*;q=0.1`,
        'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      });
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headerValue(response.headers, 'location');
        response.resume();
        if (!location || redirect === MAX_REDIRECTS) throw new BadRequestException('تعداد تغییر مسیرهای منبع بیش از حد مجاز است');
        target = await this.assertRedirect(location, target.url);
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new BadRequestException(`منبع با خطای HTTP ${status} پاسخ داد`);
      }
      const contentType = headerValue(response.headers, 'content-type').toLowerCase();
      if (contentType && !acceptedTypes.some((type) => contentType.includes(type))) {
        response.resume();
        throw new BadRequestException('نوع محتوای دریافتی از منبع قابل قبول نیست');
      }
      const bytes = await this.readResponse(response, maxBytes, 'حجم محتوای منبع بیش از حد مجاز است');
      return new TextDecoder('utf-8').decode(bytes);
    }
    throw new BadRequestException('دریافت منبع انجام نشد');
  }

  async proxyImage(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    let target = await this.assertPublicUrl(imageUrl);
    const maxBytes = 15 * 1024 * 1024;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const response = await this.requestPinned(target, {
        Accept: 'image/*',
        'User-Agent': 'DESKA-ERP/1.0',
      });
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headerValue(response.headers, 'location');
        response.resume();
        if (!location || redirect === MAX_REDIRECTS) throw new BadRequestException('تعداد تغییر مسیرهای تصویر بیش از حد مجاز است');
        target = await this.assertRedirect(location, target.url);
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new BadRequestException(`تصویر با خطای HTTP ${status} پاسخ داد`);
      }
      const contentType = headerValue(response.headers, 'content-type').split(';')[0].toLowerCase();
      const allowedImageTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
      if (!allowedImageTypes.has(contentType)) {
        response.resume();
        throw new BadRequestException('نوع تصویر قابل قبول نیست');
      }
      const buffer = await this.readResponse(response, maxBytes, 'حجم تصویر بیش از حد مجاز است');
      if (!buffer.length) throw new BadRequestException('پاسخ تصویر خالی است');
      return { buffer, contentType };
    }
    throw new BadRequestException('دریافت تصویر انجام نشد');
  }
}
