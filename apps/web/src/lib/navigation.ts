import {
  Building2,
  LayoutDashboard,
  Newspaper,
  Rss,
  Settings,
  Share2,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  ownerOnly?: boolean;
}

export interface NavSeparator {
  type: 'separator';
}

export type NavEntry = NavItem | NavSeparator;

export const NAV_ENTRIES: NavEntry[] = [
  { href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard },
  { href: '/platform/feeds', label: 'منابع پیش‌فرض', icon: Rss, superAdminOnly: true },
  { href: '/publishing/feeds', label: 'منابع محتوا', icon: Rss },
  { href: '/publishing/news', label: 'اتاق خبر', icon: Newspaper },
  { href: '/publishing/social', label: 'استودیوی اجتماعی', icon: Share2 },
  { href: '/publishing/settings', label: 'تنظیمات نشر هوشمند', icon: Settings, ownerOnly: true },
  { type: 'separator' },
  { href: '/settings', label: 'تنظیمات', icon: Settings },
];

/** @deprecated Use NAV_ENTRIES directly */
export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

function isSeparator(entry: NavEntry): entry is NavSeparator {
  return 'type' in entry && entry.type === 'separator';
}

function filterNavItem(item: NavItem, isSuperAdmin: boolean, isOwner: boolean): boolean {
  if (item.superAdminOnly && !isSuperAdmin) return false;
  if (item.ownerOnly && !isSuperAdmin && !isOwner) return false;
  return true;
}

export function filterNavEntries(isSuperAdmin: boolean, isOwner: boolean): NavEntry[] {
  const filtered = NAV_ENTRIES.filter((entry) => {
    if (isSeparator(entry)) return true;
    return filterNavItem(entry, isSuperAdmin, isOwner);
  });

  const result: NavEntry[] = [];
  for (const entry of filtered) {
    if (isSeparator(entry)) {
      if (result.length === 0 || isSeparator(result[result.length - 1])) continue;
      result.push(entry);
      continue;
    }
    result.push(entry);
  }

  while (result.length > 0 && isSeparator(result[result.length - 1])) {
    result.pop();
  }

  return result;
}

/** @deprecated Use filterNavEntries */
export function filterNavItems(isSuperAdmin: boolean, isOwner: boolean): NavItem[] {
  return filterNavEntries(isSuperAdmin, isOwner).filter((entry): entry is NavItem => !isSeparator(entry));
}

export function filterNavGroups(isSuperAdmin: boolean, isOwner: boolean): NavGroup[] {
  const entries = filterNavEntries(isSuperAdmin, isOwner);
  const separatorIndex = entries.findIndex((entry) => isSeparator(entry));
  const mainItems = (separatorIndex === -1 ? entries : entries.slice(0, separatorIndex)).filter(
    (entry): entry is NavItem => !isSeparator(entry),
  );
  const settingsItems = (separatorIndex === -1 ? [] : entries.slice(separatorIndex + 1)).filter(
    (entry): entry is NavItem => !isSeparator(entry),
  );

  const groups: NavGroup[] = [{ id: 'main', label: 'منو', items: mainItems }];
  if (settingsItems.length > 0) {
    groups.push({ id: 'settings', label: 'تنظیمات', items: settingsItems });
  }
  return groups;
}

/** @deprecated Flat navigation only */
export const NAV_GROUPS: NavGroup[] = [{ id: 'main', label: 'منو', items: NAV_ENTRIES.filter((e): e is NavItem => !isSeparator(e)) }];

/** @deprecated Use NAV_ENTRIES directly */
export const NAV_ITEMS: NavItem[] = NAV_ENTRIES.filter((entry): entry is NavItem => !isSeparator(entry));
