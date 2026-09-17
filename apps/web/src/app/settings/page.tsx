'use client'

import { useEffect, useState } from 'react'
import { Building2, Hash } from 'lucide-react'
import { ProtectedLayout } from '@/components/layout/protected-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/lib/tenant-context'
import { useApi } from '@/hooks/use-api'
import { apiFetch } from '@/lib/utils'
import { formatPersianDigits } from '@deska/shared'

interface TenantDetail {
  id: string
  name: string
  slug: string
  plan: string
  locale: string
  _count?: {
    members: number
    modules: number
  }
}

interface EmployeeCodeSettings { prefix: string; suffix: string; padding: number }

function SettingsContent() {
  const { activeTenant, refreshCurrentTenant } = useTenant()
  const { data, isLoading, refetch } = useApi<TenantDetail>('/tenants/current')
  const canManage = activeTenant?.memberRole === 'owner'
  const { data: codeSettings, refetch: refetchCodeSettings } = useApi<EmployeeCodeSettings>(canManage && activeTenant ? `/tenants/${activeTenant.id}/employee-code-settings` : null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [savingCodeSettings, setSavingCodeSettings] = useState(false)

  useEffect(() => {
    if (!codeSettings) return
    setPrefix(codeSettings.prefix ?? '')
    setSuffix(codeSettings.suffix ?? '')
  }, [codeSettings])

  const tenant = data ?? activeTenant

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant) return

    setSaving(true)
    setMessage(null)
    try {
      await apiFetch(`/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: { name },
      })
      setMessage('تنظیمات ذخیره شد')
      await refetch()
      await refreshCurrentTenant()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'خطا در ذخیره')
    } finally {
      setSaving(false)
    }
  }

  const handleCodeSettingsSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!tenant) return
    setSavingCodeSettings(true)
    try {
      await apiFetch(`/tenants/${tenant.id}/employee-code-settings`, { method: 'PATCH', body: { prefix, suffix } })
      await refetchCodeSettings()
      setMessage('قالب کد پرسنلی ذخیره شد؛ روی کدهای جدید اعمال می‌شود')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'خطا در ذخیره قالب کد پرسنلی')
    } finally { setSavingCodeSettings(false) }
  }

  if (isLoading && !tenant) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
      <header className="flex items-start gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl shadow-slate-900/10"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Building2 className="h-6 w-6" /></span><div><h2 className="text-2xl font-bold">تنظیمات سازمان</h2><p className="mt-2 text-sm text-slate-300">مدیریت اطلاعات سازمان فعال و مشخصات پایه آن</p></div></header>

      <Card className="mx-auto w-full max-w-3xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70">
          <CardTitle>اطلاعات عمومی</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="نام سازمان"
              value={name || tenant?.name || ''}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="نامک" value={tenant?.slug ?? ''} disabled />
              <Input label="پلن" value={tenant?.plan ?? ''} disabled />
              <Input
                label="تعداد کارمندان"
                value={data?._count?.members != null ? formatPersianDigits(String(data._count.members)) : '—'}
                disabled
              />
            </div>
            {message && (
              <p className={`text-sm ${message.includes('خطا') ? 'text-red-600' : 'text-green-600'}`}>
                {message}
              </p>
            )}
            <Button type="submit" isLoading={saving}>
              ذخیره تغییرات
            </Button>
          </form>
        </CardContent>
      </Card>

      {canManage && tenant && (
        <Card className="mx-auto w-full max-w-3xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70"><CardTitle className="flex items-center gap-2"><Hash className="h-4 w-4" />قالب کد پرسنلی</CardTitle><p className="mt-1 text-xs text-slate-500">عدد کد پرسنلی به‌صورت خودکار و یکتا تولید می‌شود. این قالب فقط برای کدهای جدید استفاده خواهد شد.</p></CardHeader>
          <CardContent><form onSubmit={handleCodeSettingsSave} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Input label="پیشوند" value={prefix} onChange={(event) => setPrefix(event.target.value)} maxLength={20} dir="ltr" placeholder="EMP-" /><Input label="پسوند" value={suffix} onChange={(event) => setSuffix(event.target.value)} maxLength={20} dir="ltr" placeholder="-IR" /></div><p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600" dir="ltr">نمونه: {prefix || 'EMP-'}0001{suffix}</p><Button type="submit" isLoading={savingCodeSettings}>ذخیره قالب کد</Button></form></CardContent>
        </Card>
      )}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <ProtectedLayout title="تنظیمات" ownerOnly>
      <SettingsContent />
    </ProtectedLayout>
  )
}
