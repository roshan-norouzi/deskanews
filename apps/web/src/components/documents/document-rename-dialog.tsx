'use client'

import { Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface RenameDialogProps {
  open: boolean
  title: string
  label: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  onSave: () => void
  saving?: boolean
}

export function RenameDialog({
  open,
  title,
  label,
  value,
  onChange,
  onClose,
  onSave,
  saving = false,
}: RenameDialogProps) {
  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          <Input
            label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              انصراف
            </Button>
            <Button type="submit" isLoading={saving} disabled={!value.trim()}>
              ذخیره
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface IconActionButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'danger'
  children: React.ReactNode
}

export function IconActionButton({
  label,
  onClick,
  disabled,
  variant = 'default',
  children,
}: IconActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={label}
      className={`rounded p-1 disabled:opacity-40 ${
        variant === 'danger'
          ? 'text-red-600 hover:bg-red-50'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

export function EditIconButton(props: Omit<IconActionButtonProps, 'children'>) {
  return (
    <IconActionButton {...props}>
      <Pencil className="h-3.5 w-3.5" />
    </IconActionButton>
  )
}
