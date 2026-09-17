'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, FileText, KeyRound, ShieldCheck, Trash2, User } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, withBasePath } from '@/lib/utils';
import { EmployeeProfileSettings, type EmployeeProfileData } from '@/components/settings/employee-profile-settings';

interface ProfileUpdateResult {
  user: { id: string; name: string; email: string; phone?: string | null; avatarUrl?: string | null };
  requiresReauthentication: boolean;
}

interface EmployeeProfilesResponse {
  profile: EmployeeProfileData;
}

interface UserDocument {
  id: string;
  kind: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export default function SettingsAccountPage() {
  const router = useRouter();
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfilesResponse | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const nationalCardInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setEmail(user.email ?? '');
    setPhone(user.phone ?? '');
    setAvatarUrl(user.avatarUrl ?? '');
    setProfilesLoading(true);
    void apiFetch<EmployeeProfilesResponse>('/auth/employee-profiles', { skipTenant: true })
      .then((profiles) => setEmployeeProfiles(profiles ?? null))
      .catch(() => setEmployeeProfiles(null))
      .finally(() => setProfilesLoading(false));
    setDocumentsLoading(true);
    void apiFetch<{ documents: UserDocument[] }>('/auth/user-documents', { skipTenant: true })
      .then((result) => setUserDocuments(result.documents ?? []))
      .catch(() => setUserDocuments([]))
      .finally(() => setDocumentsLoading(false));
  }, [user]);

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null); setMessage(null); setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch<{ avatarUrl: string }>('/auth/profile/avatar', { method: 'POST', skipTenant: true, body: formData });
      setAvatarUrl(result.avatarUrl);
      await refresh();
      setMessage('تصویر پروفایل با موفقیت بارگذاری شد');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'خطا در بارگذاری تصویر پروفایل');
    } finally { setAvatarUploading(false); }
  }

  async function handleNationalCardUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setDocumentError(null);
    setDocumentUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiFetch<UserDocument>('/auth/user-documents/national-card', {
        method: 'POST',
        skipTenant: true,
        body: formData,
      });
      const result = await apiFetch<{ documents: UserDocument[] }>('/auth/user-documents', { skipTenant: true });
      setUserDocuments(result.documents ?? []);
      setMessage('تصویر کارت ملی در اسناد کاربر ذخیره شد');
    } catch (reason) {
      setDocumentError(reason instanceof Error ? reason.message : 'خطا در بارگذاری تصویر کارت ملی');
    } finally {
      setDocumentUploading(false);
    }
  }

  async function handleUserDocumentDelete(documentId: string) {
    if (!window.confirm('آیا از حذف تصویر کارت ملی اطمینان دارید؟')) return;
    setDocumentError(null);
    try {
      await apiFetch(`/auth/user-documents/${documentId}`, { method: 'DELETE', skipTenant: true });
      setUserDocuments((documents) => documents.filter((document) => document.id !== documentId));
      setMessage('سند کاربر حذف شد');
    } catch (reason) {
      setDocumentError(reason instanceof Error ? reason.message : 'خطا در حذف سند کاربر');
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
  }

  const avatarPreview = avatarUrl
    ? avatarUrl.startsWith('/') ? withBasePath(`/api${avatarUrl}`) : avatarUrl
    : null;

  async function handleProfileSave(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (name.trim().length < 2) {
      setError('نام باید حداقل ۲ کاراکتر باشد');
      return;
    }
    const emailChanged = email.trim().toLowerCase() !== user?.email.toLowerCase();
    if (emailChanged && !profilePassword) {
      setError('برای تغییر ایمیل، رمز عبور فعلی را وارد کنید');
      return;
    }

    setSavingProfile(true);
    try {
      const result = await apiFetch<ProfileUpdateResult>('/auth/profile', {
        method: 'PATCH',
        skipTenant: true,
        body: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          ...(emailChanged ? { currentPassword: profilePassword } : {}),
        },
      });
      setProfilePassword('');
      if (result.requiresReauthentication) {
        await logout();
        router.replace('/login?reason=email-changed');
        return;
      }
      await refresh();
      setMessage('اطلاعات حساب با موفقیت ذخیره شد');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'خطا در ذخیره اطلاعات حساب');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (newPassword.length < 12) {
      setError('رمز عبور جدید باید حداقل ۱۲ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('تکرار رمز عبور با رمز جدید یکسان نیست');
      return;
    }

    setSavingPassword(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'PATCH',
        skipTenant: true,
        body: { currentPassword, newPassword },
      });
      await logout();
      router.replace('/login?reason=password-changed');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'خطا در تغییر رمز عبور');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <ProtectedLayout title="حساب کاربری" tenantRequired={false}>
      <div className="mx-auto w-full max-w-3xl space-y-6" dir="rtl">
        <header className="flex items-start gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl shadow-slate-900/10">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><ShieldCheck className="h-6 w-6" /></span>
          <div><h2 className="text-2xl font-bold">حساب کاربری</h2><p className="mt-2 text-sm text-slate-300">اطلاعات شخصی، راه‌های ارتباطی و امنیت حساب خود را مدیریت کنید.</p></div>
        </header>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70"><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" />اطلاعات کاربری و پرسنلی</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 p-5">
              {avatarPreview ? <img src={avatarPreview} alt="تصویر پروفایل" className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow" /> : <div className="grid h-20 w-20 place-items-center rounded-full bg-slate-200 text-slate-500"><User className="h-8 w-8" /></div>}
              <div className="flex-1"><p className="text-sm font-medium text-slate-800">تصویر پروفایل</p><p className="mt-1 text-xs text-slate-500">JPG، PNG یا WebP؛ حداکثر ۵ مگابایت</p></div>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
              <Button type="button" variant="outline" isLoading={avatarUploading} onClick={() => avatarInputRef.current?.click()}>بارگذاری تصویر</Button>
            </div>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid gap-4 px-6 pt-5 sm:grid-cols-2">
                <Input label="نام و نام خانوادگی" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
                <Input label="ایمیل" type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
                <Input label="شماره موبایل" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0912... یا +98912..." autoComplete="tel" />
              </div>
              <div className="space-y-4 px-6 pb-5">
                {email.trim().toLowerCase() !== user?.email.toLowerCase() && (
                  <Input label="رمز فعلی برای تأیید تغییر ایمیل" type="password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} required autoComplete="current-password" />
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                {message && <p className="text-sm text-green-600">{message}</p>}
                <Button type="submit" isLoading={savingProfile}>ذخیره اطلاعات حساب</Button>
              </div>
            </form>
            {profilesLoading ? <div className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">در حال دریافت اطلاعات پرسنلی...</div> : !employeeProfiles ? <p className="border-t border-slate-200 px-6 py-5 text-sm text-slate-500">اطلاعات پرسنلی در دسترس نیست.</p> : <EmployeeProfileSettings embedded tenant={{ id: 'global', name: 'همه سازمان‌های شما' }} employee={employeeProfiles.profile} />}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />اسناد کاربر</CardTitle><p className="mt-1 text-xs text-slate-500">تصویر کارت ملی به حساب کاربری شما تعلق دارد و مستقل از سازمان‌ها نگهداری می‌شود.</p></CardHeader>
          <CardContent className="space-y-4">
            {documentsLoading ? <div className="py-4 text-center text-sm text-slate-500">در حال دریافت اسناد...</div> : userDocuments.length === 0 ? <p className="text-sm text-slate-500">هنوز سندی برای حساب شما ثبت نشده است.</p> : userDocuments.map((document) => (
              <div key={document.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600"><FileText className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{document.kind === 'national_card' ? 'تصویر کارت ملی' : document.originalName}</p><p className="mt-1 text-xs text-slate-500">{document.originalName} · {formatFileSize(document.size)}</p></div>
                <a className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50" href={withBasePath(`/api/auth/user-documents/${document.id}/file`)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />مشاهده</a>
                <Button type="button" variant="danger" size="sm" onClick={() => void handleUserDocumentDelete(document.id)}><Trash2 className="h-4 w-4" />حذف</Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <input ref={nationalCardInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleNationalCardUpload} />
              <Button type="button" variant="outline" isLoading={documentUploading} onClick={() => nationalCardInputRef.current?.click()}>بارگذاری تصویر کارت ملی</Button>
              <span className="text-xs text-slate-500">JPG، PNG یا WebP؛ حداکثر ۵ مگابایت</span>
            </div>
            {documentError && <p className="text-sm text-red-600">{documentError}</p>}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70"><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />تغییر رمز عبور</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <Input label="رمز عبور فعلی" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" />
              <Input label="رمز عبور جدید" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} autoComplete="new-password" />
              <Input label="تکرار رمز عبور جدید" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} autoComplete="new-password" />
              <p className="text-xs text-slate-500">پس از تغییر رمز، همه نشست‌ها بسته می‌شوند و باید دوباره وارد شوید.</p>
              <Button type="submit" isLoading={savingPassword}>تغییر رمز و خروج از همه نشست‌ها</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
