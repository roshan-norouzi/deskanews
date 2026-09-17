'use client'

import { useEffect, useState } from 'react'
import { IRAN_BANKS, MARITAL_STATUS, MARITAL_STATUS_LABELS, pickProvidedProfileFields, type EmployeeProfileInput } from '@deska/shared'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { JalaliDateInput } from '@/components/ui/jalali-date-input'
import { CardDigitsInput, DigitsInput, IbanInput } from '@/components/ui/masked-input'
import { apiFetch } from '@/lib/utils'

export interface EmployeeProfileData {
  id: string
  tenantId: string
  employeeCode?: string | null
  jobTitle?: string | null
  firstName?: string | null
  lastName?: string | null
  nationalId?: string | null
  fatherName?: string | null
  motherName?: string | null
  birthCertificateNumber?: string | null
  birthCertificateDate?: string | null
  birthDate?: string | null
  maritalStatus?: string | null
  address?: string | null
  postalCode?: string | null
  mobilePhone?: string | null
  landlinePhone?: string | null
  bankAccountNumber?: string | null
  bankCardNumber?: string | null
  iban?: string | null
  bankName?: string | null
  insuranceNumber?: string | null
}

interface Props { tenant: { id: string; name: string }; employee: EmployeeProfileData; embedded?: boolean }

function dateValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export function EmployeeProfileSettings({ tenant, employee, embedded = false }: Props) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setForm({
      firstName: employee.firstName ?? '', lastName: employee.lastName ?? '', nationalId: employee.nationalId ?? '',
      fatherName: employee.fatherName ?? '', motherName: employee.motherName ?? '', birthCertificateNumber: employee.birthCertificateNumber ?? '',
      birthCertificateDate: dateValue(employee.birthCertificateDate), birthDate: dateValue(employee.birthDate), maritalStatus: employee.maritalStatus ?? '',
      address: employee.address ?? '', postalCode: employee.postalCode ?? '', mobilePhone: employee.mobilePhone ?? '', landlinePhone: employee.landlinePhone ?? '',
      bankAccountNumber: employee.bankAccountNumber ?? '', bankCardNumber: employee.bankCardNumber ?? '', iban: employee.iban ?? '', bankName: employee.bankName ?? '', insuranceNumber: employee.insuranceNumber ?? '',
    })
  }, [employee])

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const value = (key: string) => form[key] ?? ''

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setMessage(null)
    try {
      const profile = pickProvidedProfileFields(form as EmployeeProfileInput)
      await apiFetch('/auth/employee-profile', { method: 'PATCH', skipTenant: true, body: profile })
      setMessage('اطلاعات پرسنلی ذخیره شد')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'خطا در ذخیره اطلاعات پرسنلی')
    } finally { setSaving(false) }
  }

  const content = (
    <>
      <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4">
        <h3 className="font-semibold text-slate-900">اطلاعات پرسنلی در {tenant.name}</h3>
        <p className="mt-1 text-xs text-slate-500">کد پرسنلی و سمت توسط سازمان مدیریت می‌شود؛ این بخش فقط اطلاعات شخصی شماست.</p>
      </div>
      <form onSubmit={save} className="space-y-5 px-6 py-5">
        <section className="space-y-3"><h4 className="border-b border-slate-100 pb-2 text-sm font-semibold">مشخصات هویتی</h4><div className="grid gap-4 sm:grid-cols-2">
          <Input label="نام" value={value('firstName')} onChange={(e) => set('firstName', e.target.value)} />
          <Input label="نام خانوادگی" value={value('lastName')} onChange={(e) => set('lastName', e.target.value)} />
          <DigitsInput label="کد ملی" value={value('nationalId')} onValueChange={(v) => set('nationalId', v)} maxDigits={10} />
          <DigitsInput label="شماره شناسنامه" value={value('birthCertificateNumber')} onValueChange={(v) => set('birthCertificateNumber', v)} maxDigits={20} />
          <Input label="نام پدر" value={value('fatherName')} onChange={(e) => set('fatherName', e.target.value)} />
          <Input label="نام مادر" value={value('motherName')} onChange={(e) => set('motherName', e.target.value)} />
          <JalaliDateInput label="تاریخ تولد شناسنامه" value={value('birthCertificateDate')} onChange={(e) => set('birthCertificateDate', e.target.value)} />
          <JalaliDateInput label="تاریخ تولد واقعی" value={value('birthDate')} onChange={(e) => set('birthDate', e.target.value)} />
          <div><label className="mb-1.5 block text-sm font-medium text-slate-700">وضعیت تأهل</label><select value={value('maritalStatus')} onChange={(e) => set('maritalStatus', e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">انتخاب کنید</option><option value={MARITAL_STATUS.MARRIED}>{MARITAL_STATUS_LABELS.married}</option><option value={MARITAL_STATUS.SINGLE}>{MARITAL_STATUS_LABELS.single}</option></select></div>
        </div></section>
        <section className="space-y-3"><h4 className="border-b border-slate-100 pb-2 text-sm font-semibold">تماس و آدرس</h4><Input label="آدرس" value={value('address')} onChange={(e) => set('address', e.target.value)} /><div className="grid gap-4 sm:grid-cols-2"><DigitsInput label="کد پستی" value={value('postalCode')} onValueChange={(v) => set('postalCode', v)} maxDigits={10} /><DigitsInput label="تلفن همراه" value={value('mobilePhone')} onValueChange={(v) => set('mobilePhone', v)} maxDigits={11} /><DigitsInput label="تلفن ثابت" value={value('landlinePhone')} onValueChange={(v) => set('landlinePhone', v)} maxDigits={11} /></div></section>
        <section className="space-y-3"><h4 className="border-b border-slate-100 pb-2 text-sm font-semibold">اطلاعات بانکی و بیمه</h4><div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium text-slate-700">بانک</label><select value={value('bankName')} onChange={(e) => set('bankName', e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">انتخاب بانک</option>{IRAN_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}</select></div><DigitsInput label="شماره سپرده" value={value('bankAccountNumber')} onValueChange={(v) => set('bankAccountNumber', v)} maxDigits={20} /><CardDigitsInput label="شماره کارت" value={value('bankCardNumber')} onValueChange={(v) => set('bankCardNumber', v)} maxDigits={16} /><IbanInput label="شماره شبا" value={value('iban')} onValueChange={(v) => set('iban', v)} /><DigitsInput label="شماره بیمه" value={value('insuranceNumber')} onValueChange={(v) => set('insuranceNumber', v)} maxDigits={16} /></div></section>
        {message && <p className={`text-sm ${message.includes('خطا') ? 'text-red-600' : 'text-emerald-600'}`}>{message}</p>}
        <Button type="submit" isLoading={saving}>ذخیره اطلاعات پرسنلی</Button>
      </form>
    </>
  )

  return embedded ? <section className="overflow-hidden border-t border-slate-200">{content}</section> : <Card className="overflow-hidden">{content}</Card>
}
