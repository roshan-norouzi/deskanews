'use client';

import { ChevronDown, Building2, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useTenant } from '@/lib/tenant-context';
import { cn } from '@/lib/utils';

export function TenantSwitcher() {
  const { tenants, activeTenant, setActiveTenant, isLoading } = useTenant();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (isLoading || tenants.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        <Building2 className="h-4 w-4 text-slate-500" />
        <span className="max-w-[120px] truncate">{activeTenant?.name ?? 'انتخاب سازمان'}</span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <p className="px-3 py-2 text-xs font-medium text-slate-500">سازمان‌ها</p>
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              onClick={() => {
                setActiveTenant(tenant.id);
                setOpen(false);
                window.location.reload();
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1 text-right">
                <p className="truncate font-medium text-slate-900">{tenant.name}</p>
                <p className="truncate text-xs text-slate-500">{tenant.plan}</p>
              </div>
              {activeTenant?.id === tenant.id && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
