import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TOKEN_KEY = 'deska_access_token';
const REFRESH_KEY = 'deska_refresh_token';
const TENANT_KEY = 'deska_tenant_id';
const PUBLISHING_SETTINGS_DRAFT_KEY = 'deska_publishing_settings_draft';
export const TENANT_CHANGED_EVENT = 'deska-tenant-changed';

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
    response = await fetch(url, {
      ...rest,
      credentials: rest.credentials ?? 'include',
      headers,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('ارتباط با سرور API برقرار نشد؛ وضعیت API و reverse proxy را بررسی کنید.', 503);
  }

  if (response.status === 401 && !skipAuth) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      response = await fetch(url, {
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

    const isProxyFailure =
      response.status >= 500 &&
      (rawText === 'Internal Server Error' ||
        rawText.includes('ECONNREFUSED') ||
        rawText.includes('ECONNRESET') ||
        rawText.includes('Gateway Timeout') ||
        !rawText.trim());

    const message = response.status === 413
      ? 'حجم فایل از حد مجاز بیشتر است؛ فایل Excel را کوچک‌تر کنید یا با پشتیبانی تماس بگیرید.'
      : isProxyFailure
      ? 'ارتباط Web با سرور API برقرار نشد؛ وضعیت API و reverse proxy را بررسی کنید.'
      : (errorData as { message?: string | string[] })?.message
        ? Array.isArray((errorData as { message: string[] }).message)
          ? (errorData as { message: string[] }).message.join('، ')
          : (errorData as { message: string }).message
        : `خطای ${response.status}`;

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

  const response = await fetch(url, {
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
      const retry = await fetch(url, {
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
