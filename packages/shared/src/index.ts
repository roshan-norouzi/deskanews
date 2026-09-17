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

/** Roles selectable when adding/editing employees (excludes owner). */
export const ORGANIZATIONAL_ROLES = [
  TENANT_ROLES.ADMIN,
  TENANT_ROLES.MANAGER,
  TENANT_ROLES.SENIOR_SPECIALIST,
  TENANT_ROLES.MEMBER,
  TENANT_ROLES.VIEWER,
] as const;

export type OrganizationalRole = (typeof ORGANIZATIONAL_ROLES)[number];

// Contact types
export const CONTACT_TYPES = {
  PERSON: 'person',
  COMPANY: 'company',
} as const;

export type ContactType = (typeof CONTACT_TYPES)[keyof typeof CONTACT_TYPES];

// Recurrence
export const RECURRENCE_TYPE = {
  NONE: 'none',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export const RECURRENCE_CALENDAR = {
  JALALI: 'jalali',
  GREGORIAN: 'gregorian',
  LUNAR: 'lunar',
} as const;

// Employees
export const EMPLOYEE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  TERMINATED: 'terminated',
} as const;

// Custom field types
export const CUSTOM_FIELD_TYPES = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  SELECT: 'select',
  BOOLEAN: 'boolean',
  RELATION: 'relation',
} as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[keyof typeof CUSTOM_FIELD_TYPES];

// Module domains
export const MODULE_DOMAINS = {
  PLATFORM: 'platform',
  PRODUCTIVITY: 'productivity',
} as const;

// Permission catalog
export const APP_PERMISSIONS = [
  // Platform
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
  { key: 'modules.manage', label: 'مدیریت ماژول‌ها', moduleId: 'platform' },
  // Contacts
  { key: 'contacts.view', label: 'مشاهده مخاطبین', moduleId: 'contacts' },
  { key: 'contacts.create', label: 'ایجاد مخاطب', moduleId: 'contacts' },
  { key: 'contacts.update', label: 'ویرایش مخاطب', moduleId: 'contacts' },
  { key: 'contacts.delete', label: 'حذف مخاطب', moduleId: 'contacts' },
  // Documents
  { key: 'documents.view', label: 'مشاهده اسناد', moduleId: 'documents' },
  { key: 'documents.upload', label: 'آپلود سند', moduleId: 'documents' },
  { key: 'documents.delete', label: 'حذف سند', moduleId: 'documents' },
  // Calendar
  { key: 'calendar.view', label: 'مشاهده تقویم', moduleId: 'calendar' },
  { key: 'calendar.manage', label: 'مدیریت رویدادها', moduleId: 'calendar' },
  // Core employees
  { key: 'employees.view', label: 'مشاهده کارمندان', moduleId: 'employees' },
  { key: 'employees.manage', label: 'مدیریت کارمندان', moduleId: 'employees' },
  // Projects
  { key: 'projects.view', label: 'مشاهده پروژه‌ها و تسک‌ها', moduleId: 'projects-tasks' },
  { key: 'projects.manage', label: 'مدیریت پروژه‌ها و تسک‌ها', moduleId: 'projects-tasks' },
  { key: 'projects.approve', label: 'تصمیم‌گیری در تأییدیه‌های پروژه', moduleId: 'projects-tasks' },
  // Smart publishing
  { key: 'publishing.view', label: 'مشاهده نشر هوشمند', moduleId: 'smart-publishing' },
  { key: 'publishing.manage', label: 'مدیریت محتوای نشر هوشمند', moduleId: 'smart-publishing' },
  { key: 'publishing.publish', label: 'انتشار محتوا', moduleId: 'smart-publishing' },
  { key: 'publishing.settings', label: 'مدیریت تنظیمات و اتصال‌های نشر', moduleId: 'smart-publishing' },
  // Event management
  { key: 'event-management.view', label: 'مشاهده مدیریت رویداد', moduleId: 'event-management' },
  { key: 'event-management.manage', label: 'مدیریت رویدادها', moduleId: 'event-management' },
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
    .filter((permission) => !permission.startsWith('platform.') && !['users.manage', 'modules.manage', 'organization.owners.manage'].includes(permission)),
  senior_specialist: [
    ...VIEW_PERMISSIONS,
    'contacts.create',
    'contacts.update',
    'documents.upload',
    'calendar.manage',
    'projects.manage',
    'publishing.manage',
    'event-management.manage',
  ] as AppPermission[],
  member: VIEW_PERMISSIONS as AppPermission[],
  viewer: VIEW_PERMISSIONS as AppPermission[],
};

export function getDefaultPermissionsForTenantRole(role: string): string[] {
  return [...(DEFAULT_TENANT_ROLE_PERMISSIONS[role as TenantRole] ?? [])];
}

