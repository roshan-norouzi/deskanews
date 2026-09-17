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

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'داشبورد',
    items: [{ href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard }],
  },
  {
    id: 'publishing',
    label: 'نشر هوشمند',
    items: [
      { href: '/publishing/feeds', label: 'منابع محتوا', icon: Rss },
      { href: '/publishing/operations', label: 'مرکز عملیات', icon: Activity },
      { href: '/publishing/news', label: 'اتاق خبر', icon: Send },
      { href: '/publishing/social', label: 'استودیوی اجتماعی', icon: Send },
      { href: '/publishing/settings', label: 'تنظیمات نشر هوشمند', icon: Settings, ownerOnly: true },
    ],
  },
  {
    id: 'settings',
    label: 'تنظیمات',
    items: [
      { href: '/settings', label: 'تنظیمات سازمان', icon: Settings, ownerOnly: true },
      { href: '/settings/account', label: 'حساب کاربری', icon: User },
      { href: '/settings/users', label: 'کاربران', icon: Users, ownerOnly: true },
      { href: '/platform', label: 'مدیریت پلتفرم', icon: Building2, superAdminOnly: true },
    ],
  },
];

export function filterNavGroups(isSuperAdmin: boolean, isOwner: boolean): NavGroup[] {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.superAdminOnly && !isSuperAdmin) return false;
        if (item.ownerOnly && !isSuperAdmin && !isOwner) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
