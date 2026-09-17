'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { FileText, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
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
import { Badge, statusToBadgeVariant } from '@/components/ui/badge';
import { ResourceFormFields } from '@/components/forms/resource-form-fields';
import { useApi } from '@/hooks/use-api';
import { appendQueryToPath, useListQuery } from '@/hooks/use-list-query';
import { extractListItems } from '@/lib/list-utils';
import { apiFetch } from '@/lib/utils';
import { STATUS_LABELS } from '@deska/shared';

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  accessor?: keyof T | ((row: T) => ReactNode);
}

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checkbox' | 'calendar-date' | 'contact' | 'employee' | 'department' | 'member-multi';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  contactCompanyOnly?: boolean;
}

interface ResourceListPageProps<T extends { id?: string }> {
  title: string;
  description?: string;
  apiPath: string;
  columns: ColumnDef<T>[];
  createFields?: FormField[];
  editFields?: FormField[];
  createLabel?: string;
  editLabel?: string;
  emptyMessage?: string;
  listKey?: string;
  transformCreateBody?: (values: Record<string, string>) => unknown;
  transformUpdateBody?: (values: Record<string, string>, row: T) => unknown;
  mapRowToForm?: (row: T) => Record<string, string>;
  detailHref?: (row: T) => string;
  rowActions?: (row: T, refetch: () => Promise<unknown>) => ReactNode;
  canEdit?: boolean;
  canDelete?: boolean;
  canEditRow?: (row: T) => boolean;
  canDeleteRow?: (row: T) => boolean;
  /** URL query param keys to forward from current page (e.g. contactId) */
  queryKeys?: string[];
}

type ModalMode = 'create' | 'edit';

function defaultMapRowToForm<T extends Record<string, unknown>>(
  row: T,
  fields: FormField[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const raw = row[field.name];
    if (raw === null || raw === undefined) {
      out[field.name] = '';
    } else if (typeof raw === 'object') {
      out[field.name] = JSON.stringify(raw);
    } else {
      out[field.name] = String(raw);
    }
  }
  return out;
}

