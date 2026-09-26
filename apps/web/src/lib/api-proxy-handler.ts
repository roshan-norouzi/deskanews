import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  API_BACKEND_RETRY_ATTEMPTS,
  backendFetchErrorIsRetryable,
  backendStatusWorthRetry,
  resolveApiBackendBaseUrl,
  retryDelayForAttempt,
  sleepMs,
} from '@/lib/api-backend';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function buildBackendUrl(pathSegments: string[], search: string): string {
  const base = resolveApiBackendBaseUrl();
  const suffix = pathSegments.map(encodeURIComponent).join('/');
  const query = search || '';
  return `${base}/api/${suffix}${query}`;
}

function forwardRequestHeaders(request: NextRequest, targetUrl: URL): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === 'host' || lower === 'content-length') return;
    headers.set(key, value);
  });
  headers.set('host', targetUrl.host);
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    headers.set('x-forwarded-for', forwardedFor);
  } else {
    const realIp = request.headers.get('x-real-ip');
    if (realIp) headers.set('x-forwarded-for', realIp);
  }
  const proto = request.headers.get('x-forwarded-proto') ?? (targetUrl.protocol === 'https:' ? 'https' : 'http');
  headers.set('x-forwarded-proto', proto);
  if (!headers.has('x-forwarded-host')) {
    headers.set('x-forwarded-host', request.headers.get('host') ?? targetUrl.host);
  }
  return headers;
}

function forwardResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.append(key, value);
  });
  return headers;
}

async function readRequestBody(request: NextRequest): Promise<ArrayBuffer | undefined> {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;
  return request.arrayBuffer();
}

export async function proxyApiRequest(request: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const targetUrl = new URL(buildBackendUrl(pathSegments, request.nextUrl.search));
  const headers = forwardRequestHeaders(request, targetUrl);
  const body = await readRequestBody(request);
  const method = request.method.toUpperCase();

  let lastError: unknown;
  for (let attempt = 0; attempt < API_BACKEND_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(120_000),
      });

      if (backendStatusWorthRetry(upstream.status) && attempt < API_BACKEND_RETRY_ATTEMPTS - 1) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn(
            `[api-proxy] ${method} ${targetUrl.pathname} returned ${upstream.status}; retry ${attempt + 2}/${API_BACKEND_RETRY_ATTEMPTS}`,
          );
        }
        await upstream.body?.cancel().catch(() => undefined);
        await sleepMs(retryDelayForAttempt(attempt));
        continue;
      }

      return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: forwardResponseHeaders(upstream),
      });
    } catch (error) {
      lastError = error;
      if (!backendFetchErrorIsRetryable(error) || attempt >= API_BACKEND_RETRY_ATTEMPTS - 1) break;
      if (process.env.NODE_ENV !== 'test') {
        const detail = error instanceof Error ? error.message : 'unknown';
        console.warn(
          `[api-proxy] ${method} ${targetUrl.pathname} failed (${detail}); retry ${attempt + 2}/${API_BACKEND_RETRY_ATTEMPTS}`,
        );
      }
      await sleepMs(retryDelayForAttempt(attempt));
    }
  }

  const detail = lastError instanceof Error ? lastError.message : 'upstream unreachable';
  return NextResponse.json(
    {
      statusCode: 503,
      message: 'سرویس دسکا موقتاً در دسترس نیست. چند لحظه دیگر دوباره تلاش کنید.',
      proxyError: process.env.NODE_ENV === 'development' ? detail : undefined,
    },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}
