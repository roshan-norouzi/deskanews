'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LogOut, Menu, Search, X } from 'lucide-react';
import { PLATFORM_NAME } from '@deska/shared';
import { cn, withBasePath } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { filterNavGroups, NAV_GROUPS } from '@/lib/navigation';
import { TenantSwitcher } from './tenant-switcher';
import { CommandPalette } from './command-palette';
import { Button } from '@/components/ui/button';
import { NotificationBell } from './notification-bell';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

export function AppShell({ children, title }: AppShellProps) {
  const pathname = usePathname();
  const { user, logout, isSuperAdmin } = useAuth();
  const { activeTenant } = useTenant();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const navGroups = filterNavGroups(isSuperAdmin, activeTenant?.memberRole === 'owner');
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      for (const group of NAV_GROUPS) {
        const isActive = group.items.some(
          (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
        );
        if (isActive) next[group.id] = true;
      }
      return next;
    });
  }, [pathname]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleLogout = async () => {
    await logout();
    window.location.assign(withBasePath('/login'));
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-sidebar text-white transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold">
              د
            </div>
            <span className="font-bold">{PLATFORM_NAME}</span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-1 hover:bg-sidebar-hover lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="بستن منو"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => {
            const isExpanded = expandedGroups[group.id] ?? (
              group.id === 'dashboard' || group.id === 'publishing'
            );
            const hasActiveItem = group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

            if (group.items.length === 1 && group.id === 'dashboard') {
              const item = group.items[0];
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                    pathname === item.href ? 'bg-sidebar-active text-white' : 'text-slate-300 hover:bg-sidebar-hover hover:text-white',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              );
            }

            return (
              <div key={group.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    hasActiveItem ? 'text-white' : 'text-slate-400 hover:text-white',
                  )}
                >
                  <span>{group.label}</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
                </button>
                {isExpanded && (
                  <div className="mr-2 mt-1 space-y-0.5 border-r border-white/10 pr-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                            isActive ? 'bg-sidebar-active text-white' : 'text-slate-300 hover:bg-sidebar-hover hover:text-white',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-sm font-medium">
              {user?.name?.charAt(0) ?? '؟'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:text-white" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            خروج
          </Button>
          <p className="mt-3 text-center text-[11px] text-slate-500">نسخه {appVersion}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="باز کردن منو"
          >
            <Menu className="h-5 w-5" />
          </button>

          {title && <h1 className="text-lg font-semibold text-slate-900">{title}</h1>}

          <div className="mr-auto flex items-center gap-3">
            {activeTenant && <NotificationBell key={activeTenant.id} />}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">جستجو...</span>
              <kbd className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-xs sm:inline">Ctrl+K</kbd>
            </button>
            <TenantSwitcher />
            {activeTenant && (
              <span className="hidden text-sm text-slate-500 md:inline">{activeTenant.name}</span>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} navGroups={navGroups} />
    </div>
  );
}