export function ResourceListPage<T extends { id?: string }>({
  title,
  description,
  apiPath,
  columns,
  createFields,
  editFields,
  createLabel = 'ایجاد',
  editLabel = 'ویرایش',
  emptyMessage = 'موردی یافت نشد',
  listKey,
  transformCreateBody,
  transformUpdateBody,
  mapRowToForm,
  detailHref,
  rowActions,
  canEdit = true,
  canDelete = true,
  canEditRow,
  canDeleteRow,
  queryKeys = [],
}: ResourceListPageProps<T>) {
  const listQuery = useListQuery(queryKeys);
  const resolvedApiPath = appendQueryToPath(apiPath, listQuery);
  const { data, isLoading, error, refetch } = useApi<unknown>(resolvedApiPath);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [editingRow, setEditingRow] = useState<T | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const items = useMemo(
    () => extractListItems<T>(data, listKey),
    [data, listKey],
  );

  const activeFields =
    modalMode === 'edit' ? (editFields ?? createFields) : createFields;

  const hasWideForm = false;

  const openCreate = () => {
    setModalMode('create');
    setEditingRow(null);
    setFormValues({});
    setSubmitError(null);
  };

  const openEdit = (row: T) => {
    const fields = editFields ?? createFields;
    if (!fields?.length) return;
    setModalMode('edit');
    setEditingRow(row);
    setFormValues(mapRowToForm ? mapRowToForm(row) : defaultMapRowToForm(row as Record<string, unknown>, fields));
    setSubmitError(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingRow(null);
    setFormValues({});
    setSubmitError(null);
  };

  useEffect(() => {
    if (!modalMode) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) closeModal();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [modalMode, submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFields?.length) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const missing = activeFields.find((field) => field.required && !String(formValues[field.name] ?? '').trim());
      if (missing) {
        throw new Error(`فیلد «${missing.label}» الزامی است`);
      }
      const dateFields = activeFields
        .filter((field) => field.type === 'date' || field.type === 'calendar-date')
        .map((field) => formValues[field.name])
        .filter(Boolean);
      if (dateFields.length >= 2) {
        const parsed = dateFields.map((value) => new Date(value as string).getTime());
        if (parsed.some((value) => Number.isNaN(value))) throw new Error('یکی از تاریخ‌ها معتبر نیست');
        if (parsed[1] < parsed[0]) throw new Error('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد');
      }
      const numericFields = activeFields.filter((field) => field.type === 'number');
      for (const field of numericFields) {
        const value = formValues[field.name];
        if (value !== undefined && value !== '' && !/^\d+(\.\d+)?$/.test(value)) {
          throw new Error(`مقدار «${field.label}» باید عددی باشد`);
        }
      }
      const normalizedValues = { ...formValues };
      for (const field of activeFields) {
        if (!field.required && normalizedValues[field.name] === '') delete normalizedValues[field.name];
      }
      for (const field of numericFields) {
        if (normalizedValues[field.name] !== undefined && normalizedValues[field.name] !== '') {
          normalizedValues[field.name] = String(Number(normalizedValues[field.name]));
        }
      }
      if (modalMode === 'create') {
        const body = transformCreateBody ? transformCreateBody(normalizedValues) : normalizedValues;
        await apiFetch(apiPath, { method: 'POST', body });
      } else if (modalMode === 'edit' && editingRow?.id) {
        const body = transformUpdateBody
          ? transformUpdateBody(normalizedValues, editingRow)
          : transformCreateBody
            ? transformCreateBody(normalizedValues)
            : normalizedValues;
        await apiFetch(`${apiPath}/${editingRow.id}`, { method: 'PATCH', body });
      }
      closeModal();
      await refetch();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: T) => {
    if (!row.id) return;
    if (!window.confirm('آیا از حذف این مورد مطمئن هستید؟')) return;

    setDeletingId(row.id);
    try {
      await apiFetch(`${apiPath}/${row.id}`, { method: 'DELETE' });
      await refetch();
    } finally {
      setDeletingId(null);
    }
  };

  const handleFieldChange = (name: string, value: string) => {
    setFormValues((v) => ({ ...v, [name]: value }));
  };

  const renderCell = (row: T, col: ColumnDef<T>) => {
    if (col.render) return col.render(row);
    if (typeof col.accessor === 'function') return col.accessor(row);
    if (col.accessor) {
      const val = row[col.accessor as keyof T];
      if (col.key === 'status' && typeof val === 'string') {
        return (
          <Badge variant={statusToBadgeVariant(val)}>
            {STATUS_LABELS[val] ?? val}
          </Badge>
        );
      }
      return String(val ?? '—');
    }
    const val = row[col.key as keyof T];
    if (col.key === 'status' && typeof val === 'string') {
      return (
        <Badge variant={statusToBadgeVariant(val)}>
          {STATUS_LABELS[val] ?? val}
        </Badge>
      );
    }
    return String(val ?? '—');
  };

  const showCrudActions =
    (canEdit && createFields && createFields.length > 0) || canDelete;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><FileText className="h-6 w-6" /></span><div>
          <h2 className="text-2xl font-bold">{title}</h2>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>}
        </div></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            بروزرسانی
          </Button>
          {createFields && createFields.length > 0 && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {createLabel}
            </Button>
          )}
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
                  {columns.map((col) => (
                    <TableHead key={col.key}>{col.header}</TableHead>
                  ))}
                  {(rowActions || showCrudActions) && <TableHead>عملیات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableEmpty
                    colSpan={columns.length + (rowActions || showCrudActions ? 1 : 0)}
                    message={emptyMessage}
                  />
                ) : (
                  items.map((row, idx) => (
                    <TableRow key={row.id ?? idx} className={detailHref ? 'hover:bg-slate-50' : undefined}>
                      {columns.map((col, colIdx) => (
                        <TableCell key={col.key}>
                          {detailHref && colIdx === 0 && row.id ? (
                            <Link
                              href={detailHref(row)}
                              className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                            >
                              {renderCell(row, col)}
                            </Link>
                          ) : (
                            renderCell(row, col)
                          )}
                        </TableCell>
                      ))}
                      {(rowActions || showCrudActions) && (
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {rowActions?.(row, refetch)}
                            {canEdit &&
                              createFields &&
                              createFields.length > 0 &&
                              (!canEditRow || canEditRow(row)) && (
                                <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                  ویرایش
                                </Button>
                              )}
                            {canDelete && (!canDeleteRow || canDeleteRow(row)) && row.id && (
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
        </CardContent>
      </Card>

      {modalMode && activeFields && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={`w-full overflow-hidden rounded-3xl bg-white shadow-2xl ${hasWideForm ? 'max-w-2xl' : 'max-w-md'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-dialog-title"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-5">
              <h3 id="resource-dialog-title" className="text-lg font-semibold">
                {modalMode === 'create' ? createLabel : editLabel}
              </h3>
              <button type="button" onClick={closeModal} className="rounded p-1 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
              <ResourceFormFields
                fields={activeFields}
                values={formValues}
                onChange={handleFieldChange}
              />
              {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeModal}>
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
  );
}
