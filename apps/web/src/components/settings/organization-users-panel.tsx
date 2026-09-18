'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2, UserCheck, Users, X } from 'lucide-react';
import { TENANT_ROLE_LABELS, TENANT_ROLES } from '@deska/shared';
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
import { PermissionBadges, PermissionPicker } from '@/components/settings/permission-picker';
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
  permissions: string[];
  joinedAt: string;
  user: MemberUser;
}

interface PlatformUserSearchResult {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  membershipStatus?: string | null;
}

interface OrganizationUsersPanelProps {
  tenantId: string | null;
  memberRole?: string | null;
  showCard?: boolean;
}

type MemberModalMode = 'add' | 'edit';

const EMPTY_PERMISSIONS: string[] = ['dashboard.view', 'publishing.view'];

export function OrganizationUsersPanel({
  tenantId,
  memberRole,
  showCard = true,
}: OrganizationUsersPanelProps) {
  const { user: currentUser } = useAuth();
  const membersPath = tenantId ? `/tenants/${tenantId}/members` : null;
  const { data, isLoading, error, refetch } = useApi<OrganizationMember[]>(membersPath);

  const [modalMode, setModalMode] = useState<MemberModalMode | null>(null);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(EMPTY_PERMISSIONS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<PlatformUserSearchResult[]>([]);
  const [selectedPlatformUser, setSelectedPlatformUser] = useState<PlatformUserSearchResult | null>(null);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const members = Array.isArray(data) ? data : [];
  const canManage = memberRole === TENANT_ROLES.OWNER;

  useEffect(() => {
    if (modalMode === 'edit' && editingMember) {
      setSelectedPermissions(editingMember.permissions ?? []);
      setSaveError(null);
    }
    if (modalMode === 'add') {
      setSelectedPermissions([...EMPTY_PERMISSIONS]);
      setSaveError(null);
    }
  }, [modalMode, editingMember]);

  const closeModal = () => {
    setModalMode(null);
    setEditingMember(null);
    setSelectedPermissions([...EMPTY_PERMISSIONS]);
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
    if (!selectedPermissions.length) {
      setSaveError('حداقل یک سطح دسترسی انتخاب کنید');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      if (modalMode === 'add') {
        if (!selectedPlatformUser) {
          setSaveError('ابتدا یک کاربر پلتفرم را جستجو و انتخاب کنید');
          return;
        }
        await apiFetch(`/tenants/${tenantId}/members`, {
          method: 'POST',
          body: {
            userId: selectedPlatformUser.id,
            permissions: selectedPermissions,
          },
        });
        setRequestSuccess('کاربر با موفقیت به سازمان اضافه شد.');
      } else if (editingMember) {
        await apiFetch(`/tenants/${tenantId}/members/${editingMember.userId}`, {
          method: 'PATCH',
          body: { permissions: selectedPermissions },
        });
      }
      closeModal();
      await refetch();
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
    if (platformUser.membershipStatus) return;
    setSelectedPlatformUser(platformUser);
    setUserSearchResults([]);
    setSaveError(null);
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
              <TableHead>دسترسی‌ها</TableHead>
              <TableHead>وضعیت حساب</TableHead>
              {canManage && <TableHead>عملیات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableEmpty
                colSpan={canManage ? 6 : 5}
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
                    <Badge variant={member.role === TENANT_ROLES.OWNER ? 'success' : 'default'}>
                      {TENANT_ROLE_LABELS[member.role as keyof typeof TENANT_ROLE_LABELS] ??
                        member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.role === TENANT_ROLES.OWNER ? (
                      <Badge variant="success">دسترسی کامل</Badge>
                    ) : (
                      <PermissionBadges permissions={member.permissions ?? []} />
                    )}
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
                            ویرایش دسترسی
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

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <h3 className="text-lg font-semibold">
                {modalMode === 'add' ? 'افزودن کاربر به سازمان' : 'ویرایش دسترسی کاربر'}
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
                      کاربر باید قبلاً توسط مدیر کل در پلتفرم ایجاد شده باشد.
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
                            const unavailable = !!platformUser.membershipStatus;
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
                                {unavailable && <Badge variant="default">عضو سازمان</Badge>}
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
                <p className="text-sm text-slate-600">مالک سازمان همیشه دسترسی کامل دارد.</p>
              ) : (
                <PermissionPicker
                  value={selectedPermissions}
                  onChange={setSelectedPermissions}
                />
              )}

              {saveError && <p className="text-sm text-red-600">{saveError}</p>}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={closeModal}>
                  انصراف
                </Button>
                <Button type="submit" isLoading={saving}>
                  {modalMode === 'add' ? 'افزودن به سازمان' : 'ذخیره'}
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
              افزودن کاربران پلتفرم و تعیین سطح دسترسی
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
