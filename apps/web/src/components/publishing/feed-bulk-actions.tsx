'use client';

import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { ApiError, apiFetch, apiFetchBlob } from '@/lib/utils';

interface BulkImportResult {
  ok: boolean;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

interface FeedBulkActionsProps {
  exportPath: string;
  importPath: string;
  skipTenant?: boolean;
  onImported?: () => void | Promise<void>;
  confirmImportMessage?: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FeedBulkActions({
  exportPath,
  importPath,
  skipTenant = false,
  onImported,
  confirmImportMessage = 'پس از آپلود، منابعی که در فایل نیستند حذف می‌شوند. ادامه می‌دهید؟',
}: FeedBulkActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState('');

  async function exportWorkbook() {
    setExporting(true);
    setError('');
    try {
      const blob = await apiFetchBlob(exportPath, { skipTenant });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, exportPath.includes('/platform/') ? `deska-platform-feeds-${stamp}.xlsx` : `deska-org-feeds-${stamp}.xlsx`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'خروجی Excel انجام نشد');
    } finally {
      setExporting(false);
    }
  }

  async function importWorkbook(file: File) {
    if (!window.confirm(confirmImportMessage)) return;
    setImporting(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const data = await apiFetch<BulkImportResult>(importPath, {
        method: 'POST',
        body,
        skipTenant,
      });
      setResult(data);
      setResultOpen(true);
      await onImported?.();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'ورود فایل انجام نشد');
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" isLoading={exporting} onClick={() => void exportWorkbook()}>
          <Download className="h-4 w-4" />
          خروجی Excel
        </Button>
        <Button type="button" variant="outline" isLoading={importing} onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" />
          ورود Excel
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importWorkbook(file);
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Modal open={resultOpen && !!result} onClose={() => setResultOpen(false)} size="md">
        {result && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ModalHeader title="نتیجه ورود فایل" onClose={() => setResultOpen(false)} />
            <ModalBody className="space-y-3 p-6 text-sm text-slate-700">
              <p>{result.ok ? 'همه ردیف‌ها با موفقیت پردازش شدند.' : 'برخی ردیف‌ها خطا داشتند؛ بقیه اعمال شدند.'}</p>
              <ul className="grid gap-1 rounded-xl bg-slate-50 p-4">
                <li>افزوده: {result.created}</li>
                <li>ویرایش: {result.updated}</li>
                <li>حذف: {result.deleted}</li>
                <li>خطا: {result.failed}</li>
              </ul>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                  {result.errors.map((item) => (
                    <p key={`${item.row}-${item.message}`}>
                      {item.row > 0 ? `ردیف ${item.row}: ` : ''}{item.message}
                    </p>
                  ))}
                </div>
              )}
            </ModalBody>
            <ModalFooter className="flex justify-end">
              <Button type="button" onClick={() => setResultOpen(false)}>بستن</Button>
            </ModalFooter>
          </div>
        )}
      </Modal>
    </>
  );
}
