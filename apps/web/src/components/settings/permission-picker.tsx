'use client';

import {
  APP_PERMISSIONS,
  ORGANIZATION_ASSIGNABLE_PERMISSIONS,
  type AppPermission,
} from '@deska/shared';

const PERMISSION_LABELS = Object.fromEntries(
  APP_PERMISSIONS.map((permission) => [permission.key, permission.label]),
) as Record<AppPermission, string>;

const PERMISSION_GROUPS = [
  {
    title: 'سازمان',
    keys: ORGANIZATION_ASSIGNABLE_PERMISSIONS.filter((key) => key.startsWith('organization.')),
  },
  {
    title: 'داشبورد و تنظیمات',
    keys: ORGANIZATION_ASSIGNABLE_PERMISSIONS.filter((key) =>
      ['dashboard.view', 'settings.manage', 'users.manage'].includes(key),
    ),
  },
  {
    title: 'نشر هوشمند',
    keys: ORGANIZATION_ASSIGNABLE_PERMISSIONS.filter((key) => key.startsWith('publishing.')),
  },
] as const;

export function PermissionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (permissions: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (key: string) => {
    if (disabled) return;
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  };

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((group) => (
        <section key={group.title} className="rounded-xl border border-slate-200 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">{group.title}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.keys.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={value.includes(key)}
                  disabled={disabled}
                  onChange={() => toggle(key)}
                />
                <span className="text-slate-700">{PERMISSION_LABELS[key as AppPermission] ?? key}</span>
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PermissionBadges({ permissions }: { permissions: string[] }) {
  if (!permissions.length) {
    return <span className="text-xs text-slate-500">بدون دسترسی سفارشی</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {permissions.slice(0, 4).map((permission) => (
        <span
          key={permission}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
        >
          {PERMISSION_LABELS[permission as AppPermission] ?? permission}
        </span>
      ))}
      {permissions.length > 4 && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          +{permissions.length - 4}
        </span>
      )}
    </div>
  );
}
