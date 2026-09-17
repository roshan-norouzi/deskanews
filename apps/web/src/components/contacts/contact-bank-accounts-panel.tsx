'use client'

import { useEffect, useState } from 'react'
import { Plus, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardDigitsInput, DigitsInput, IbanInput } from '@/components/ui/masked-input'
import { apiFetch } from '@/lib/utils'
import { IRAN_BANKS } from '@deska/shared'

export interface ContactBankAccount {
  id: string
  bankName: string
  accountNumber?: string
  cardNumber?: string
  sheba?: string
  isDefault: boolean
}

interface ContactBankAccountsPanelProps {
  contactId: string
  accounts: ContactBankAccount[]
  onChange: () => void
}

const EMPTY_FORM = {
  bankName: '',
  accountNumber: '',
  cardNumber: '',
  sheba: '',
  isDefault: false,
}

export function ContactBankAccountsPanel({
  contactId,
  accounts,
  onChange,
}: ContactBankAccountsPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!showForm) setForm(EMPTY_FORM)
  }, [showForm])

  const handleCreate = async () => {
    if (!form.bankName.trim()) return
    setBusy(true)
    try {
      await apiFetch(`/contacts/${contactId}/bank-accounts`, {
        method: 'POST',
        body: {
          bankName: form.bankName.trim(),
          accountNumber: form.accountNumber || undefined,
          cardNumber: form.cardNumber || undefined,
          sheba: form.sheba || undefined,
          isDefault: form.isDefault,
        },
      })
      setShowForm(false)
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const handleSetDefault = async (accountId: string) => {
    setBusy(true)
    try {
      await apiFetch(`/contacts/${contactId}/bank-accounts/${accountId}`, {
        method: 'PATCH',
        body: { isDefault: true },
      })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (accountId: string) => {
    if (!window.confirm('حساب بانکی حذف شود؟')) return
    setBusy(true)
    try {
      await apiFetch(`/contacts/${contactId}/bank-accounts/${accountId}`, {
        method: 'DELETE',
      })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">حساب‌های بانکی</CardTitle>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            افزودن
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.length === 0 && !showForm && (
          <p className="text-sm text-slate-400">حساب بانکی ثبت نشده</p>
        )}

        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-3"
          >
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {acc.bankName}
                {acc.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    <Star className="h-3 w-3" />
                    پیش‌فرض
                  </span>
                )}
              </div>
              {acc.accountNumber && (
                <p className="text-slate-600">شماره حساب: {acc.accountNumber}</p>
              )}
              {acc.cardNumber && (
                <p className="text-slate-600">شماره کارت: {acc.cardNumber}</p>
              )}
              {acc.sheba && <p className="text-slate-600">شبا: {acc.sheba}</p>}
            </div>
            <div className="flex gap-2">
              {!acc.isDefault && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => handleSetDefault(acc.id)}
                >
                  پیش‌فرض
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => handleDelete(acc.id)}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {showForm && (
          <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                نام بانک<span className="mr-1 text-red-500">*</span>
              </label>
              <select
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm hover:border-slate-400"
              >
                <option value="">انتخاب بانک</option>
                {IRAN_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
              </select>
            </div>
            <DigitsInput
              label="شماره حساب"
              value={form.accountNumber}
              onValueChange={(value) => setForm({ ...form, accountNumber: value })}
              maxDigits={20}
            />
            <CardDigitsInput
              label="شماره کارت"
              value={form.cardNumber}
              onValueChange={(value) => setForm({ ...form, cardNumber: value })}
            />
            <IbanInput
              label="شبا"
              value={form.sheba}
              onValueChange={(value) => setForm({ ...form, sheba: value })}
              placeholder="IR120170000000123456789012"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded border-slate-300"
              />
              حساب پیش‌فرض
            </label>
            <div className="flex gap-2">
              <Button size="sm" isLoading={busy} onClick={handleCreate} disabled={!form.bankName.trim()}>
                ذخیره
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
                انصراف
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
