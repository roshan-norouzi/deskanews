import {
  Activity,
  ImageIcon,
  LayoutDashboard,
  Newspaper,
  Rss,
  Settings,
  Share2,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  ORGANIZATION_MENU_PERMISSIONS,
  memberHasPermission,
} from '@deska/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  ownerOnly?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  superAdminOnly?: boolean;
}

/** @deprecated Use NavSection separators in NAV_SECTIONS */
export interface NavSeparator {
  type: 'separator';
}

export type NavEntry = NavItem | NavSeparator;

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'home',
    label: 'خانه',
    items: [{ href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard }],
  },
  {
    id: 'content',
    label: 'محتوا',
    items: [
      { href: '/publishing/feeds', label: 'منابع خبری', icon: Rss },
      { href: '/publishing/news', label: 'اتاق خبر', icon: Newspaper },
      { href: '/publishing/social', label: 'استودیوی اجتماعی', icon: Share2 },
      { href: '/publishing/media', label: 'فایل‌ها', icon: ImageIcon },
    ],
  },
  {
    id: 'config',
    label: 'پیکربندی',
    items: [
      { href: '/publishing/settings', label: 'تنظیمات انتشار', icon: Settings },
      { href: '/publishing/operations', label: 'مرکز عملیات', icon: Activity },
      { href: '/settings', label: 'تنظیمات سازمان', icon: Settings },
      { href: '/settings/account', label: 'حساب کاربری', icon: User },
    ],
  },
  {
    id: 'platform-management',
    label: 'مدیریت پلتفرم',
    superAdminOnly: true,
    items: [
      { href: '/platform', label: 'کاربران و سازمان‌ها', icon: Users, superAdminOnly: true },
      { href: '/platform/feeds', label: 'کاتالوگ منابع پیش‌فرض', icon: Rss, superAdminOnly: true },
      { href: '/platform/settings', label: 'تنظیمات پلتفرم', icon: Settings, superAdminOnly: true },
    ],
  },
];

/** Flat list for legacy consumers */
export const NAV_ENTRIES: NavEntry[] = NAV_SECTIONS.flatMap((section, index) => {
  const items: NavEntry[] = section.items.map((item) => ({ ...item }));
  if (index < NAV_SECTIONS.length - 1) items.push({ type: 'separator' });
  return items;
});

/** @deprecated Use NAV_SECTIONS */
export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

function isSeparator(entry: NavEntry): entry is NavSeparator {
  return 'type' in entry && entry.type === 'separator';
}

function menuPermissionForHref(href: string): string | null {
  if (href === '/settings/account' || href.startsWith('/settings/account/')) {
    return null;
  }
  const exact = ORGANIZATION_MENU_PERMISSIONS.find((item) => item.href === href);
  if (exact) return exact.key;
  const nested = ORGANIZATION_MENU_PERMISSIONS.find((item) => href.startsWith(`${item.href}/`));
  return nested?.key ?? null;
}

function filterNavItem(
  item: NavItem,
  isSuperAdmin: boolean,
  isOwner: boolean,
  permissions: string[],
): boolean {
  if (item.superAdminOnly && !isSuperAdmin) return false;
  if (item.ownerOnly && !isSuperAdmin && !isOwner) return false;
  if (isSuperAdmin || isOwner) return true;
  const permission = menuPermissionForHref(item.href);
  if (!permission) return true;
  return memberHasPermission(permissions, permission);
}

export function filterNavSections(
  isSuperAdmin: boolean,
  isOwner: boolean,
  permissions: string[] = [],
): NavSection[] {
  return NAV_SECTIONS
    .filter((section) => !section.superAdminOnly || isSuperAdmin)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => filterNavItem(item, isSuperAdmin, isOwner, permissions)),
    }))
    .filter((section) => section.items.length > 0);
}

export function filterNavEntries(isSuperAdmin: boolean, isOwner: boolean, permissions: string[] = []): NavEntry[] {
  const sections = filterNavSections(isSuperAdmin, isOwner, permissions);
  const result: NavEntry[] = [];

  sections.forEach((section, index) => {
    result.push(...section.items);
    if (index < sections.length - 1) result.push({ type: 'separator' });
  });

  return result;
}

/** @deprecated Use filterNavEntries */
export function filterNavItems(isSuperAdmin: boolean, isOwner: boolean, permissions: string[] = []): NavItem[] {
  return filterNavEntries(isSuperAdmin, isOwner, permissions).filter((entry): entry is NavItem => !isSeparator(entry));
}

export function filterNavGroups(isSuperAdmin: boolean, isOwner: boolean, permissions: string[] = []): NavGroup[] {
  return filterNavSections(isSuperAdmin, isOwner, permissions).map((section) => ({
    id: section.id,
    label: section.label,
    items: section.items,
  }));
}

/** @deprecated Flat navigation only */
export const NAV_GROUPS: NavGroup[] = [{ id: 'main', label: 'منو', items: NAV_ENTRIES.filter((e): e is NavItem => !isSeparator(e)) }];

/** @deprecated Use NAV_SECTIONS */
export const NAV_ITEMS: NavItem[] = NAV_ENTRIES.filter((entry): entry is NavItem => !isSeparator(entry));
