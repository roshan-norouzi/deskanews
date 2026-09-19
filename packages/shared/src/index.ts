// Platform branding
export const PLATFORM_NAME = 'دسکا';
export const PLATFORM_TAGLINE = 'اتاق خبر هوشمند برای خبرگزاری‌ها و رسانه‌های ایران';

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

// Permission catalog — platform + smart publishing only
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
  { key: 'dashboard.view', label: 'مشاهده داشبورد', moduleId: 'platform' },
  { key: 'settings.manage', label: 'مدیریت تنظیمات', moduleId: 'platform' },
  { key: 'users.manage', label: 'مدیریت کاربران', moduleId: 'platform' },
  { key: 'publishing.view', label: 'مشاهده انتشار', moduleId: 'smart-publishing' },
  { key: 'publishing.manage', label: 'مدیریت محتوای انتشار', moduleId: 'smart-publishing' },
  { key: 'publishing.publish', label: 'انتشار محتوا', moduleId: 'smart-publishing' },
  { key: 'publishing.settings', label: 'مدیریت تنظیمات انتشار', moduleId: 'smart-publishing' },
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number]['key'];

const VIEW_PERMISSIONS = APP_PERMISSIONS
  .map((permission) => permission.key)
  .filter((permission) => permission.endsWith('.view'));

/**
 * Safe defaults for the built-in organizational roles.
 */
export const DEFAULT_TENANT_ROLE_PERMISSIONS: Record<TenantRole, readonly AppPermission[]> = {
  owner: APP_PERMISSIONS.map((permission) => permission.key),
  admin: APP_PERMISSIONS.map((permission) => permission.key),
  manager: APP_PERMISSIONS
    .map((permission) => permission.key)
    .filter((permission) => !permission.startsWith('platform.') && !['users.manage', 'organization.owners.manage', 'organization.members.add'].includes(permission)),
  senior_specialist: [
    ...VIEW_PERMISSIONS,
    'publishing.manage',
    'publishing.publish',
  ] as AppPermission[],
  member: VIEW_PERMISSIONS as AppPermission[],
  viewer: VIEW_PERMISSIONS as AppPermission[],
};

export function getDefaultPermissionsForTenantRole(role: string): string[] {
  return [...(DEFAULT_TENANT_ROLE_PERMISSIONS[role as TenantRole] ?? [])];
}

/** Permissions an organization owner can assign to members (excludes platform-wide controls). */
export const ORGANIZATION_ASSIGNABLE_PERMISSIONS = APP_PERMISSIONS
  .map((permission) => permission.key)
  .filter((key) => !key.startsWith('platform.') && key !== 'organization.owners.manage') as AppPermission[];

export function isOrganizationAssignablePermission(key: string): key is AppPermission {
  return (ORGANIZATION_ASSIGNABLE_PERMISSIONS as readonly string[]).includes(key);
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
}

export const PLATFORM_PLANS: Record<string, PlanLimits> = {
  starter: {
    maxUsers: 5,
    maxStorageMb: 1024,
  },
  professional: {
    maxUsers: 25,
    maxStorageMb: 10240,
  },
  enterprise: {
    maxUsers: 999,
    maxStorageMb: 102400,
  },
};

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
