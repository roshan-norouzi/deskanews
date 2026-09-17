'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ContactRound, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import {
  CONTACT_TYPE_LABELS,
} from '@deska/shared'
import { ProtectedLayout } from '@/components/layout/protected-layout'
import {
  ContactFormFields,
  EMPTY_CONTACT_FORM,
  contactFormToBody,
  type ContactFormState,
} from '@/components/forms/contact-form-fields'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApi } from '@/hooks/use-api'
import { formatJalaliDate } from '@/lib/date'
import { extractListItems } from '@/lib/list-utils'
import { apiFetch } from '@/lib/utils'

interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  mobile?: string
  type: string
  companyName?: string
  membershipDate?: string
  createdAt: string
}

export default function ContactsPage() {
  const router = useRouter()
  const { data, isLoading, error, refetch } = useApi<unknown>('/contacts')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<ContactFormState>(EMPTY_CONTACT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const items = useMemo(() => extractListItems<Contact>(data, 'items'), [data])

  const openCreate = () => {
    setForm(EMPTY_CONTACT_FORM)
    setSubmitError(null)
    setShowCreate(true)
  }

  const closeCreate = () => {
    setShowCreate(false)
    setSubmitError(null)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await apiFetch<Contact>('/contacts', {
        method: 'POST',
        body: contactFormToBody(form),
      })
      closeCreate()
      if (created?.id) {
        router.push(`/contacts/${created.id}`)
      } else {
        await refetch()
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'خطا در ذخیره')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (row: Contact) => {
    if (!window.confirm('مخاطب حذف شود؟')) return
    setDeletingId(row.id)
    try {
      await apiFetch(`/contacts/${row.id}`, { method: 'DELETE' })
      await refetch()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <ProtectedLayout title="مخاطبین">
      <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
        <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><ContactRound className="h-6 w-6" /></span><div>
            <h2 className="text-2xl font-bold">مخاطبین</h2>
            <p className="mt-2 text-sm text-slate-300">
              مدیریت مخاطبین شخصی و سازمانی
            </p>
          </div></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              بروزرسانی
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              مخاطب جدید
            </Button>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70">
            <CardTitle>لیست</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام</TableHead>
                    <TableHead>ایمیل</TableHead>
                    <TableHead>تلفن</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>تاریخ عضویت</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableEmpty colSpan={6} message="مخاطبی یافت نشد" />
                  ) : (
                    items.map((row) => (
                      <TableRow key={row.id} className="hover:bg-slate-50">
                        <TableCell>
                          <Link
                            href={`/contacts/${row.id}`}
                            className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                          >
                            {row.name}
                          </Link>
                        </TableCell>
                        <TableCell>{row.email ?? '—'}</TableCell>
                        <TableCell>{row.phone ?? row.mobile ?? '—'}</TableCell>
                        <TableCell>{CONTACT_TYPE_LABELS[row.type] ?? row.type}</TableCell>
                        <TableCell>{formatJalaliDate(row.membershipDate ?? row.createdAt)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            isLoading={deletingId === row.id}
                            onClick={() => handleDelete(row)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            حذف
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
              <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-5">
                <h3 className="text-lg font-semibold">مخاطب جدید</h3>
                <button type="button" onClick={closeCreate} className="rounded p-1 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4 px-6 py-4">
                <ContactFormFields form={form} onChange={setForm} />
                {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeCreate}>
                    انصراف
                  </Button>
                  <Button type="submit" isLoading={submitting}>
                    ذخیره
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  )
}
