'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, CalendarDays, CreditCard, Globe, Mail, MapPin, Pencil, Phone, Trash2, User } from 'lucide-react'
import {
  CONTACT_TYPE_LABELS,
  getContactBirthDateLabel,
} from '@deska/shared'
import { ProtectedLayout } from '@/components/layout/protected-layout'
import {
  ContactFormFields,
  contactFormToBody,
  contactToFormState,
  type ContactFormState,
} from '@/components/forms/contact-form-fields'
import { ContactBankAccountsPanel } from '@/components/contacts/contact-bank-accounts-panel'
import { EntityDocumentsPanel } from '@/components/entity/entity-documents-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApi } from '@/hooks/use-api'
import { formatJalaliDate } from '@/lib/date'
import { apiFetch } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface ContactBankAccount {
  id: string
  bankName: string
  accountNumber?: string
  cardNumber?: string
  sheba?: string
  isDefault: boolean
}

interface Contact {
  id: string
  name: string
  type: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  mobile?: string
  nationalId?: string
  economicCode?: string
  registrationNumber?: string
  companyName?: string
  address?: string
  city?: string
  province?: string
  postalCode?: string
  website?: string
  notes?: string
  birthDate?: string
  marriageDate?: string
  membershipDate?: string
  bankAccounts?: ContactBankAccount[]
  isActive?: boolean
  createdAt: string
}

function formatOptionalDate(value?: string | null) {
  if (!value) return '—'
  return formatJalaliDate(value)
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <span className="max-w-[65%] text-left text-sm font-medium text-slate-900">{children}</span>
    </div>
  )
}

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data, isLoading, error, refetch } = useApi<Contact>(`/contacts/${id}`)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ContactFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const startEdit = () => {
    if (!data) return
    setForm(contactToFormState(data as unknown as Record<string, unknown>))
    setEditing(true)
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    try {
      await apiFetch(`/contacts/${id}`, {
        method: 'PATCH',
        body: contactFormToBody(form),
      })
      setEditing(false)
      await refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('مخاطب حذف شود؟')) return
    setDeleting(true)
    try {
      await apiFetch(`/contacts/${id}`, { method: 'DELETE' })
      router.push('/contacts')
    } finally {
      setDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <ProtectedLayout title="مخاطب">
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      </ProtectedLayout>
    )
  }

  if (error || !data) {
    return (
      <ProtectedLayout title="مخاطب">
        <div className="text-red-600">{error ?? 'مخاطب یافت نشد'}</div>
      </ProtectedLayout>
    )
  }

  const typeLabel = CONTACT_TYPE_LABELS[data.type] ?? data.type

  return (
    <ProtectedLayout title={data.name}>
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-gradient-to-l from-white to-primary-50/60 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <Link href="/contacts" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-primary-700" aria-label="بازگشت">
              <ArrowRight className="h-5 w-5" />
            </Link>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
              {data.type === 'company' ? <Building2 className="h-7 w-7" /> : <User className="h-7 w-7" />}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{data.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{typeLabel}{data.isActive === false ? ' · غیرفعال' : ''}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!editing && (
              <>
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Pencil className="h-4 w-4" />
                  ویرایش
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={deleting}
                  onClick={handleDelete}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </>
            )}
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>اطلاعات مخاطب</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing && form ? (
              <>
                <ContactFormFields form={form} onChange={setForm} />
                <div className="flex gap-2">
                  <Button onClick={handleSave} isLoading={saving}>
                    ذخیره
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    انصراف
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.type === 'person' && (
                  <>
                    <InfoRow icon={User} label="نام">{data.firstName ?? '—'}</InfoRow>
                    <InfoRow icon={User} label="نام خانوادگی">{data.lastName ?? '—'}</InfoRow>
                  </>
                )}
                {data.type === 'company' && (
                  <InfoRow icon={Building2} label="نام شرکت">{data.companyName ?? '—'}</InfoRow>
                )}
                <InfoRow icon={Mail} label="ایمیل">{data.email ?? '—'}</InfoRow>
                <InfoRow icon={Phone} label="تلفن ثابت">{data.phone ?? '—'}</InfoRow>
                <InfoRow icon={Phone} label="موبایل">{data.mobile ?? '—'}</InfoRow>
                <InfoRow icon={CreditCard} label="شناسه ملی">{data.nationalId ?? '—'}</InfoRow>
                <InfoRow icon={CreditCard} label="کد اقتصادی">{data.economicCode ?? '—'}</InfoRow>
                <InfoRow icon={CreditCard} label="شماره ثبت">{data.registrationNumber ?? '—'}</InfoRow>
                <InfoRow icon={Globe} label="وب‌سایت">{data.website ?? '—'}</InfoRow>
                <InfoRow icon={MapPin} label="استان">{data.province ?? '—'}</InfoRow>
                <InfoRow icon={MapPin} label="شهر">{data.city ?? '—'}</InfoRow>
                <div className="sm:col-span-2"><InfoRow icon={MapPin} label="آدرس">{data.address ?? '—'}</InfoRow></div>
                <InfoRow icon={MapPin} label="کد پستی">{data.postalCode ?? '—'}</InfoRow>
                <InfoRow icon={CalendarDays} label={getContactBirthDateLabel(data.type)}>{formatOptionalDate(data.birthDate)}</InfoRow>
                {data.type !== 'company' && (
                  <InfoRow icon={CalendarDays} label="تاریخ ازدواج">{formatOptionalDate(data.marriageDate)}</InfoRow>
                )}
                <InfoRow icon={CalendarDays} label="تاریخ عضویت">{formatOptionalDate(data.membershipDate ?? data.createdAt)}</InfoRow>
                <InfoRow icon={User} label="وضعیت">{data.isActive === false ? 'غیرفعال' : 'فعال'}</InfoRow>
                {data.notes && (
                  <div className="sm:col-span-2"><InfoRow icon={User} label="یادداشت"><span className="whitespace-pre-wrap">{data.notes}</span></InfoRow></div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {!editing && (
          <ContactBankAccountsPanel
            contactId={id}
            accounts={data.bankAccounts ?? []}
            onChange={() => refetch()}
          />
        )}

        <EntityDocumentsPanel entityType="Contact" entityId={id} />
      </div>
    </ProtectedLayout>
  )
}
