import { Activity, LayoutDashboard, Users, FileText, Calendar, UserCheck, User, Building2, Settings, Puzzle, FolderKanban, Send, Rss, Megaphone, PanelsTopLeft, type LucideIcon } from 'lucide-react';
import { MODULE_DOMAINS } from '@deska/shared';

export interface NavItem { href: string; label: string; icon: LucideIcon; moduleId?: string; superAdminOnly?: boolean; ownerOnly?: boolean; }
export interface NavGroup { id: string; label: string; domain?: string; items: NavItem[]; }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'dashboard', label: 'داشبورد', items: [{ href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard }] },
  { id: 'core', label: 'هسته', domain: MODULE_DOMAINS.PRODUCTIVITY, items: [
    { href: '/contacts', label: 'مخاطبین', icon: Users, moduleId: 'contacts' },
    { href: '/documents', label: 'اسناد', icon: FileText, moduleId: 'documents' },
    { href: '/calendar', label: 'تقویم', icon: Calendar, moduleId: 'calendar' },
    { href: '/employees', label: 'کارمندان', icon: UserCheck, moduleId: 'employees' },
  ] },
  { id: 'projects', label: 'مدیریت پروژه و تسک', domain: MODULE_DOMAINS.PRODUCTIVITY, items: [
    { href: '/projects', label: 'پروژه‌ها', icon: FolderKanban, moduleId: 'projects-tasks' },
    { href: '/projects/tasks', label: 'تسک‌ها', icon: FolderKanban, moduleId: 'projects-tasks' },
  ] },
  { id: 'publishing', label: 'نشر هوشمند', domain: MODULE_DOMAINS.PRODUCTIVITY, items: [
    { href: '/publishing/feeds', label: 'منابع محتوا', icon: Rss },
    { href: '/publishing/operations', label: 'مرکز عملیات', icon: Activity, moduleId: 'smart-publishing' },
    { href: '/publishing/news', label: 'اتاق خبر', icon: Send, moduleId: 'smart-publishing' },
    { href: '/publishing/media', label: 'مدیریت رسانه', icon: PanelsTopLeft, moduleId: 'smart-publishing' },
    { href: '/publishing/social', label: 'استودیوی اجتماعی', icon: Send, moduleId: 'smart-publishing' },
    { href: '/publishing/daily-report', label: 'دیلی‌ریپورت', icon: Send, moduleId: 'smart-publishing' },
    { href: '/publishing/settings', label: 'تنظیمات نشر هوشمند', icon: Send, moduleId: 'smart-publishing', ownerOnly: true },
  ] },
  { id: 'event-management', label: 'مدیریت رویداد', domain: MODULE_DOMAINS.PRODUCTIVITY, items: [
    { href: '/event-management', label: 'میزکار مدیریت رویداد', icon: Megaphone, moduleId: 'event-management' },
  ] },
  { id: 'settings', label: 'تنظیمات', domain: MODULE_DOMAINS.PLATFORM, items: [
    { href: '/settings', label: 'تنظیمات سازمان', icon: Settings, ownerOnly: true },
    { href: '/settings/account', label: 'حساب کاربری', icon: User },
    { href: '/settings/modules', label: 'ماژول‌ها', icon: Puzzle, ownerOnly: true },
    { href: '/settings/observances', label: 'مناسبت‌های تقویم', icon: Calendar, superAdminOnly: true },
    { href: '/platform', label: 'مدیریت پلتفرم', icon: Building2, superAdminOnly: true },
  ] },
];

export function filterNavGroups(enabledModules: string[] | null, isSuperAdmin: boolean, isOwner: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.ownerOnly && !isSuperAdmin && !isOwner) return false;
    if (!item.moduleId || !enabledModules) return true;
    return enabledModules.includes(item.moduleId);
  }) })).filter((group) => group.items.length > 0);
}
