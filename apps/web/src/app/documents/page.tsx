'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, FileStack, FolderPlus, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import { DOCUMENT_SYSTEM_FOLDERS } from '@deska/shared'
import { ProtectedLayout } from '@/components/layout/protected-layout'
import { DocumentPreviewThumb } from '@/components/documents/document-preview-thumb'
import { RenameDialog } from '@/components/documents/document-rename-dialog'
import { DocumentUploadDialog } from '@/components/documents/document-upload-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { apiFetch } from '@/lib/utils'
import { formatJalaliDate } from '@/lib/date'

interface DocumentFolder {
  id: string
  name: string
  parentId?: string | null
  isSystem?: boolean
  systemKey?: string | null
}

interface DocumentFile {
  id: string
  originalName: string
  mimeType: string
  size?: number
  sizeBytes?: number
  folderId?: string | null
  entityType?: string | null
  entityId?: string | null
  entityName?: string | null
  createdAt: string
}

function formatSize(bytes?: number) {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentsContent() {
  const { data: foldersData, isLoading: foldersLoading, refetch: refetchFolders } =
    useApi<DocumentFolder[]>('/documents/folders')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)
  const [editingFile, setEditingFile] = useState<DocumentFile | null>(null)
  const [editingFileName, setEditingFileName] = useState('')
  const [savingFile, setSavingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filesPath = useMemo(() => {
    if (!selectedFolderId) return '/documents/files'
    return `/documents/files?folderId=${encodeURIComponent(selectedFolderId)}`
  }, [selectedFolderId])

  const { data: filesData, isLoading: filesLoading, error, refetch: refetchFiles } =
    useApi<DocumentFile[]>(filesPath)

  const folders = Array.isArray(foldersData) ? foldersData : []
  const files = Array.isArray(filesData) ? filesData : []

  const selectedFolder = folders.find((f) => f.id === selectedFolderId)
  const showEntityColumn =
    selectedFolder?.systemKey === DOCUMENT_SYSTEM_FOLDERS.CONTACT_DOCUMENTS.systemKey ||
    selectedFolder?.systemKey === DOCUMENT_SYSTEM_FOLDERS.EMPLOYEE_DOCUMENTS.systemKey ||
    files.some((f) => f.entityType === 'Contact' || f.entityType === 'Employee')

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(true)
    try {
      await apiFetch('/documents/folders', {
        method: 'POST',
        body: { name, parentId: selectedFolderId || undefined },
      })
      setNewFolderName('')
      await refetchFolders()
    } finally {
      setCreatingFolder(false)
    }
  }

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    if (picked) {
      setPendingFile(picked)
      setShowUpload(true)
    }
    e.target.value = ''
  }

  const openFolderEdit = (folder: DocumentFolder) => {
    setEditingFolder(folder)
    setEditingFolderName(folder.name)
  }

  const handleSaveFolder = async () => {
    if (!editingFolder) return
    const name = editingFolderName.trim()
    if (!name) return
    setSavingFolder(true)
    try {
      await apiFetch(`/documents/folders/${editingFolder.id}`, {
        method: 'PATCH',
        body: { name },
      })
      setEditingFolder(null)
      await refetchFolders()
    } finally {
      setSavingFolder(false)
    }
  }

  const handleDeleteFolder = async (folder: DocumentFolder) => {
    if (folder.isSystem) return
    if (!window.confirm(`پوشه «${folder.name}» و تمام فایل‌های داخل آن حذف شود؟`)) return
    setDeletingFolderId(folder.id)
    try {
      await apiFetch(`/documents/folders/${folder.id}`, { method: 'DELETE' })
      if (selectedFolderId === folder.id) setSelectedFolderId(null)
      await refetchFolders()
      await refetchFiles()
    } finally {
      setDeletingFolderId(null)
    }
  }

  const openFileEdit = (file: DocumentFile) => {
    setEditingFile(file)
    setEditingFileName(file.originalName)
  }

  const handleSaveFile = async () => {
    if (!editingFile) return
    const originalName = editingFileName.trim()
    if (!originalName) return
    setSavingFile(true)
    try {
      await apiFetch(`/documents/files/${editingFile.id}`, {
        method: 'PATCH',
        body: { originalName },
      })
      setEditingFile(null)
      await refetchFiles()
    } finally {
      setSavingFile(false)
    }
  }

  const handleDeleteFile = async (id: string) => {
    if (!window.confirm('این فایل حذف شود؟')) return
    setDeletingFileId(id)
    try {
      await apiFetch(`/documents/files/${id}`, { method: 'DELETE' })
      await refetchFiles()
    } finally {
      setDeletingFileId(null)
    }
  }

  const handleRefresh = () => {
    void refetchFolders()
    void refetchFiles()
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><FileStack className="h-6 w-6" /></span><div><h2 className="text-2xl font-bold">اسناد</h2><p className="mt-2 text-sm text-slate-300">مدیریت پوشه‌ها و فایل‌های سازمانی در یک فضای یکپارچه</p></div></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
            بروزرسانی
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            آپلود فایل
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handlePickFile} />
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70">
            <CardTitle className="text-base">پوشه‌ها</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              type="button"
              onClick={() => setSelectedFolderId(null)}
              className={`w-full rounded-lg px-3 py-2 text-right text-sm ${
                selectedFolderId === null
                  ? 'bg-primary-50 text-primary-700'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              همه فایل‌ها
            </button>
            {foldersLoading ? (
              <p className="text-sm text-slate-400">بارگذاری...</p>
            ) : (
              <ul className="space-y-1">
                {folders.map((folder) => (
                  <li key={folder.id}>
                    <div
                      className={`flex items-center gap-1 rounded-lg pr-1 ${
                        selectedFolderId === folder.id ? 'bg-primary-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-right text-sm ${
                          selectedFolderId === folder.id ? 'text-primary-700' : 'text-slate-700'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">{folder.name}</span>
                          {folder.isSystem && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                              سیستمی
                            </span>
                          )}
                        </span>
                      </button>
                      {!folder.isSystem && (
                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            onClick={() => openFolderEdit(folder)}
                            className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                            aria-label={`ویرایش پوشه ${folder.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingFolderId === folder.id}
                            onClick={() => handleDeleteFolder(folder)}
                            className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
                            aria-label={`حذف پوشه ${folder.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
                {folders.length === 0 && (
                  <li className="text-sm text-slate-400">پوشه‌ای نیست</li>
                )}
              </ul>
            )}
            <div className="space-y-2 border-t pt-3">
              <Input
                label="پوشه جدید"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="نام پوشه"
              />
              <Button
                size="sm"
                className="w-full"
                isLoading={creatingFolder}
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                <FolderPlus className="h-4 w-4" />
                ایجاد پوشه
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70">
            <CardTitle>
              فایل‌ها
              {selectedFolderId ? ` — ${selectedFolder?.name ?? ''}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filesLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">پیش‌نمایش</TableHead>
                    <TableHead>نام سند</TableHead>
                    {showEntityColumn && <TableHead>مربوط به</TableHead>}
                    <TableHead>نوع</TableHead>
                    <TableHead>حجم</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.length === 0 ? (
                    <TableEmpty colSpan={showEntityColumn ? 7 : 6} message="فایلی یافت نشد" />
                  ) : (
                    files.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell>
                          <DocumentPreviewThumb
                            fileId={file.id}
                            mimeType={file.mimeType}
                            alt={file.originalName}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{file.originalName}</TableCell>
                        {showEntityColumn && (
                          <TableCell>
                            {(file.entityType === 'Contact' || file.entityType === 'Employee') && file.entityId ? (
                              <Link
                                href={file.entityType === 'Employee' ? `/employees/${file.entityId}` : `/contacts/${file.entityId}`}
                                className="text-primary-600 hover:text-primary-800 hover:underline"
                              >
                                {file.entityName ?? '—'}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        )}
                        <TableCell>{file.mimeType}</TableCell>
                        <TableCell>{formatSize(file.sizeBytes ?? file.size)}</TableCell>
                        <TableCell>{formatJalaliDate(file.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openFileEdit(file)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              ویرایش
                            </Button>
                            <a
                              href={`/api/documents/files/${file.id}/download`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-50"
                              aria-label={`دانلود ${file.originalName}`}
                            >
                              <Download className="h-3.5 w-3.5" />
                              دانلود
                            </a>
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={deletingFileId === file.id}
                              onClick={() => handleDeleteFile(file.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              حذف
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <DocumentUploadDialog
        open={showUpload}
        onClose={() => {
          setShowUpload(false)
          setPendingFile(null)
        }}
        onUploaded={() => refetchFiles()}
        folderId={selectedFolderId}
        initialFile={pendingFile}
      />

      <RenameDialog
        open={!!editingFolder}
        title="ویرایش پوشه"
        label="نام پوشه"
        value={editingFolderName}
        onChange={setEditingFolderName}
        onClose={() => setEditingFolder(null)}
        onSave={handleSaveFolder}
        saving={savingFolder}
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
    </div>
  )
}

export default function DocumentsPage() {
  return (
    <ProtectedLayout title="اسناد">
      <DocumentsContent />
    </ProtectedLayout>
  )
}
