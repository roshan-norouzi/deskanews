'use client';

import { useApi } from '@/hooks/use-api';
import { useTenant } from '@/lib/tenant-context';

interface TenantMember {
  userId: string;
  user?: { name: string; email: string };
}

interface MemberMultiFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

/** Stores comma-separated userIds in `value`. */
export function MemberMultiField({ label, value, onChange, required }: MemberMultiFieldProps) {
  const { activeTenantId } = useTenant();
  const { data, isLoading } = useApi<TenantMember[]>(
    activeTenantId ? `/tenants/${activeTenantId}/members` : null,
  );

  const selected = new Set(value ? value.split(',').filter(Boolean) : []);
  const members = Array.isArray(data) ? data : [];

  const toggle = (userId: string) => {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChange(Array.from(next).join(','));
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {isLoading ? (
        <p className="text-sm text-slate-400">بارگذاری اعضا...</p>
      ) : (
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
          {members.map((m) => (
            <label key={m.userId} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(m.userId)}
                onChange={() => toggle(m.userId)}
                className="rounded border-slate-300"
              />
              <span>{m.user?.name ?? m.user?.email ?? m.userId}</span>
            </label>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-slate-400">عضوی یافت نشد</p>
          )}
        </div>
      )}
    </div>
  );
}
