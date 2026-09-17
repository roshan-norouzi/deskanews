'use client';

import { useRef, useState } from 'react';
import { Download, Paperclip, Pencil, Trash2, Upload } from 'lucide-react';
import { DocumentPreviewThumb } from '@/components/documents/document-preview-thumb';
import { RenameDialog } from '@/components/documents/document-rename-dialog';
import { DocumentUploadDialog } from '@/components/documents/document-upload-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { formatJalaliDate } from '@/lib/date';
import { apiFetch, withBasePath } from '@/lib/utils';

interface DocumentFile {
  id: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  sizeBytes?: number;
  createdAt: string;
}

interface EntityDocumentsPanelProps {
  entityType: string;
  entityId: string;
  title?: string;
}

export function EntityDocumentsPanel({
  entityType,
  entityId,
  title = 'اسناد پیوست',
}: EntityDocumentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editingFile, setEditingFile] = useState<DocumentFile | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [savingFile, setSavingFile] = useState(false);
  const { data, isLoading, refetch } = useApi<DocumentFile[]>(
    `/documents/files?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
  );

  const files = Array.isArray(data) ? data : [];

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setShowUpload(true);
    }
    e.target.value = '';
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('فایل حذف شود؟')) return;
    await apiFetch(`/documents/files/${id}`, { method: 'DELETE' });
    await refetch();
  };

  const openFileEdit = (file: DocumentFile) => {
    setEditingFile(file);
    setEditingFileName(file.originalName);
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    const originalName = editingFileName.trim();
    if (!originalName) return;
    setSavingFile(true);
    try {
      await apiFetch(`/documents/files/${editingFile.id}`, {
        method: 'PATCH',
        body: { originalName },
      });
      setEditingFile(null);
      await refetch();
    } finally {
      setSavingFile(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handlePickFile} />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="ml-2 h-4 w-4" />
              آپلود
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-slate-500">در حال بارگذاری...</p> : null}
          {!isLoading && files.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Paperclip className="h-4 w-4" />
              سندی پیوست نشده
            </p>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
                  <DocumentPreviewThumb
                    fileId={file.id}
                    mimeType={file.mimeType ?? 'application/octet-stream'}
                    alt={file.originalName}
                    className="h-12 w-12"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.originalName}</p>
                    <p className="text-xs text-slate-500">
                      {formatSize(file.sizeBytes ?? file.size)} · {formatJalaliDate(file.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-slate-100"
                      onClick={() => openFileEdit(file)}
                      aria-label="ویرایش"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <a
                      href={withBasePath(`/api/documents/files/${file.id}/download`)}
                      className="inline-flex rounded p-1 hover:bg-slate-100"
                      aria-label="دانلود"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(file.id)}
                      aria-label="حذف"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DocumentUploadDialog
        open={showUpload}
        onClose={() => {
          setShowUpload(false);
          setPendingFile(null);
        }}
        onUploaded={() => refetch()}
        entityType={entityType}
        entityId={entityId}
        initialFile={pendingFile}
      />

      <RenameDialog
        open={!!editingFile}
        title="ویرایش سند"
        label="نام سند"
        value={editingFileName}
        onChange={setEditingFileName}
        onClose={() => setEditingFile(null)}
        onSave={handleSaveFile}
        saving={savingFile}
      />
    </>
  );
}
