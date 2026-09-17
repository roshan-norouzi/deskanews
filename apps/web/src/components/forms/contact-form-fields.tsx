'use client'

import { Input } from '@/components/ui/input'
import {
  CONTACT_TYPE_LABELS,
  getContactBirthDateLabel,
  getIranCities,
  IRAN_PROVINCES,
  normalizeDigits,
} from '@deska/shared'

export interface ContactFormState {
  type: string
  firstName: string
  lastName: string
  companyName: string
  email: string
  phone: string
  mobile: string
  nationalId: string
  economicCode: string
  registrationNumber: string
  address: string
  city: string
  province: string
  postalCode: string
  website: string
  notes: string
  birthDate: string
  marriageDate: string
  isActive: boolean
}

export const EMPTY_CONTACT_FORM: ContactFormState = {
  type: 'person',
  firstName: '',
  lastName: '',
  companyName: '',
  email: '',
  phone: '',
  mobile: '',
  nationalId: '',
  economicCode: '',
  registrationNumber: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  website: '',
  notes: '',
  birthDate: '',
  marriageDate: '',
  isActive: true,
}

const selectClassName =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm hover:border-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20'

function toDateInput(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function contactToFormState(contact: Record<string, unknown>): ContactFormState {
  const contactType = contact.type === 'company' ? 'company' : 'person'
  return {
    type: contactType,
    firstName: typeof contact.firstName === 'string' ? contact.firstName : '',
    lastName: typeof contact.lastName === 'string' ? contact.lastName : '',
    companyName: typeof contact.companyName === 'string' ? contact.companyName : '',
    email: (contact.email as string) ?? '',
    phone: (contact.phone as string) ?? '',
    mobile: (contact.mobile as string) ?? '',
    nationalId: (contact.nationalId as string) ?? '',
    economicCode: (contact.economicCode as string) ?? '',
    registrationNumber: (contact.registrationNumber as string) ?? '',
    address: (contact.address as string) ?? '',
    city: (contact.city as string) ?? '',
    province: (contact.province as string) ?? '',
    postalCode: (contact.postalCode as string) ?? '',
    website: (contact.website as string) ?? '',
    notes: (contact.notes as string) ?? '',
    birthDate: toDateInput(contact.birthDate as string),
    marriageDate: contactType === 'company' ? '' : toDateInput(contact.marriageDate as string),
    isActive: contact.isActive !== false,
  }
}

export function contactFormToBody(form: ContactFormState): Record<string, unknown> {
  const isCompany = form.type === 'company'

  return {
    type: form.type,
    firstName: form.firstName || null,
    lastName: form.lastName || null,
    companyName: form.companyName || null,
    email: form.email || null,
    phone: form.phone || null,
    mobile: form.mobile || null,
    nationalId: form.nationalId || null,
    economicCode: form.economicCode || null,
    registrationNumber: form.registrationNumber || null,
    address: form.address || null,
    city: form.city || null,
    province: form.province || null,
    postalCode: form.postalCode || null,
    website: form.website || null,
    notes: form.notes || null,
    birthDate: form.birthDate || null,
    marriageDate: isCompany ? null : form.marriageDate || null,
    isActive: form.isActive,
  }
}

interface ContactFormFieldsProps {
  form: ContactFormState
  onChange: (next: ContactFormState) => void
}

export function ContactFormFields({ form, onChange }: ContactFormFieldsProps) {
  const set = (patch: Partial<ContactFormState>) => onChange({ ...form, ...patch })

  const handleTypeChange = (type: string) => {
    if (type === 'company') {
      onChange({ ...form, type, marriageDate: '' })
      return
    }
    onChange({ ...form, type })
  }

  const handleProvinceChange = (province: string) => {
    const cities = getIranCities(province)
    const city = cities.includes(form.city) ? form.city : ''
    set({ province, city })
  }

  const isPerson = form.type === 'person'
  const isCompany = form.type === 'company'
  const provinceOptions = form.province && !IRAN_PROVINCES.includes(form.province)
    ? [form.province, ...IRAN_PROVINCES]
    : IRAN_PROVINCES
  const cityOptions = form.province ? getIranCities(form.province) : []
  const citySelectOptions =
    form.city && !cityOptions.includes(form.city) ? [form.city, ...cityOptions] : cityOptions

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">نوع مخاطب</label>
        <select
          value={form.type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className={selectClassName}
        >
          {Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isPerson && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="نام"
            value={form.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
            required
          />
          <Input
            label="نام خانوادگی"
            value={form.lastName}
            onChange={(e) => set({ lastName: e.target.value })}
            required
          />
        </div>
      )}

      {isCompany && (
        <Input
          label="نام شرکت"
          value={form.companyName}
          onChange={(e) => set({ companyName: e.target.value })}
          required
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="ایمیل"
          type="email"
          value={form.email}
          onChange={(e) => set({ email: e.target.value })}
        />
        <Input
          label="تلفن ثابت"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          className="text-left"
          pattern="[0-9۰-۹]*"
          maxLength={11}
          placeholder="02112345678"
          value={form.phone}
          onChange={(e) => set({ phone: normalizeDigits(e.target.value).slice(0, 11) })}
        />
        <Input
          label="موبایل"
          value={form.mobile}
          type="tel"
          inputMode="numeric"
          dir="ltr"
          className="text-left"
          pattern="[0-9۰-۹]*"
          maxLength={11}
          placeholder="09121234567"
          onChange={(e) => set({ mobile: normalizeDigits(e.target.value).slice(0, 11) })}
        />
        <Input
          label="وب‌سایت"
          type="url"
          pattern="https://.*"
          dir="ltr"
          placeholder="https://example.com"
          value={form.website}
          onChange={(e) => set({ website: e.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label={isCompany ? 'شناسه ملی شرکت' : 'کد ملی'}
          type="tel"
          inputMode="numeric"
          dir="ltr"
          className="text-left"
          pattern="[0-9۰-۹]*"
          maxLength={isCompany ? 11 : 10}
          placeholder={isCompany ? '14001234567' : '0012345678'}
          value={form.nationalId}
          onChange={(e) => set({ nationalId: normalizeDigits(e.target.value).slice(0, isCompany ? 11 : 10) })}
        />
        <Input
          label="کد اقتصادی"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          className="text-left"
          pattern="[0-9۰-۹]*"
          maxLength={20}
          placeholder="411111111111"
          value={form.economicCode}
          onChange={(e) => set({ economicCode: normalizeDigits(e.target.value).slice(0, 20) })}
        />
        <Input
          label="شماره ثبت"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          className="text-left"
          pattern="[0-9۰-۹]*"
          maxLength={20}
          placeholder="123456"
          value={form.registrationNumber}
          onChange={(e) => set({ registrationNumber: normalizeDigits(e.target.value).slice(0, 20) })}
        />
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-700">اطلاعات آدرس</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">استان</label>
            <select
              value={form.province}
              onChange={(e) => handleProvinceChange(e.target.value)}
              className={selectClassName}
            >
              <option value="">انتخاب استان</option>
              {provinceOptions.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">شهر</label>
            <select
              value={form.city}
              onChange={(e) => set({ city: e.target.value })}
              className={selectClassName}
              disabled={!form.province}
            >
              <option value="">{form.province ? 'انتخاب شهر' : 'ابتدا استان را انتخاب کنید'}</option>
              {citySelectOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Input
          label="آدرس"
          value={form.address}
          onChange={(e) => set({ address: e.target.value })}
        />
        <Input
          label="کد پستی"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          className="text-left"
          pattern="[0-9۰-۹]{10}"
          minLength={10}
          maxLength={10}
          placeholder="1234567890"
          value={form.postalCode}
          onChange={(e) => set({ postalCode: normalizeDigits(e.target.value).slice(0, 10) })}
        />
      </div>

      <div className={`grid gap-4 ${isPerson ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
        <Input
          label={getContactBirthDateLabel(form.type)}
          type="date"
          value={form.birthDate}
          onChange={(e) => set({ birthDate: e.target.value })}
        />
        {isPerson && (
          <Input
            label="تاریخ ازدواج"
            type="date"
            value={form.marriageDate}
            onChange={(e) => set({ marriageDate: e.target.value })}
          />
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">یادداشت</label>
        <textarea
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={3}
          placeholder="توضیحات تکمیلی درباره مخاطب"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => set({ isActive: e.target.checked })}
          className="rounded border-slate-300"
        />
        فعال
      </label>
    </div>
  )
}
