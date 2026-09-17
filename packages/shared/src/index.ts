// Platform branding
export const PLATFORM_NAME = 'دسکا';
export const PLATFORM_TAGLINE = 'سیستم یکپارچه مدیریت سازمان';

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
  { key: 'organization.members.invite', label: 'دعوت عضو سازمان', moduleId: 'platform' },
  { key: 'organization.members.manage', label: 'مدیریت اعضای سازمان', moduleId: 'platform' },
  { key: 'organization.owners.manage', label: 'مدیریت مالکان سازمان', moduleId: 'platform' },
  { key: 'dashboard.view', label: 'مشاهده داشبورد', moduleId: 'platform' },
  { key: 'settings.manage', label: 'مدیریت تنظیمات', moduleId: 'platform' },
  { key: 'users.manage', label: 'مدیریت کاربران', moduleId: 'platform' },
  { key: 'publishing.view', label: 'مشاهده نشر هوشمند', moduleId: 'smart-publishing' },
  { key: 'publishing.manage', label: 'مدیریت محتوای نشر هوشمند', moduleId: 'smart-publishing' },
  { key: 'publishing.publish', label: 'انتشار محتوا', moduleId: 'smart-publishing' },
  { key: 'publishing.settings', label: 'مدیریت تنظیمات و اتصال‌های نشر', moduleId: 'smart-publishing' },
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
    .filter((permission) => !permission.startsWith('platform.') && !['users.manage', 'organization.owners.manage'].includes(permission)),
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
