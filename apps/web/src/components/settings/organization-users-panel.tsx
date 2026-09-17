'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2, UserCheck, Users, X } from 'lucide-react';
import {
  ORGANIZATIONAL_ROLES,
  TENANT_ROLE_LABELS,
  TENANT_ROLES,
} from '@deska/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/utils';

interface MemberUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  isActive: boolean;
}

export interface OrganizationMember {
  userId: string;
  role: string;
  joinedAt: string;
  user: MemberUser;
}

interface OrganizationInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedUser?: { id: string; name: string; email: string; phone?: string | null } | null;
}

interface PlatformUserSearchResult {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  membershipStatus?: string | null;
  pendingInvitationId?: string | null;
}

interface OrganizationUsersPanelProps {
  tenantId: string | null;
  memberRole?: string | null;
  showCard?: boolean;
}

type MemberModalMode = 'add' | 'edit';

interface UserFormState {
  role: string;
}

const EMPTY_FORM: UserFormState = {
  role: TENANT_ROLES.MEMBER,
};

function roleBadgeVariant(role: string): 'default' | 'success' | 'warning' | 'info' {
  if (role === TENANT_ROLES.OWNER) return 'success';
  if (role === TENANT_ROLES.ADMIN) return 'info';
  if (role === TENANT_ROLES.MANAGER) return 'warning';
  return 'default';
}

