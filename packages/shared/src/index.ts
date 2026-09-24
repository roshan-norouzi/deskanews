// Platform branding
export const PLATFORM_NAME = 'دسکا';
/** Product title shown in marketing and login hero. */
export const PLATFORM_TAGLINE = 'میز خبر هوشمند';
/** Longer line for meta description and secondary copy. */
export const PLATFORM_DESCRIPTION =
  'میز خبر هوشمند برای خبرگزاری‌ها و رسانه‌های ایران — پایش منبع، آماده‌سازی و انتشار.';
/** Menu label for the site publishing workflow (/publishing/news). */
export const NEWS_DESK_LABEL = 'میز خبر';

// Platform roles
export const PLATFORM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'platform_admin',
  USER: 'user',
} as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

// Tenant roles (stored on TenantMember.role)
export const TENANT_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  SENIOR_SPECIALIST: 'senior_specialist',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export type TenantRole = (typeof TENANT_ROLES)[keyof typeof TENANT_ROLES];

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  owner: 'مالک',
  admin: 'مدیر ارشد',
  manager: 'مدیر',
  senior_specialist: 'کارشناس ارشد',
  member: 'کارشناس',
  viewer: 'مشاهده‌گر',
};

export const PLATFORM_USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
  PENDING: 'pending',
} as const;

export const TENANT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
} as const;

export const MEMBERSHIP_STATUS = {
  ACTIVE: 'active',
  INVITED: 'invited',
  PENDING: 'pending',
  INACTIVE: 'inactive',
  REMOVED: 'removed',
} as const;

/** Roles selectable when adding/editing organization members (excludes owner). */
export const ORGANIZATIONAL_ROLES = [
  TENANT_ROLES.ADMIN,
  TENANT_ROLES.MANAGER,
  TENANT_ROLES.SENIOR_SPECIALIST,
  TENANT_ROLES.MEMBER,
  TENANT_ROLES.VIEWER,
] as const;

export type OrganizationalRole = (typeof ORGANIZATIONAL_ROLES)[number];

export const NEWSROOM_ALL_SERVICES = '*';

/** Menu items an organization owner can grant to members. */
export const ORGANIZATION_MENU_PERMISSIONS = [
  { key: 'dashboard.view', label: 'داشبورد', group: 'خانه', href: '/dashboard' },
  { key: 'publishing.feeds', label: 'منابع خبری', group: 'محتوا', href: '/publishing/feeds' },
  { key: 'publishing.news', label: NEWS_DESK_LABEL, group: 'محتوا', href: '/publishing/news' },
  { key: 'publishing.social', label: 'استودیوی اجتماعی', group: 'محتوا', href: '/publishing/social' },
  { key: 'publishing.media', label: 'فایل‌ها', group: 'محتوا', href: '/publishing/media' },
  { key: 'publishing.settings', label: 'تنظیمات انتشار', group: 'پیکربندی', href: '/publishing/settings' },
  { key: 'publishing.operations', label: 'مرکز عملیات', group: 'پیکربندی', href: '/publishing/operations' },
  { key: 'settings.manage', label: 'تنظیمات سازمان (سازمان و کاربران)', group: 'پیکربندی', href: '/settings' },
] as const;

export type OrganizationMenuPermission = (typeof ORGANIZATION_MENU_PERMISSIONS)[number]['key'];

const PUBLISHING_MENU_PERMISSIONS = ORGANIZATION_MENU_PERMISSIONS
  .map((item) => item.key)
  .filter((key) => key.startsWith('publishing.'));

/** Legacy publishing.* keys expand to menu routes, except settings (explicit grant only). */
const PUBLISHING_LEGACY_EXPANDED_PERMISSIONS = PUBLISHING_MENU_PERMISSIONS.filter(
  (key) => key !== 'publishing.settings',
);

