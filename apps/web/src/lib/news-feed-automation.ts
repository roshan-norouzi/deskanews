export function newsOrganizationAutomation(settings: Record<string, string | undefined>) {
  return {
    pollIntervalMinutes: settings.news_poll_interval_minutes || '240',
    autoPoll: settings.news_auto_poll !== 'false',
    autoPrepare: settings.news_auto_prepare !== 'false',
    autoPublish: settings.news_auto_publish === 'true',
    autoSendSocial: settings.news_auto_send_social === 'true',
  };
}

export function feedUsesOrganizationDefaults(feed: { settingsMode?: string | null }) {
  return feed.settingsMode !== 'custom';
}

/** Feed probe/health can wait on slow external sources; keep above reverse-proxy timeouts when possible. */
export const FEED_PROBE_REQUEST_TIMEOUT_MS = 90_000;
