export const DESTINATION_HEALTH_KEY = 'destination';
export const DESTINATION_HEALTH_NAME = 'سایت مقصد';

export function destinationPlatformId(settings: Record<string, string | undefined>): string {
  const value = String(settings.destination_platform || 'wordpress').trim();
  if (value === 'iransamaneh' || value === 'nastooh') return value;
  return 'wordpress';
}

export function isDestinationConfigured(settings: Record<string, string | undefined>): boolean {
  const platform = destinationPlatformId(settings);
  if (platform === 'iransamaneh') {
    return Boolean(settings.is_site_url && settings.is_username && settings.is_password);
  }
  if (platform === 'nastooh') {
    return Boolean(settings.ns_site_url && settings.ns_username && settings.ns_password);
  }
  return Boolean(settings.wp_site_url && settings.wp_username && settings.wp_app_password);
}
