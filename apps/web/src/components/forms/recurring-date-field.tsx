'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  JALALI_MONTH_NAMES,
  jalaliMonthLength,
  formatPersianDigits,
} from '@deska/shared'
import { cn } from '@/lib/utils'

const GREGORIAN_MONTH_NAMES = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
]

const LUNAR_MONTH_NAMES = [
  'محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه',
]

const DEFAULT_YEARS = { jalali: 1405, gregorian: 2026, lunar: 1448 } as const

type CalendarType = keyof typeof DEFAULT_YEARS

interface RecurringDateFieldProps {
  label: string
  value: string
  calendar: string
  onChange: (value: string) => void
  required?: boolean
}

function parseValue(value: string) {
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})$/)
  if (!match) return null
  return { month: Number(match[1]), day: Number(match[2]) }
}

export function RecurringDateField({
  label,
  value,
  calendar,
  onChange,
  required,
}: RecurringDateFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const type = (calendar in DEFAULT_YEARS ? calendar : 'jalali') as CalendarType
  const parsed = parseValue(value)
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(parsed?.month ?? 1)

  useEffect(() => {
    const nextMonth = parseValue(value)?.month
    if (nextMonth) setMonth(nextMonth)
  }, [value])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const monthNames = type === 'jalali'
    ? JALALI_MONTH_NAMES
    : type === 'gregorian'
      ? GREGORIAN_MONTH_NAMES
      : LUNAR_MONTH_NAMES

  const daysInMonth = useMemo(() => {
    if (type === 'jalali') return jalaliMonthLength(DEFAULT_YEARS.jalali, month)
    if (type === 'gregorian') return new Date(Date.UTC(DEFAULT_YEARS.gregorian, month, 0)).getUTCDate()
    return month % 2 === 1 ? 30 : 29
  }, [month, type])

  const selectDay = (day: number) => {
    onChange(`${month}/${day}`)
    setOpen(false)
  }
  const displayDay = (day: number) => type === 'jalali' ? formatPersianDigits(day) : String(day)

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
          value ? 'border-slate-300 text-slate-900' : 'border-slate-300 text-slate-400',
        )}
        aria-expanded={open}
      >
        <span>
          {parsed ? `${displayDay(parsed.day)} ${monthNames[parsed.month - 1] ?? ''}` : 'انتخاب روز'}
        </span>
        <span className="text-xs text-slate-400">⌄</span>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          >
            {monthNames.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`روزهای ${monthNames[month - 1]}`}>
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => selectDay(day)}
                className={cn(
                  'rounded-md px-1 py-1.5 text-sm hover:bg-primary-50 hover:text-primary-700',
                  parsed?.month === month && parsed.day === day && 'bg-primary-600 text-white hover:bg-primary-700 hover:text-white',
                )}
              >
                {displayDay(day)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