// Permission catalog — platform + organization menu + legacy keys
export const APP_PERMISSIONS = [
  { key: 'platform.admin', label: 'مدیریت پلتفرم', moduleId: 'platform' },
  { key: 'platform.users.view', label: 'مشاهده کاربران پلتفرم', moduleId: 'platform' },
  { key: 'platform.users.manage', label: 'مدیریت کاربران پلتفرم', moduleId: 'platform' },
  { key: 'platform.organizations.view', label: 'مشاهده سازمان‌های پلتفرم', moduleId: 'platform' },
  { key: 'platform.organizations.manage', label: 'مدیریت سازمان‌های پلتفرم', moduleId: 'platform' },
  { key: 'organization.members.view', label: 'مشاهده اعضای سازمان', moduleId: 'platform' },
  { key: 'organization.members.add', label: 'افزودن عضو سازمان', moduleId: 'platform' },
  { key: 'organization.members.manage', label: 'مدیریت اعضای سازمان', moduleId: 'platform' },
  { key: 'organization.owners.manage', label: 'مدیریت مالکان سازمان', moduleId: 'platform' },
  { key: 'dashboard.view', label: 'داشبورد', moduleId: 'platform' },
  { key: 'settings.manage', label: 'تنظیمات سازمان', moduleId: 'platform' },
  { key: 'users.manage', label: 'مدیریت کاربران', moduleId: 'platform' },
  { key: 'publishing.feeds', label: 'منابع خبری', moduleId: 'smart-publishing' },
  { key: 'publishing.news', label: NEWS_DESK_LABEL, moduleId: 'smart-publishing' },
  { key: 'publishing.social', label: 'استودیوی اجتماعی', moduleId: 'smart-publishing' },
  { key: 'publishing.media', label: 'فایل‌ها', moduleId: 'smart-publishing' },
  { key: 'publishing.operations', label: 'مرکز عملیات', moduleId: 'smart-publishing' },
  { key: 'publishing.settings', label: 'تنظیمات انتشار', moduleId: 'smart-publishing' },
  { key: 'publishing.view', label: 'مشاهده انتشار', moduleId: 'smart-publishing' },
  { key: 'publishing.manage', label: 'مدیریت محتوای انتشار', moduleId: 'smart-publishing' },
  { key: 'publishing.publish', label: 'انتشار محتوا', moduleId: 'smart-publishing' },
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number]['key'];

const MENU_PERMISSION_SET = new Set<string>(ORGANIZATION_MENU_PERMISSIONS.map((item) => item.key));

/**
 * Safe defaults for the built-in organizational roles.
 */
export const DEFAULT_TENANT_ROLE_PERMISSIONS: Record<TenantRole, readonly AppPermission[]> = {
  owner: APP_PERMISSIONS.map((permission) => permission.key),
  admin: APP_PERMISSIONS.map((permission) => permission.key),
  manager: ORGANIZATION_MENU_PERMISSIONS.map((item) => item.key),
  senior_specialist: ORGANIZATION_MENU_PERMISSIONS
    .map((item) => item.key)
    .filter((key) => key !== 'settings.manage'),
  member: ['dashboard.view', 'publishing.news', 'publishing.social'],
  viewer: ['dashboard.view', 'publishing.news'],
};

export function getDefaultPermissionsForTenantRole(role: string): string[] {
  return [...(DEFAULT_TENANT_ROLE_PERMISSIONS[role as TenantRole] ?? [])];
}

export const ORGANIZATION_ASSIGNABLE_PERMISSIONS = ORGANIZATION_MENU_PERMISSIONS.map((item) => item.key);

export function isOrganizationAssignablePermission(key: string): key is OrganizationMenuPermission {
  return MENU_PERMISSION_SET.has(key);
}

export function expandMemberPermissions(permissions: readonly string[]): string[] {
  const expanded = new Set(permissions);
  if (expanded.has('*')) return ['*'];
  if (expanded.has('publishing.view') || expanded.has('publishing.manage') || expanded.has('publishing.publish')) {
    for (const key of PUBLISHING_LEGACY_EXPANDED_PERMISSIONS) expanded.add(key);
  }
  if (expanded.has('users.manage') || expanded.has('organization.members.manage') || expanded.has('organization.members.view') || expanded.has('organization.members.add')) {
    expanded.add('settings.manage');
  }
  return [...expanded];
}

