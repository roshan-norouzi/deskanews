'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export function PlatformNavigation() {
  const pathname = usePathname();
  const { isPlatformAdmin } = useAuth();
  const links = [
    { href: '/organizations', label: 'سازمان‌های من', icon: Building2, visible: true },
    { href: '/platform', label: 'مدیریت پلتفرم', icon: ShieldCheck, visible: isPlatformAdmin },
  ].filter((item) => item.visible);

  return (
    <nav aria-label="دسترسی‌های پلتفرم" className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {links.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
