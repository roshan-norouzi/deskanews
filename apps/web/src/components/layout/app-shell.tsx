'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, LogOut, Menu, Search, X } from 'lucide-react';
import { PLATFORM_NAME } from '@deska/shared';
import { cn, withBasePath } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { filterNavGroups, filterNavSections } from '@/lib/navigation';
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
  const { activeTenant, activeTenantId, tenants } = useTenant();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const resolvedActiveTenant = useMemo(
    () => activeTenant ?? tenants.find((t) => t.id === activeTenantId) ?? null,
    [activeTenant, activeTenantId, tenants],
  );
  const memberPermissions = resolvedActiveTenant?.permissions ?? [];
  const navSections = filterNavSections(isSuperAdmin, resolvedActiveTenant?.memberRole === 'owner', memberPermissions);
  const navGroups = filterNavGroups(isSuperAdmin, resolvedActiveTenant?.memberRole === 'owner', memberPermissions);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

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

  const handleLogout = async () => {
    await logout();
    window.location.assign(withBasePath('/login'));
  };

  const sidebarWidth = sidebarCollapsed ? 'w-[4.5rem]' : 'w-72';

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-dvh max-h-dvh flex-col border-l border-sidebar-border bg-sidebar text-slate-900 shadow-card transition-all duration-200 lg:sticky lg:top-0',
          sidebarWidth,
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white shadow-sm">
              د
            </div>
            {!sidebarCollapsed && <span className="truncate font-bold text-slate-900">{PLATFORM_NAME}</span>}
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-sidebar-hover lg:inline-flex"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'باز کردن منو' : 'جمع کردن منو'}
            >
              <ChevronLeft className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
            </button>
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-sidebar-hover lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="بستن منو"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {!sidebarCollapsed && (
          <div className="shrink-0 border-b border-sidebar-border px-4 py-3">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-right">جستجو...</span>
              <kbd className="hidden rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-200 sm:inline">Ctrl+K</kbd>
            </button>
          </div>
        )}

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 scrollbar-thin">
          {navSections.map((section) => (
            <div key={section.id} className="mb-5 last:mb-0">
              {!sidebarCollapsed && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-heading">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/settings'
                    ? pathname === '/settings'
                    : item.href === '/settings/account'
                      ? pathname === '/settings/account' || pathname.startsWith('/settings/account/')
                      : item.href === '/platform'
                        ? pathname === '/platform'
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      'lytic-nav-item mb-1',
                      isActive ? 'lytic-nav-item-active' : 'lytic-nav-item-idle',
                      sidebarCollapsed && 'justify-center px-2',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-4">
          {!sidebarCollapsed ? (
            <>
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-100 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                  {user?.name?.charAt(0) ?? '؟'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
                  <p className="truncate text-xs text-slate-500">{user?.email}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full justify-start text-slate-600" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                خروج
              </Button>
              <p className="mt-3 text-center text-[11px] text-slate-400">نسخه {appVersion}</p>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-sidebar-hover"
              aria-label="خروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md lg:px-8">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="باز کردن منو"
          >
            <Menu className="h-5 w-5" />
          </button>

          {title && <h1 className="lytic-page-title">{title}</h1>}

          <div className="mr-auto flex items-center gap-2 sm:gap-3">
            {resolvedActiveTenant && <NotificationBell key={resolvedActiveTenant.id} />}
            <TenantSwitcher />
            {resolvedActiveTenant && (
              <span className="hidden max-w-[10rem] truncate text-sm text-slate-500 md:inline">{resolvedActiveTenant.name}</span>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} navGroups={navGroups} />
    </div>
  );
}
