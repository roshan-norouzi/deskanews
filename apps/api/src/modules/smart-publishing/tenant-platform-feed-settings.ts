export const DEFAULT_PLATFORM_POLL_MINUTES = 240;
/** Original-language catalog retention. Tenant windows longer than this are filled from the source. */
export const PLATFORM_CATALOG_MAX_AGE_DAYS = 3;
export const DEFAULT_NEWS_MAX_AGE_DAYS = 2;

/** Effective org default from publishing settings (`news_poll_interval_minutes`). */
export function resolveOrganizationPollMinutes(raw?: string | number | null): number {
  const fallback = DEFAULT_PLATFORM_POLL_MINUTES;
  const parsed = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim() || String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < 5 || rounded > 1440) return fallback;
  return rounded;
}

export type TenantFeedSettingsMode = 'default' | 'custom';

export type TenantSubscriptionSettings = {
  settingsMode?: string | null;
  includeWords?: string[] | null;
  excludeWords?: string[] | null;
  pollIntervalMinutes?: number | null;
  enabled?: boolean | null;
  autoPoll?: boolean | null;
};

export function resolveTenantFeedSettings(
  subscription: TenantSubscriptionSettings | null | undefined,
  organizationPollMinutes?: number,
) {
  const orgPoll = organizationPollMinutes === undefined
    ? DEFAULT_PLATFORM_POLL_MINUTES
    : resolveOrganizationPollMinutes(organizationPollMinutes);
  if (subscription?.settingsMode === 'custom') {
    const poll = subscription.pollIntervalMinutes;
    return {
      settingsMode: 'custom' as const,
      includeWords: subscription.includeWords ?? [],
      excludeWords: subscription.excludeWords ?? [],
      pollIntervalMinutes: typeof poll === 'number' && poll >= 5 ? poll : orgPoll,
    };
  }
  return {
    settingsMode: 'default' as const,
    includeWords: [] as string[],
    excludeWords: [] as string[],
    pollIntervalMinutes: orgPoll,
  };
}

export function isAutoPollingSubscription(subscription: TenantSubscriptionSettings | null | undefined) {
  return Boolean(subscription?.enabled) && subscription?.autoPoll !== false;
}

export function isSubscriptionDue(
  lastSyncedAt: Date | string | null | undefined,
  pollIntervalMinutes: number,
  now = Date.now(),
) {
  if (!lastSyncedAt) return true;
  const syncedAt = lastSyncedAt instanceof Date ? lastSyncedAt.getTime() : new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(syncedAt)) return true;
  return now - syncedAt >= Math.max(5, pollIntervalMinutes) * 60_000;
}

export function shouldRefreshSharedCatalog(
  lastFetchedAt: Date | string | null | undefined,
  duePollMinutes: number[],
  now = Date.now(),
) {
  if (!duePollMinutes.length) return false;
  if (!lastFetchedAt) return true;
  const fetchedAt = lastFetchedAt instanceof Date ? lastFetchedAt.getTime() : new Date(lastFetchedAt).getTime();
  if (!Number.isFinite(fetchedAt)) return true;
  const minMinutes = Math.min(...duePollMinutes);
  return now - fetchedAt >= Math.max(5, minMinutes) * 60_000;
}
