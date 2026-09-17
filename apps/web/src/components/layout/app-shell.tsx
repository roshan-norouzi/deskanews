'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, Search, X } from 'lucide-react';
import { PLATFORM_NAME } from '@deska/shared';
import { cn, withBasePath } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { filterNavGroups, filterNavEntries, type NavItem } from '@/lib/navigation';
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

  const navEntries = filterNavEntries(isSuperAdmin, activeTenant?.memberRole === 'owner');
  const navGroups = filterNavGroups(isSuperAdmin, activeTenant?.memberRole === 'owner');
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
          'fixed inset-y-0 right-0 z-50 flex h-dvh max-h-dvh w-72 flex-col bg-sidebar text-white transition-transform lg:sticky lg:top-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
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

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4">
          {navEntries.map((entry, index) => {
            if ('type' in entry && entry.type === 'separator') {
              return <div key={`separator-${index}`} className="my-3 border-t border-white/15" role="separator" />;
            }

            const item = entry as NavItem;
            const Icon = item.icon;
            const isActive =
              item.href === '/settings'
                ? pathname === '/settings' || pathname.startsWith('/settings/')
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive ? 'bg-sidebar-active text-white' : 'text-slate-300 hover:bg-sidebar-hover hover:text-white',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-4">
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
