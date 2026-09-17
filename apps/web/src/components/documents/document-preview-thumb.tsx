'use client'

import { useEffect, useState } from 'react'
import { File, FileImage, FileText } from 'lucide-react'
import { apiFetchBlob } from '@/lib/utils'

interface DocumentPreviewThumbProps {
  fileId?: string
  mimeType: string
  alt: string
  /** Local preview before upload (Object URL) */
  localUrl?: string | null
  className?: string
}

function isImageMime(mimeType: string) {
  return mimeType.startsWith('image/')
}

function isPdfMime(mimeType: string) {
  return mimeType === 'application/pdf'
}

function canPreview(mimeType: string) {
  return isImageMime(mimeType) || isPdfMime(mimeType)
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (isImageMime(mimeType)) return <FileImage className="h-5 w-5 text-slate-400" />
  if (isPdfMime(mimeType)) return <FileText className="h-5 w-5 text-red-400" />
  return <File className="h-5 w-5 text-slate-400" />
}

async function createSmallPreview(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith('image/')) return blob
  const bitmap = await createImageBitmap(blob)
  const maxSize = 160
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve) => canvas.toBlob((small) => resolve(small ?? blob), 'image/webp', 0.72))
}

export function DocumentPreviewThumb({
  fileId,
  mimeType,
  alt,
  localUrl,
  className = 'h-12 w-12',
}: DocumentPreviewThumbProps) {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (localUrl || !fileId || !canPreview(mimeType)) return

    let objectUrl: string | null = null
    let cancelled = false

    void apiFetchBlob(`/documents/files/${fileId}/preview`)
      .then((blob) => createSmallPreview(blob))
      .then((smallBlob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(smallBlob)
        setRemoteUrl(objectUrl)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId, mimeType, localUrl])

  const previewUrl = localUrl ?? remoteUrl
  const boxClass = `${className} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center`

  if (!canPreview(mimeType) || failed) {
    return (
      <div className={boxClass} title={alt}>
        <FileTypeIcon mimeType={mimeType} />
      </div>
    )
  }

  if (!previewUrl) {
    return (
      <div className={boxClass} title={alt}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (isPdfMime(mimeType)) {
    return (
      <div className={`${boxClass} relative`} title={alt}>
        <iframe
          src={previewUrl}
          title={alt}
          className="pointer-events-none h-full w-full scale-[0.35] origin-top-left"
          style={{ width: '285%', height: '285%' }}
        />
      </div>
    )
  }

  return (
    <img
      src={previewUrl}
      alt={alt}
      className={`${boxClass} object-cover`}
      onError={() => setFailed(true)}
    />
  )
}

export function defaultDisplayNameFromFile(file: File): string {
  const dot = file.name.lastIndexOf('.')
  if (dot <= 0) return file.name
  return file.name.slice(0, dot)
}
