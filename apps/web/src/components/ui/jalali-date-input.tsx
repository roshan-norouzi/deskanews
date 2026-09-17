'use client'

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  buildJalaliMonthGrid,
  formatGregorianKey,
  formatPersianDigits,
  getGregorianToday,
  getJalaliToday,
  IRAN_WEEKDAY_LABELS,
  JALALI_MONTH_NAMES,
  toJalaliParts,
  type CalendarCellDate,
  type JalaliDateParts,
} from '@deska/shared'
import { formatJalaliDate } from '@/lib/date'
import { cn } from '@/lib/utils'

export interface JalaliDateInputProps {
  label?: string
  error?: string
  id?: string
  name?: string
  value?: string
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
}

function parseIsoDate(value: string): { gy: number; gm: number; gd: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const gy = Number(match[1])
  const gm = Number(match[2])
  const gd = Number(match[3])
  if (Number.isNaN(gy) || gm < 1 || gm > 12 || gd < 1 || gd > 31) return null
  return { gy, gm, gd }
}

function shiftJalaliMonth(jy: number, jm: number, delta: number): JalaliDateParts {
  const monthIndex = jy * 12 + (jm - 1) + delta
  let nextJy = Math.floor(monthIndex / 12)
  let nextJm = monthIndex % 12
  if (nextJm < 0) {
    nextJm += 12
    nextJy -= 1
  }
  return { jy: nextJy, jm: nextJm + 1, jd: 1 }
}

function viewFromValue(value?: string): { jy: number; jm: number } {
  const parsed = value ? parseIsoDate(value) : null
  if (parsed) {
    const jalali = toJalaliParts(parsed.gy, parsed.gm, parsed.gd)
    return { jy: jalali.jy, jm: jalali.jm }
  }
  const today = getJalaliToday()
  return { jy: today.jy, jm: today.jm }
}

function emitChange(
  iso: string,
  name: string | undefined,
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void,
) {
  if (!onChange) return
  onChange({ target: { value: iso, name: name ?? '' } } as ChangeEvent<HTMLInputElement>)
}

const YEAR_RANGE = 80

