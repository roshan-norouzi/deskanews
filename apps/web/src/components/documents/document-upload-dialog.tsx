'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DocumentPreviewThumb,
  defaultDisplayNameFromFile,
} from '@/components/documents/document-preview-thumb'
import { apiFetch } from '@/lib/utils'

interface DocumentUploadDialogProps {
  open: boolean
  onClose: () => void
  onUploaded: () => void
  folderId?: string | null
  entityType?: string
  entityId?: string
  initialFile?: File | null
}

export function DocumentUploadDialog({
  open,
  onClose,
  onUploaded,
  folderId,
  entityType,
  entityId,
  initialFile = null,
}: DocumentUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setFile(null)
    setDisplayName('')
    setError(null)
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
    setLocalPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    if (initialFile) {
      applyFile(initialFile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile])

  const applyFile = (picked: File) => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
    setFile(picked)
    setDisplayName(defaultDisplayNameFromFile(picked))
    setError(null)
    if (picked.type.startsWith('image/') || picked.type === 'application/pdf') {
      setLocalPreviewUrl(URL.createObjectURL(picked))
    } else {
      setLocalPreviewUrl(null)
    }
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    applyFile(picked)
  }

  const handleUpload = async () => {
    if (!file) return
    const name = displayName.trim()
    if (!name) {
      setError('نام سند الزامی است')
      return
    }

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('displayName', name)
      if (folderId) formData.append('folderId', folderId)
      if (entityType) formData.append('entityType', entityType)
      if (entityId) formData.append('entityId', entityId)

      await apiFetch('/documents/files/upload', { method: 'POST', body: formData })
      handleClose()
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در آپلود')
    } finally {
      setUploading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold">آپلود سند</h3>
          <button type="button" onClick={handleClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {!file ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 p-8">
              <Upload className="h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500">فایل را انتخاب کنید</p>
              <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()}>
                انتخاب فایل
              </Button>
            </div>
          ) : (
            <div className="flex gap-4">
              <DocumentPreviewThumb
                mimeType={file.type || 'application/octet-stream'}
                alt={displayName || file.name}
                localUrl={localPreviewUrl}
                className="h-16 w-16"
              />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="truncate text-xs text-slate-500">{file.name}</p>
                <Input
                  label="نام سند"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="نام نمایشی سند"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  تغییر فایل
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              انصراف
            </Button>
            <Button
              type="button"
              isLoading={uploading}
              disabled={!file || !displayName.trim()}
              onClick={handleUpload}
            >
              آپلود
            </Button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
      </div>
    </div>
  )
}
