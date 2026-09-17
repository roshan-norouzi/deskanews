'use client'

import { EMPLOYEE_STATUS, ORGANIZATIONAL_ROLES, STATUS_LABELS, TENANT_ROLE_LABELS } from '@deska/shared'
import { Input } from '@/components/ui/input'
import { JalaliDateInput } from '@/components/ui/jalali-date-input'

export interface EmployeeMemberFormState {
  role: string
  employeeCode: string
  jobTitle: string
  status: string
  hireDate: string
}

interface EmployeeMemberFormFieldsProps {
  formState: EmployeeMemberFormState
  setFormState: React.Dispatch<React.SetStateAction<EmployeeMemberFormState | null>>
  mode: 'add' | 'edit'
  isOwner: boolean
  fieldErrors: Partial<Record<keyof EmployeeMemberFormState, string>>
}

const EMPLOYEE_STATUS_OPTIONS = Object.values(EMPLOYEE_STATUS)
const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: STATUS_LABELS.active ?? 'فعال',
  inactive: STATUS_LABELS.inactive ?? 'غیرفعال',
  terminated: 'پایان همکاری',
}

function SelectField({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20">
        {children}
      </select>
    </div>
  )
}

export function EmployeeMemberFormFields({ formState, setFormState, mode, isOwner, fieldErrors }: EmployeeMemberFormFieldsProps) {
  const set = <K extends keyof EmployeeMemberFormState>(key: K, value: EmployeeMemberFormState[K]) => {
    setFormState((current) => current && { ...current, [key]: value })
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 p-4">
      <div>
        <h4 className="font-semibold text-slate-800">اطلاعات همکاری در این سازمان</h4>
        <p className="mt-1 text-xs leading-6 text-slate-500">اطلاعات شخصی، تماس، بانکی و هویتی فقط توسط خود کاربر در حساب کاربری تکمیل می‌شود.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Input label="کد پرسنلی" value={formState.employeeCode} onChange={(event) => set('employeeCode', event.target.value)} error={fieldErrors.employeeCode} placeholder={mode === 'add' ? 'در صورت خالی بودن خودکار تولید می‌شود' : undefined} maxLength={40} dir="ltr" className="text-left" />
          {mode === 'add' && <p className="mt-1 text-xs text-slate-500">کد بر اساس تنظیمات پیشوند و پسوند سازمان تولید می‌شود.</p>}
        </div>
        <Input label="سمت" value={formState.jobTitle} onChange={(event) => set('jobTitle', event.target.value)} error={fieldErrors.jobTitle} maxLength={120} />
        {!isOwner && <SelectField label="نقش سازمانی" value={formState.role} onChange={(value) => set('role', value)}>{ORGANIZATIONAL_ROLES.map((role) => <option key={role} value={role}>{TENANT_ROLE_LABELS[role]}</option>)}</SelectField>}
        <SelectField label="وضعیت همکاری" value={formState.status} onChange={(value) => set('status', value)}>{EMPLOYEE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{EMPLOYEE_STATUS_LABELS[status] ?? status}</option>)}</SelectField>
        <JalaliDateInput label="تاریخ استخدام" value={formState.hireDate} onChange={(event) => set('hireDate', event.target.value)} />
      </div>
    </section>
  )
}
