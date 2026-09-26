import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  API_BACKEND_RETRY_ATTEMPTS,
  backendStatusWorthRetry,
  retryDelayForAttempt,
  sleepMs,
} from '@/lib/api-backend';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TOKEN_KEY = 'deska_access_token';
const REFRESH_KEY = 'deska_refresh_token';
const TENANT_KEY = 'deska_tenant_id';
const PUBLISHING_SETTINGS_DRAFT_KEY = 'deska_publishing_settings_draft';
export const TENANT_CHANGED_EVENT = 'deska-tenant-changed';
export const SESSION_EXPIRED_EVENT = 'deska-session-expired';

function notifyTenantChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TENANT_CHANGED_EVENT));
}

export function withBasePath(path: string): string {
  const basePath = runtimeBasePath();
  if (!basePath || !path.startsWith('/')) return path;
  return `${basePath.replace(/\/$/, '')}${path}`;
}

/**
 * Keep same-origin API calls working when a prebuilt image is mounted under a
 * sub-path but the build-time base-path variable was not forwarded by the
 * hosting panel. The explicit value always wins; the browser fallback only
 * treats an unknown first URL segment as the application mount point.
 */
function runtimeBasePath(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  if (configured) return configured;
  if (typeof window === 'undefined') return '';
  const first = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  const appRoutes = new Set(['login', 'register', 'invitations', 'organizations', 'dashboard', 'publishing', 'settings', 'users', 'admin', 'platform']);
  return first && !appRoutes.has(first) ? `/${first}` : '';
}

export function getTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TENANT_KEY);
}

/** Remove credentials written by releases that predate HttpOnly-cookie sessions. */
export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function setTenantId(tenantId: string) {
  localStorage.setItem(TENANT_KEY, tenantId);
  notifyTenantChanged();
}

export function clearTenantId() {
  localStorage.removeItem(TENANT_KEY);
  notifyTenantChanged();
}

export function clearPublishingSettingsDraft() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PUBLISHING_SETTINGS_DRAFT_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(withBasePath('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    });

    if (!res.ok) {
      clearTokens();
      if ((res.status === 401 || res.status === 403) && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
      return false;
    }

    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function apiUnreachableMessage(kind: 'network' | 'proxy'): string {
  const base =
    kind === 'network'
      ? 'ارتباط با دسکا برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید. اگر مشکل ادامه داشت، به پشتیبانی اطلاع دهید.'
      : 'سرویس دسکا موقتاً در دسترس نیست. چند لحظه دیگر دوباره تلاش کنید. اگر مشکل ادامه داشت، به پشتیبانی اطلاع دهید.';
  if (process.env.NODE_ENV !== 'development') return base;
  return `${base} در لوکال معمولاً API روی پورت 3101 بالا نیست — «pnpm start» (یا «pnpm dev:api») را اجرا کنید.`;
}

function parseApiErrorPayload(rawText: string): { message?: string | string[] } | null {
  if (!rawText.trim()) return null;
  try {
    return JSON.parse(rawText) as { message?: string | string[] };
  } catch {
    return null;
  }
}

function formatApiErrorMessage(errorData: { message?: string | string[] } | null, fallback: string): string {
  if (!errorData?.message) return fallback;
  return Array.isArray(errorData.message) ? errorData.message.join('، ') : errorData.message;
}

function looksLikeInfrastructureProxyFailure(status: number, rawText: string): boolean {
  if (status === 502 || status === 504) return true;
  if (status < 500) return false;
  const trimmed = rawText.trim();
  if (!trimmed) return true;
  if (trimmed === 'Internal Server Error') return true;
  if (/ECONNREFUSED|ECONNRESET|Bad Gateway|Gateway Timeout/i.test(trimmed)) return true;
  const json = parseApiErrorPayload(trimmed);
  if (json?.message) return false;
  return false;
}

async function fetchWithTransientRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < API_BACKEND_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (backendStatusWorthRetry(response.status) && attempt < API_BACKEND_RETRY_ATTEMPTS - 1) {
        await sleepMs(retryDelayForAttempt(attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
      if (timedOut || attempt >= API_BACKEND_RETRY_ATTEMPTS - 1) throw error;
      await sleepMs(retryDelayForAttempt(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('fetch failed');
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
  skipTenant?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, skipAuth, skipTenant, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipTenant) {
    const tenantId = getTenantId();
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
  }

  const url = withBasePath(path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);

  let response: Response;
  try {
    response = await fetchWithTransientRetry(url, {
      ...rest,
      credentials: rest.credentials ?? 'include',
      headers,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (timedOut) {
      throw new ApiError(
        'پاسخ درخواست در زمان مقرر دریافت نشد. پیش از تکرار عملیات، وضعیت آن را بررسی کنید. اگر مشکل ادامه داشت، به پشتیبانی اطلاع دهید.',
        504,
      );
    }
    throw new ApiError(apiUnreachableMessage('network'), 503);
  }

  if (response.status === 401 && !skipAuth) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      response = await fetchWithTransientRetry(url, {
        ...rest,
        credentials: rest.credentials ?? 'include',
        headers,
        body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!response.ok) {
    let errorData: unknown;
    let rawText = '';
    try {
      rawText = await response.text();
      errorData = rawText ? JSON.parse(rawText) : null;
    } catch {
      errorData = rawText || null;
    }

    const parsed = parseApiErrorPayload(rawText);
    const isGatewayTimeout = response.status === 502 || response.status === 504;
    const isProxyFailure = looksLikeInfrastructureProxyFailure(response.status, rawText);

    const message = response.status === 413
      ? 'حجم فایل از حد مجاز بیشتر است. فایل کوچک‌تری انتخاب کنید یا حجم آن را کاهش دهید.'
      : isGatewayTimeout
      ? 'پاسخ درخواست در زمان مقرر دریافت نشد. پیش از تکرار عملیات، وضعیت آن را بررسی کنید. اگر مشکل ادامه داشت، به پشتیبانی اطلاع دهید.'
      : isProxyFailure
      ? apiUnreachableMessage('proxy')
      : formatApiErrorMessage(parsed, `خطای ${response.status}`);

    throw new ApiError(message, response.status, errorData);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const text = await response.text();
      if (!text.trim()) return undefined as T;
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('پاسخ نامعتبر از سرور', response.status);
    }
  }

  return undefined as T;
}

export async function apiFetchBlob(path: string, options: ApiFetchOptions = {}): Promise<Blob> {
  const { body, skipAuth, skipTenant, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (!skipTenant) {
    const tenantId = getTenantId();
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
  }

  const url = withBasePath(path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);

  const response = await fetchWithTransientRetry(url, {
    ...rest,
    credentials: rest.credentials ?? 'include',
    headers,
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !skipAuth) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      const retry = await fetchWithTransientRetry(url, {
        ...rest,
        credentials: rest.credentials ?? 'include',
        headers,
        body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) throw new ApiError(`خطای ${retry.status}`, retry.status);
      return retry.blob();
    }
  }

  if (!response.ok) {
    throw new ApiError(`خطای ${response.status}`, response.status);
  }

  return response.blob();
}
