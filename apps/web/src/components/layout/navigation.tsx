'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PlatformNavigation() {
  const pathname = usePathname();
  const links = [{ href: '/organizations', label: 'سازمان‌های من', icon: Building2 }];

  return (
    <nav aria-label="دسترسی‌های پلتفرم" className="mb-6 flex flex-wrap gap-2">
      {links.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-primary-200 bg-primary-50 text-primary-700'
                : 'border-slate-200 bg-white text-slate-600 shadow-card hover:bg-slate-100 hover:text-slate-900',
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
