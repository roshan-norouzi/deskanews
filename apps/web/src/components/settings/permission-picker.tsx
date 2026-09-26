'use client';

import {
  NEWSROOM_ALL_SERVICES,
  organizationMenuPermissionGroups,
  menuPermissionLabel,
  permissionsForPicker,
  type OrganizationMenuPermission,
} from '@deska/shared';

export interface NewsroomServiceOption {
  id: string;
  name: string;
  isGeneral?: boolean;
}

export function PermissionPicker({
  value,
  onChange,
  newsroomServiceIds,
  onNewsroomServiceIdsChange,
  services = [],
  disabled = false,
}: {
  value: string[];
  onChange: (permissions: string[]) => void;
  newsroomServiceIds: string[];
  onNewsroomServiceIdsChange: (serviceIds: string[]) => void;
  services?: NewsroomServiceOption[];
  disabled?: boolean;
}) {
  const menuGroups = organizationMenuPermissionGroups();
  const hasNewsroomAccess = value.includes('publishing.news');
  const allServicesSelected = newsroomServiceIds.includes(NEWSROOM_ALL_SERVICES);
  const selectableServices = services.filter((service) => !service.isGeneral);

  const togglePermission = (key: OrganizationMenuPermission) => {
    if (disabled) return;
    const next = value.includes(key)
      ? value.filter((item) => item !== key)
      : [...value, key];
    onChange(next);
    if (key === 'publishing.news' && !next.includes('publishing.news')) {
      onNewsroomServiceIdsChange([]);
    }
    if (key === 'publishing.news' && next.includes('publishing.news') && !newsroomServiceIds.length) {
      onNewsroomServiceIdsChange([NEWSROOM_ALL_SERVICES]);
    }
  };

  const toggleAllServices = () => {
    if (disabled || !hasNewsroomAccess) return;
    onNewsroomServiceIdsChange(allServicesSelected ? [] : [NEWSROOM_ALL_SERVICES]);
  };

  const toggleService = (serviceId: string) => {
    if (disabled || !hasNewsroomAccess || allServicesSelected) return;
    const next = newsroomServiceIds.includes(serviceId)
      ? newsroomServiceIds.filter((id) => id !== serviceId)
      : [...newsroomServiceIds.filter((id) => id !== NEWSROOM_ALL_SERVICES), serviceId];
    onNewsroomServiceIdsChange(next);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-900">دسترسی به منو</h4>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          بخش‌هایی را انتخاب کنید که این عضو می‌تواند به آن‌ها دسترسی داشته باشد. «حساب کاربری» برای همهٔ اعضا در دسترس است.
        </p>
        <div className="mt-4 space-y-4">
          {menuGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={value.includes(item.key)}
                      disabled={disabled}
                      onChange={() => togglePermission(item.key)}
                    />
                    <span>
                      <span className="block font-medium text-slate-800">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500" dir="ltr">{item.href}</span>
                      {item.key === 'settings.manage' ? (
                        <span className="mt-1 block text-[10px] text-slate-500">دسترسی به اطلاعات میز خبر و مدیریت اعضا در بخش تنظیمات</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {hasNewsroomAccess ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <h4 className="text-sm font-semibold text-slate-900">سرویس‌های میز خبر</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            مشخص کنید این کاربر در میز خبر به کدام سرویس‌ها دسترسی دارد.
          </p>
          <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={allServicesSelected}
              disabled={disabled}
              onChange={toggleAllServices}
            />
            <span>
              <span className="block font-medium text-slate-900">همه سرویس‌ها</span>
              <span className="mt-0.5 block text-xs text-slate-500">دسترسی به تمام سرویس‌های تأییدشده میز خبر</span>
            </span>
          </label>
          {selectableServices.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {selectableServices.map((service) => (
                <label
                  key={service.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                    allServicesSelected ? 'border-slate-200 bg-slate-100/80 opacity-60' : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allServicesSelected || newsroomServiceIds.includes(service.id)}
                    disabled={disabled || allServicesSelected}
                    onChange={() => toggleService(service.id)}
                  />
                  <span className="font-medium text-slate-800">{service.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">هنوز سرویس تأییدشده‌ای در تنظیمات انتشار ثبت نشده است.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function PermissionBadges({
  permissions,
  newsroomServiceIds = [],
}: {
  permissions: string[];
  newsroomServiceIds?: string[];
}) {
  const menuPermissions = permissionsForPicker(permissions);
  if (!menuPermissions.length) {
    return <span className="text-xs text-slate-500">بدون دسترسی سفارشی</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {menuPermissions.slice(0, 4).map((permission) => (
        <span
          key={permission}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
        >
          {menuPermissionLabel(permission)}
        </span>
      ))}
      {menuPermissions.length > 4 && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          +{menuPermissions.length - 4}
        </span>
      )}
      {menuPermissions.includes('publishing.news') && newsroomServiceIds.includes(NEWSROOM_ALL_SERVICES) && (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">همه سرویس‌ها</span>
      )}
      {menuPermissions.includes('publishing.news')
        && !newsroomServiceIds.includes(NEWSROOM_ALL_SERVICES)
        && newsroomServiceIds.length > 0 && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
            {newsroomServiceIds.length} سرویس
          </span>
        )}
    </div>
  );
}