export function memberHasPermission(permissions: readonly string[], required: string): boolean {
  const expanded = expandMemberPermissions(permissions);
  if (expanded.includes('*') || expanded.includes(required)) return true;
  if (required === 'publishing.view') {
    return ['publishing.settings', ...PUBLISHING_MENU_PERMISSIONS].some((key) => expanded.includes(key));
  }
  return false;
}

export function permissionsForPicker(permissions: readonly string[]): OrganizationMenuPermission[] {
  const expanded = expandMemberPermissions(permissions);
  if (expanded.includes('*')) return [...ORGANIZATION_ASSIGNABLE_PERMISSIONS];
  return ORGANIZATION_ASSIGNABLE_PERMISSIONS.filter((key) => expanded.includes(key));
}

export function normalizeNewsroomServiceIds(
  permissions: readonly string[],
  serviceIds: readonly string[] | null | undefined,
): string[] {
  const expanded = expandMemberPermissions(permissions);
  if (!expanded.includes('*') && !expanded.includes('publishing.news')) return [];
  const unique = [...new Set((serviceIds ?? []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!unique.length || unique.includes(NEWSROOM_ALL_SERVICES)) return [NEWSROOM_ALL_SERVICES];
  return unique;
}

export function resolveNewsroomServiceAccess(
  permissions: readonly string[],
  serviceIds: readonly string[] | null | undefined,
): 'all' | 'none' | string[] {
  const expanded = expandMemberPermissions(permissions);
  if (expanded.includes('*')) return 'all';
  if (!expanded.includes('publishing.news')) return 'none';
  const normalized = normalizeNewsroomServiceIds(permissions, serviceIds);
  if (normalized.includes(NEWSROOM_ALL_SERVICES)) return 'all';
  return normalized;
}

export function organizationMenuPermissionGroups() {
  const groups = new Map<string, Array<(typeof ORGANIZATION_MENU_PERMISSIONS)[number]>>();
  for (const item of ORGANIZATION_MENU_PERMISSIONS) {
    const current = groups.get(item.group) ?? [];
    current.push(item);
    groups.set(item.group, current);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

export function menuPermissionLabel(key: string): string {
  return ORGANIZATION_MENU_PERMISSIONS.find((item) => item.key === key)?.label
    ?? APP_PERMISSIONS.find((item) => item.key === key)?.label
    ?? key;
}

export const USAGE_METRIC_KEYS = {
  NEWS_MONITORED: 'news.monitored',
  NEWS_PREPARED: 'news.prepared',
  NEWS_SUMMARIZED: 'news.summarized',
  NEWS_REWRITTEN: 'news.rewritten',
  NEWS_TRANSLATED: 'news.translated',
  NEWS_PUBLISHED: 'news.published',
  NEWS_SENT_SOCIAL: 'news.sent-social',
  SOCIAL_MONITORED: 'social.monitored',
  SOCIAL_PREPARED: 'social.prepared',
  SOCIAL_COVER: 'social.cover',
  SOCIAL_PUBLISHED: 'social.published',
} as const;

export type UsageMetricKey = (typeof USAGE_METRIC_KEYS)[keyof typeof USAGE_METRIC_KEYS];

export const USAGE_UNIT_LABEL = 'توکن';

export const DEFAULT_USAGE_METRICS: Array<{
  key: UsageMetricKey;
  label: string;
  unitLabel: typeof USAGE_UNIT_LABEL;
  unitCost: number;
  sortOrder: number;
}> = [
  { key: USAGE_METRIC_KEYS.NEWS_MONITORED, label: 'پایش خبر', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 10 },
  { key: USAGE_METRIC_KEYS.NEWS_PREPARED, label: 'آماده‌سازی خبر', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 20 },
  { key: USAGE_METRIC_KEYS.NEWS_SUMMARIZED, label: 'خلاصه‌سازی خبر', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 30 },
  { key: USAGE_METRIC_KEYS.NEWS_REWRITTEN, label: 'بازنویسی خبر', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 35 },
  { key: USAGE_METRIC_KEYS.NEWS_TRANSLATED, label: 'ترجمه متن کامل', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 40 },
  { key: USAGE_METRIC_KEYS.NEWS_PUBLISHED, label: 'انتشار در سایت', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 50 },
  { key: USAGE_METRIC_KEYS.NEWS_SENT_SOCIAL, label: 'ارسال به استودیو', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 55 },
  { key: USAGE_METRIC_KEYS.SOCIAL_MONITORED, label: 'پایش استودیو', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 60 },
  { key: USAGE_METRIC_KEYS.SOCIAL_PREPARED, label: 'آماده‌سازی مطلب اجتماعی', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 70 },
  { key: USAGE_METRIC_KEYS.SOCIAL_COVER, label: 'تولید تصویر کاور', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 80 },
  { key: USAGE_METRIC_KEYS.SOCIAL_PUBLISHED, label: 'انتشار در شبکه اجتماعی', unitLabel: USAGE_UNIT_LABEL, unitCost: 1, sortOrder: 90 },
];

export function isUsageMetricKey(value: string): value is UsageMetricKey {
  return (Object.values(USAGE_METRIC_KEYS) as string[]).includes(value);
}

export function getUsageMetricDefinition(key: UsageMetricKey) {
  return DEFAULT_USAGE_METRICS.find((metric) => metric.key === key);
}

// Subscription plans
export interface PlanLimits {
  maxUsers: number;
  maxStorageMb: number;
  monthlyTokens: number;
}

export const PLATFORM_PLANS: Record<string, PlanLimits> = {
  starter: { maxUsers: 5, maxStorageMb: 1024, monthlyTokens: 500 },
  professional: { maxUsers: 25, maxStorageMb: 10240, monthlyTokens: 5000 },
  enterprise: { maxUsers: 999, maxStorageMb: 102400, monthlyTokens: 50000 },
};

export interface TokenTopUpPackage {
  id: string;
  label: string;
  tokenAmount: number;
  amountRials: number;
}

/** Server-defined top-up bundles. Clients may only pass package id, never custom token counts. */
export const TOKEN_TOP_UP_PACKAGES: readonly TokenTopUpPackage[] = [
  { id: 'tokens-1000', label: '۱٬۰۰۰ توکن', tokenAmount: 1000, amountRials: 500_000 },
  { id: 'tokens-5000', label: '۵٬۰۰۰ توکن', tokenAmount: 5000, amountRials: 2_000_000 },
  { id: 'tokens-20000', label: '۲۰٬۰۰۰ توکن', tokenAmount: 20_000, amountRials: 6_000_000 },
];

export function resolveTokenTopUpPackage(packageId: string): TokenTopUpPackage | undefined {
  const id = packageId.trim();
  return TOKEN_TOP_UP_PACKAGES.find((pack) => pack.id === id);
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس',
  pending: 'در انتظار',
  approved: 'تأیید شده',
  rejected: 'رد شده',
  cancelled: 'لغو شده',
  active: 'فعال',
  inactive: 'غیرفعال',
  open: 'باز',
  closed: 'بسته',
  new: 'جدید',
};

export function getPermissionsForModule(moduleId: string) {
  return APP_PERMISSIONS.filter((p) => p.moduleId === moduleId);
}

export * from './persian-calendar';
export * from './iran-locations';
export * from './iran-banks';
export * from './employee-profile';
export * from './employee';
export * from './source-language';
export * from './default-platform-feeds';
export * from './feed-source-types';
export * from './feed-catalog-groups';
export * from './feed-topic-labels';
export * from './feed-logo';
export * from './news-publish-html';
