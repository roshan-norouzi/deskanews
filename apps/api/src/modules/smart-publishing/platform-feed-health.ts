export type PlatformFeedHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export const PLATFORM_FEED_HEALTH_ITEM_TARGET = 5;
export const PLATFORM_FEED_HEALTH_DOWN_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CATALOG_HEALTH_INTERVAL_HOURS = 6;
export const CATALOG_HEALTH_CHECK_CONCURRENCY = 5;

export interface PlatformFeedHealthEvaluationInput {
  itemCount: number;
  totalEntries: number;
  previousFailSince?: Date | null;
  failed?: boolean;
  errorMessage?: string;
  now?: Date;
}

export interface PlatformFeedHealthEvaluation {
  status: PlatformFeedHealthStatus;
  failSince: Date | null;
  errorMessage: string;
}

export function evaluatePlatformFeedHealth(input: PlatformFeedHealthEvaluationInput): PlatformFeedHealthEvaluation {
  const now = input.now ?? new Date();
  const errorMessage = String(input.errorMessage ?? '').trim();

  const checkPassed = !input.failed
    && input.itemCount >= 1
    && (
      input.itemCount >= PLATFORM_FEED_HEALTH_ITEM_TARGET
      || input.totalEntries < PLATFORM_FEED_HEALTH_ITEM_TARGET
    );

  if (checkPassed) {
    return { status: 'healthy', failSince: null, errorMessage: '' };
  }

  const failSince = input.previousFailSince ? new Date(input.previousFailSince) : now;
  const failDuration = now.getTime() - failSince.getTime();
  const status: PlatformFeedHealthStatus = failDuration >= PLATFORM_FEED_HEALTH_DOWN_MS ? 'down' : 'degraded';
  const message = errorMessage
    || (input.failed ? 'دریافت منبع ناموفق بود' : '')
    || (input.itemCount <= 0 ? 'هیچ مطلبی دریافت نشد' : `تنها ${input.itemCount} مطلب از ${PLATFORM_FEED_HEALTH_ITEM_TARGET} مطلب مورد انتظار دریافت شد`);

  return { status, failSince, errorMessage: message };
}

export function normalizeCatalogHealthIntervalHours(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CATALOG_HEALTH_INTERVAL_HOURS;
  return Math.min(168, Math.max(1, parsed));
}

export function parseCatalogHealthEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized !== 'false' && normalized !== '0';
}