function RoleSelect({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50"
      >
        {ORGANIZATIONAL_ROLES.map((role) => (
          <option key={role} value={role}>
            {TENANT_ROLE_LABELS[role]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function OrganizationUsersPanel({
  tenantId,
  memberRole,
  showCard = true,
}: OrganizationUsersPanelProps) {
  const { user: currentUser } = useAuth();
  const membersPath = tenantId ? `/tenants/${tenantId}/members` : null;
  const invitationsPath =
    tenantId && (memberRole === TENANT_ROLES.OWNER || memberRole === TENANT_ROLES.ADMIN)
      ? `/tenants/${tenantId}/invitations`
      : null;

  const { data, isLoading, error, refetch } = useApi<OrganizationMember[]>(membersPath);
  const { data: invitationData, refetch: refetchInvitations } = useApi<OrganizationInvitation[]>(invitationsPath);

  const [modalMode, setModalMode] = useState<MemberModalMode | null>(null);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
  const [formState, setFormState] = useState<UserFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<PlatformUserSearchResult[]>([]);
  const [selectedPlatformUser, setSelectedPlatformUser] = useState<PlatformUserSearchResult | null>(null);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const members = Array.isArray(data) ? data : [];
  const invitations = Array.isArray(invitationData) ? invitationData : [];
  const canManage = memberRole === TENANT_ROLES.OWNER || memberRole === TENANT_ROLES.ADMIN;

  useEffect(() => {
    if (modalMode === 'edit' && editingMember) {
      setFormState({ role: editingMember.role });
      setSaveError(null);
    }
    if (modalMode === 'add') {
      setFormState({ ...EMPTY_FORM });
      setSaveError(null);
    }
  }, [modalMode, editingMember]);

  const closeModal = () => {
    setModalMode(null);
    setEditingMember(null);
    setFormState(EMPTY_FORM);
    setSaveError(null);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setSelectedPlatformUser(null);
  };

  const openAddModal = () => {
    setEditingMember(null);
    setRequestSuccess(null);
    setModalMode('add');
  };

  const openEditModal = (member: OrganizationMember) => {
    setEditingMember(member);
    setModalMode('edit');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !modalMode) return;

    setSaving(true);
    setSaveError(null);
    let invitationSent = false;

    try {
      if (modalMode === 'add') {
        if (!selectedPlatformUser) {
          setSaveError('ابتدا یک کاربر پلتفرم را جستجو و انتخاب کنید');
          return;
        }
        await apiFetch(`/tenants/${tenantId}/invite`, {
          method: 'POST',
          body: {
            userId: selectedPlatformUser.id,
            role: formState.role,
          },
        });
        invitationSent = true;
      } else if (editingMember) {
        await apiFetch(`/tenants/${tenantId}/members/${editingMember.userId}`, {
          method: 'PATCH',
          body: {
            role: editingMember.role === TENANT_ROLES.OWNER ? undefined : formState.role,
          },
        });
      }
      closeModal();
      await refetch();
      await refetchInvitations();
      if (invitationSent) {
        setRequestSuccess('درخواست عضویت به پنل کاربر ارسال شد؛ پس از تأیید او به سازمان اضافه می‌شود.');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const searchPlatformUsers = async () => {
    if (!tenantId || userSearchQuery.trim().length < 5) {
      setSaveError('برای جستجو حداقل ۵ کاراکتر از ایمیل یا شماره موبایل وارد کنید');
      return;
    }
    setSearchingUsers(true);
    setSaveError(null);
    try {
      const results = await apiFetch<PlatformUserSearchResult[]>(
        `/tenants/${tenantId}/users/search?q=${encodeURIComponent(userSearchQuery.trim())}`,
      );
      setUserSearchResults(results);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'جستجوی کاربران انجام نشد');
    } finally {
      setSearchingUsers(false);
    }
  };

  const selectPlatformUser = (platformUser: PlatformUserSearchResult) => {
    if (platformUser.membershipStatus || platformUser.pendingInvitationId) return;
    setSelectedPlatformUser(platformUser);
    setUserSearchResults([]);
    setSaveError(null);
  };

  const revokeInvitation = async (id: string) => {
    if (!tenantId || !window.confirm('این دعوت‌نامه لغو شود؟')) return;
    await apiFetch(`/tenants/${tenantId}/invitations/${id}`, { method: 'DELETE' });
    await refetchInvitations();
  };

  const resendInvitation = async (id: string) => {
    if (!tenantId) return;
    await apiFetch(`/tenants/${tenantId}/invitations/${id}/resend`, { method: 'POST' });
    window.alert('دعوت عضویت تمدید شد و در حساب کاربر قابل مشاهده است.');
    await refetchInvitations();
  };

  const handleDeleteMember = async (member: OrganizationMember) => {
    if (!tenantId) return;
    const label = member.user.name || member.user.email;
    if (!window.confirm(`آیا از حذف «${label}» از سازمان مطمئن هستید؟`)) return;

    setDeletingUserId(member.userId);
    try {
      await apiFetch(`/tenants/${tenantId}/members/${member.userId}`, {
        method: 'DELETE',
      });
      await refetch();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'خطا در حذف کاربر');
    } finally {
      setDeletingUserId(null);
    }
  };

  const canDeleteMember = (member: OrganizationMember) => {
    if (!canManage) return false;
    if (member.role === TENANT_ROLES.OWNER) return false;
    if (member.userId === currentUser?.id) return false;
    return true;
  };

  const content = (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {requestSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {requestSuccess}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>نام</TableHead>
              <TableHead>ایمیل</TableHead>
              <TableHead>نقش</TableHead>
              <TableHead>وضعیت حساب</TableHead>
              {canManage && <TableHead>عملیات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableEmpty
                colSpan={canManage ? 5 : 4}
                message="کاربری در این سازمان ثبت نشده است"
              />
            ) : (
              members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell className="font-medium text-slate-900">
                    {member.user.name || '—'}
                  </TableCell>
                  <TableCell dir="ltr" className="text-left text-slate-600">
                    {member.user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(member.role)}>
                      {TENANT_ROLE_LABELS[member.role as keyof typeof TENANT_ROLE_LABELS] ??
                        member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.user.isActive ? 'success' : 'default'}>
                      {member.user.isActive ? 'فعال' : 'غیرفعال'}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {member.role !== TENANT_ROLES.OWNER && (
                          <Button variant="outline" size="sm" onClick={() => openEditModal(member)}>
                            <Pencil className="h-3.5 w-3.5" />
                            ویرایش نقش
                          </Button>
                        )}
                        {canDeleteMember(member) && (
                          <Button
                            variant="outline"
                            size="sm"
                            isLoading={deletingUserId === member.userId}
                            onClick={() => handleDeleteMember(member)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            حذف
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {canManage && invitations.length > 0 && (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">دعوت‌نامه‌ها</h3>
          {invitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-800">
                  {invitation.invitedUser?.name ?? 'کاربر پلتفرم'}
                </span>
                <span className="block text-xs text-slate-500" dir="ltr">
                  {invitation.email}
                </span>
              </span>
              <Badge
                variant={
                  invitation.status === 'pending'
                    ? 'warning'
                    : invitation.status === 'accepted'
                      ? 'success'
                      : 'default'
                }
              >
                {invitation.status}
              </Badge>
              {invitation.status === 'pending' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => void resendInvitation(invitation.id)}>
                    ارسال مجدد
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void revokeInvitation(invitation.id)}>
                    لغو
                  </Button>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <h3 className="text-lg font-semibold">
                {modalMode === 'add' ? 'دعوت کاربر' : 'ویرایش نقش کاربر'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded p-1 hover:bg-slate-100"
                aria-label="بستن"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {modalMode === 'add' && (
                <section className="space-y-3 rounded-xl border border-primary-100 bg-primary-50/40 p-4">
                  <div>
                    <h4 className="font-semibold text-slate-900">انتخاب کاربر پلتفرم</h4>
                    <p className="mt-1 text-sm text-slate-500">
                      کاربر باید قبلاً در پلتفرم ثبت‌نام کرده باشد. درخواست در پنل او نمایش داده می‌شود.
                    </p>
                  </div>
                  {selectedPlatformUser ? (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white p-3">
                      <UserCheck className="h-5 w-5 text-emerald-600" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{selectedPlatformUser.name}</p>
                        <p className="truncate text-xs text-slate-500" dir="ltr">
                          {selectedPlatformUser.email}
                          {selectedPlatformUser.phone ? ` · ${selectedPlatformUser.phone}` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPlatformUser(null)}
                      >
                        تغییر
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          dir="ltr"
                          value={userSearchQuery}
                          onChange={(event) => setUserSearchQuery(event.target.value)}
                          placeholder="email@example.com یا 0912..."
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void searchPlatformUsers();
                            }
                          }}
                        />
                        <Button type="button" onClick={() => void searchPlatformUsers()} isLoading={searchingUsers}>
                          <Search className="h-4 w-4" />
                          جستجو
                        </Button>
                      </div>
                      {userSearchResults.length > 0 && (
                        <div className="space-y-2">
                          {userSearchResults.map((platformUser) => {
                            const unavailable =
                              !!platformUser.membershipStatus || !!platformUser.pendingInvitationId;
                            return (
                              <button
                                key={platformUser.id}
                                type="button"
                                disabled={unavailable}
                                onClick={() => selectPlatformUser(platformUser)}
                                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-right disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-slate-900">{platformUser.name}</p>
                                  <p className="truncate text-xs text-slate-500" dir="ltr">
                                    {platformUser.email}
                                    {platformUser.phone ? ` · ${platformUser.phone}` : ''}
                                  </p>
                                </div>
                                {unavailable && (
                                  <Badge variant="default">
                                    {platformUser.membershipStatus ? 'عضو سازمان' : 'دعوت شده'}
                                  </Badge>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              {modalMode === 'edit' && editingMember?.role === TENANT_ROLES.OWNER ? (
                <p className="text-sm text-slate-600">نقش مالک سازمان قابل تغییر نیست.</p>
              ) : (
                <RoleSelect
                  label="نقش در سازمان"
                  value={formState.role}
                  onChange={(role) => setFormState({ role })}
                />
              )}

              {saveError && <p className="text-sm text-red-600">{saveError}</p>}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={closeModal}>
                  انصراف
                </Button>
                <Button type="submit" isLoading={saving}>
                  {modalMode === 'add' ? 'ارسال دعوت' : 'ذخیره'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  if (!showCard) {
    return content;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>کاربران سازمان</CardTitle>
            <p className="mt-0.5 text-sm text-slate-500">
              مدیریت اعضا و نقش‌های دسترسی
              {members.length > 0 ? ` — ${members.length} نفر` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button size="sm" onClick={openAddModal} disabled={!tenantId}>
              <Plus className="h-4 w-4" />
              افزودن کاربر
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={!tenantId}>
            <RefreshCw className="h-4 w-4" />
            بروزرسانی
          </Button>
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
