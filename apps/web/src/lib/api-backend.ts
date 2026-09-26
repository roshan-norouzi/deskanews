/** Server-side URL for the Nest API (Docker service name or localhost in dev). */
export function resolveApiBackendBaseUrl(): string {
  const raw = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';
  return raw.replace(/\/$/u, '');
}

export const API_BACKEND_RETRY_ATTEMPTS = 3;
export const API_BACKEND_RETRY_DELAYS_MS = [150, 400, 900] as const;

export function backendStatusWorthRetry(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function retryDelayForAttempt(attempt: number): number {
  return API_BACKEND_RETRY_DELAYS_MS[Math.min(attempt, API_BACKEND_RETRY_DELAYS_MS.length - 1)] ?? 900;
}

/** True when the upstream connection failed before a usable HTTP response. */
export function backendFetchErrorIsRetryable(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return false;
  }
  return true;
}