export const JalaliDateInput = forwardRef<HTMLInputElement, JalaliDateInputProps>(
  (
    {
      label,
      error,
      id,
      name,
      value = '',
      onChange,
      onBlur,
      disabled,
      required,
      className,
      placeholder = 'انتخاب تاریخ',
    },
    ref,
  ) => {
    const generatedId = useId()
    const inputId = id ?? label?.replace(/\s/g, '-') ?? generatedId
    const triggerRef = useRef<HTMLButtonElement>(null)
    const [open, setOpen] = useState(false)
    const [viewMonth, setViewMonth] = useState(() => viewFromValue(value))
    const [panelStyle, setPanelStyle] = useState({ top: 0, left: 0, width: 320 })

    useEffect(() => {
      if (open) setViewMonth(viewFromValue(value))
    }, [open, value])

    useEffect(() => {
      if (!open || !triggerRef.current) return

      function updatePosition() {
        const rect = triggerRef.current?.getBoundingClientRect()
        if (!rect) return
        const width = Math.max(rect.width, 320)
        let left = rect.left
        const maxLeft = window.innerWidth - width - 12
        if (left > maxLeft) left = Math.max(12, maxLeft)
        setPanelStyle({ top: rect.bottom + 8, left, width })
      }

      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }, [open])

    useEffect(() => {
      if (!open) return

      function handlePointerDown(event: MouseEvent) {
        const target = event.target as Node
        if (triggerRef.current?.contains(target)) return
        const panel = document.getElementById(`jalali-panel-${inputId}`)
        if (panel?.contains(target)) return
        setOpen(false)
      }

      document.addEventListener('mousedown', handlePointerDown)
      return () => document.removeEventListener('mousedown', handlePointerDown)
    }, [open, inputId])

    const selectedIso = value && parseIsoDate(value) ? value : ''
    const displayValue = selectedIso ? formatJalaliDate(selectedIso) : ''
    const grid = buildJalaliMonthGrid(viewMonth.jy, viewMonth.jm)
    const today = getJalaliToday()
    const currentYear = getJalaliToday().jy
    const yearOptions = Array.from({ length: YEAR_RANGE }, (_, i) => currentYear - 60 + i)

    function handleSelectDay(cell: CalendarCellDate) {
      emitChange(formatGregorianKey(cell.gregorian), name, onChange)
      setOpen(false)
    }

    const calendarPanel =
      open && !disabled ? (
        <div
          id={`jalali-panel-${inputId}`}
          role="dialog"
          aria-label="تقویم شمسی"
          style={{
            position: 'fixed',
            top: panelStyle.top,
            left: panelStyle.left,
            width: panelStyle.width,
            zIndex: 9999,
          }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl ring-1 ring-slate-900/5"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setViewMonth((current) => {
                  const next = shiftJalaliMonth(current.jy, current.jm, -1)
                  return { jy: next.jy, jm: next.jm }
                })
              }
              className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              aria-label="ماه قبل"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="flex flex-1 items-center justify-center gap-2">
              <select
                value={viewMonth.jm}
                onChange={(e) =>
                  setViewMonth((current) => ({ ...current, jm: Number(e.target.value) }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-medium text-slate-800"
              >
                {JALALI_MONTH_NAMES.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>
                    {monthName}
                  </option>
                ))}
              </select>
              <select
                value={viewMonth.jy}
                onChange={(e) =>
                  setViewMonth((current) => ({ ...current, jy: Number(e.target.value) }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-medium text-slate-800"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {formatPersianDigits(String(year))}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                setViewMonth((current) => {
                  const next = shiftJalaliMonth(current.jy, current.jm, 1)
                  return { jy: next.jy, jm: next.jm }
                })
              }
              className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              aria-label="ماه بعد"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 rounded-xl bg-slate-50 p-1">
            {IRAN_WEEKDAY_LABELS.map((weekday) => (
              <div
                key={weekday}
                className="py-1.5 text-center text-[11px] font-semibold text-slate-500"
              >
                {weekday.slice(0, 3)}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const iso = formatGregorianKey(cell.gregorian)
              const isSelected = iso === selectedIso
              const isToday =
                cell.jalali.jy === today.jy &&
                cell.jalali.jm === today.jm &&
                cell.jalali.jd === today.jd

              return (
                <button
                  key={`${cell.jalali.jy}-${cell.jalali.jm}-${cell.jalali.jd}`}
                  type="button"
                  onClick={() => handleSelectDay(cell)}
                  className={cn(
                    'relative rounded-xl py-2 text-sm transition-all',
                    cell.isOutsideMonth && 'text-slate-300',
                    !cell.isOutsideMonth && 'text-slate-700 hover:bg-primary-50 hover:text-primary-700',
                    isToday && !isSelected && 'font-bold text-primary-600 ring-1 ring-primary-200',
                    isSelected &&
                      'bg-primary-600 font-bold text-white shadow-md hover:bg-primary-600',
                  )}
                >
                  {formatPersianDigits(cell.jalali.jd)}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                emitChange(formatGregorianKey(getGregorianToday()), name, onChange)
                setViewMonth({ jy: today.jy, jm: today.jm })
                setOpen(false)
              }}
              className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
            >
              امروز
            </button>
            {selectedIso && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  emitChange('', name, onChange)
                }}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
              >
                پاک کردن
              </button>
            )}
          </div>
        </div>
      ) : null

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
            {label}
            {required && <span className="mr-1 text-red-500" aria-hidden="true">*</span>}
          </label>
        )}

        <input
          ref={ref}
          type="hidden"
          id={inputId}
          name={name}
          value={value}
          required={required}
          onChange={onChange}
          onBlur={onBlur}
        />

        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition hover:border-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            open && 'border-primary-500 ring-2 ring-primary-500/20',
            className,
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className={cn(!displayValue && 'text-slate-400')}>
            {displayValue || placeholder}
          </span>
          <Calendar className={cn('h-4 w-4 shrink-0', open ? 'text-primary-600' : 'text-slate-400')} />
        </button>

        {typeof document !== 'undefined' && calendarPanel
          ? createPortal(calendarPanel, document.body)
          : null}

        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    )
  },
)

JalaliDateInput.displayName = 'JalaliDateInput'
