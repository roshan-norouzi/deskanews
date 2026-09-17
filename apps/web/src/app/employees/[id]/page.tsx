'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Hash, Mail, User } from 'lucide-react';
import { EMPLOYEE_STATUS_LABELS, formatEmployeeLabel } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge, statusToBadgeVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { formatJalaliDate } from '@/lib/date';
import { EntityDocumentsPanel } from '@/components/entity/entity-documents-panel';

interface PageProps { params: Promise<{ id: string }> }

interface EmployeeProfile {
  employee: {
    id: string;
    employeeCode: string;
    firstName?: string | null;
    lastName?: string | null;
    jobTitle?: string | null;
    status: string;
    hireDate?: string | null;
    department?: { name: string } | null;
    user?: { name?: string | null; email?: string | null } | null;
    contact?: { name?: string | null; email?: string | null } | null;
  };
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3"><span className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4" aria-hidden="true" />{label}</span><span className="text-sm font-medium text-slate-900">{children}</span></div>;
}

export default function EmployeeProfilePage({ params }: PageProps) {
  const { id } = use(params);
  const { data, isLoading, error } = useApi<EmployeeProfile>(`/employees/${id}/profile`);

  if (isLoading) return <ProtectedLayout title="پروفایل کارمند"><div className="mx-auto max-w-4xl animate-pulse rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">در حال بارگذاری...</div></ProtectedLayout>;
  if (error || !data?.employee) return <ProtectedLayout title="پروفایل کارمند"><div className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">کارمند یافت نشد.<Link href="/employees" className="mt-4 block font-semibold text-primary-700">بازگشت به فهرست کارمندان</Link></div></ProtectedLayout>;

  const { employee } = data;
  const email = employee.user?.email ?? employee.contact?.email ?? '—';
  return <ProtectedLayout title="پروفایل کارمند"><div className="mx-auto max-w-4xl space-y-5">
    <header className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-gradient-to-l from-white to-primary-50/60 p-6 shadow-sm"><Link href="/employees" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-primary-700" aria-label="بازگشت به فهرست کارمندان"><ArrowRight className="h-5 w-5" /></Link><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700"><User className="h-7 w-7" aria-hidden="true" /></div><div className="min-w-0"><h2 className="truncate text-2xl font-bold text-slate-900">{formatEmployeeLabel(employee)}</h2><p className="mt-1 text-sm text-slate-500">{employee.jobTitle ?? 'سمت ثبت نشده است'}</p></div></header>
    <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle>اطلاعات سازمانی</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><InfoRow icon={Hash} label="کد پرسنلی">{employee.employeeCode}</InfoRow><InfoRow icon={BriefcaseBusiness} label="سمت">{employee.jobTitle ?? '—'}</InfoRow><InfoRow icon={Building2} label="دپارتمان">{employee.department?.name ?? '—'}</InfoRow><InfoRow icon={CalendarDays} label="تاریخ استخدام">{formatJalaliDate(employee.hireDate)}</InfoRow><InfoRow icon={Mail} label="ایمیل">{email}</InfoRow><InfoRow icon={User} label="وضعیت"><Badge variant={statusToBadgeVariant(employee.status)}>{EMPLOYEE_STATUS_LABELS[employee.status] ?? employee.status}</Badge></InfoRow></CardContent></Card>
    <EntityDocumentsPanel entityType="Employee" entityId={employee.id} title="اسناد کارکنان" />
  </div></ProtectedLayout>;
}