// Module catalog
export const MODULE_CATALOG = [
  { id: 'contacts', name: 'مخاطبین', domain: MODULE_DOMAINS.PLATFORM, version: '1.0.0', dependencies: [], isCore: true },
  { id: 'documents', name: 'اسناد', domain: MODULE_DOMAINS.PRODUCTIVITY, version: '1.0.0', dependencies: [], isCore: true },
  { id: 'calendar', name: 'تقویم', domain: MODULE_DOMAINS.PRODUCTIVITY, version: '1.0.0', dependencies: [], isCore: true },
  { id: 'employees', name: 'کارمندان', domain: MODULE_DOMAINS.PLATFORM, version: '1.0.0', dependencies: [], isCore: true },
  { id: 'projects-tasks', name: 'مدیریت پروژه و تسک', domain: MODULE_DOMAINS.PRODUCTIVITY, version: '1.0.0', dependencies: [], isCore: false },
  { id: 'smart-publishing', name: 'نشر هوشمند', domain: MODULE_DOMAINS.PRODUCTIVITY, version: '1.0.0', dependencies: [], isCore: false },
  { id: 'event-management', name: 'مدیریت رویداد', domain: MODULE_DOMAINS.PRODUCTIVITY, version: '1.0.0', dependencies: ['calendar'], isCore: false },
] as const;

/** Modules fully delivered in the product (not auto-enabled for tenants) */
export const FINALIZED_MODULE_IDS = [
  'contacts',
  'documents',
  'calendar',
  'employees',
  'projects-tasks',
  'smart-publishing',
  'event-management',
] as const;

export type FinalizedModuleId = (typeof FINALIZED_MODULE_IDS)[number];

/** @deprecated Use FINALIZED_MODULE_IDS — kept for tooling */
export const IMPLEMENTED_MODULE_IDS = [...FINALIZED_MODULE_IDS];

export const MODULE_DOMAIN_LABELS: Record<string, string> = {
  [MODULE_DOMAINS.PLATFORM]: 'پلتفرم',
  [MODULE_DOMAINS.PRODUCTIVITY]: 'هسته',
};

// Subscription plans
export interface PlanLimits {
  maxUsers: number;
  maxStorageMb: number;
  modules: string[];
}

export const PLATFORM_PLANS: Record<string, PlanLimits> = {
  starter: {
    maxUsers: 5,
    maxStorageMb: 1024,
    modules: ['contacts', 'documents', 'calendar', 'employees', 'projects-tasks', 'smart-publishing', 'event-management'],
  },
  professional: {
    maxUsers: 25,
    maxStorageMb: 10240,
    modules: ['contacts', 'documents', 'calendar', 'employees', 'projects-tasks', 'smart-publishing', 'event-management'],
  },
  enterprise: {
    maxUsers: 999,
    maxStorageMb: 102400,
    modules: ['contacts', 'documents', 'calendar', 'employees', 'projects-tasks', 'smart-publishing', 'event-management'],
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
  terminated: 'قطع همکاری',
  screening: 'غربالگری',
  interview: 'مصاحبه',
  offer: 'پیشنهاد',
  hired: 'استخدام شده',
};

export function getPermissionsForModule(moduleId: string) {
  return APP_PERMISSIONS.filter((p) => p.moduleId === moduleId);
}

export function getModuleDependencies(moduleId: string): string[] {
  const mod = MODULE_CATALOG.find((m) => m.id === moduleId);
  return mod ? [...mod.dependencies] : [];
}

export function isCoreModule(moduleId: string): boolean {
  const mod = MODULE_CATALOG.find((m) => m.id === moduleId);
  return Boolean(mod && 'isCore' in mod && mod.isCore);
}

export function getCoreModuleIds(): string[] {
  return MODULE_CATALOG.filter((m) => 'isCore' in m && m.isCore).map((m) => m.id);
}

export function canEnableModule(moduleId: string, enabledModules: string[]): boolean {
  const deps = getModuleDependencies(moduleId);
  return deps.every((d) => enabledModules.includes(d));
}

export function getEnabledDependents(moduleId: string, enabledModules: string[]): string[] {
  return MODULE_CATALOG.filter(
    (m) => (m.dependencies as readonly string[]).includes(moduleId) && enabledModules.includes(m.id),
  ).map((m) => m.id);
}

export function canDisableModule(moduleId: string, enabledModules: string[]): boolean {
  return getEnabledDependents(moduleId, enabledModules).length === 0;
}

export * from './core-modules-spec';
export * from './entity-relations';
export * from './contacts';
export * from './iran-locations';
export * from './employee';
export * from './iran-banks';
export * from './employee-profile';
export * from './persian-calendar';
export * from './documents';
