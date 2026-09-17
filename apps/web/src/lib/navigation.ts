import {
  Activity,
  Building2,
  LayoutDashboard,
  Rss,
  Send,
  Settings,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  ownerOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard },
  { href: '/publishing/feeds', label: 'منابع محتوا', icon: Rss },
  { href: '/publishing/operations', label: 'مرکز عملیات', icon: Activity },
  { href: '/publishing/news', label: 'اتاق خبر', icon: Send },
  { href: '/publishing/social', label: 'استودیوی اجتماعی', icon: Send },
  { href: '/publishing/settings', label: 'تنظیمات نشر هوشمند', icon: Settings, ownerOnly: true },
  { href: '/settings', label: 'تنظیمات سازمان', icon: Settings, ownerOnly: true },
  { href: '/settings/account', label: 'حساب کاربری', icon: User },
  { href: '/settings/users', label: 'کاربران', icon: Users, ownerOnly: true },
  { href: '/platform', label: 'مدیریت پلتفرم', icon: Building2, superAdminOnly: true },
  { href: '/platform/feeds', label: 'منابع پیش‌فرض', icon: Rss, superAdminOnly: true },
];

/** @deprecated Use NAV_ITEMS directly */
export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/** @deprecated Flat navigation only */
export const NAV_GROUPS: NavGroup[] = [{ id: 'main', label: 'منو', items: NAV_ITEMS }];

export function filterNavItems(isSuperAdmin: boolean, isOwner: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.ownerOnly && !isSuperAdmin && !isOwner) return false;
    return true;
  });
}

export function filterNavGroups(isSuperAdmin: boolean, isOwner: boolean): NavGroup[] {
  return [{ id: 'main', label: 'منو', items: filterNavItems(isSuperAdmin, isOwner) }];
}
