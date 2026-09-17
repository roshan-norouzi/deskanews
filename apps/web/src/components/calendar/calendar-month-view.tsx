'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, Sparkles, X } from 'lucide-react'
import {
  buildGregorianMonthGrid,
  buildJalaliMonthGrid,
  formatGregorianKey,
  formatGregorianLabel,
  formatGregorianMonthLabel,
  formatLunarDate,
  formatPersianDigits,
  formatJalaliKey,
  formatJalaliLabel,
  formatJalaliMonthLabel,
  getGregorianToday,
  getJalaliToday,
  IRAN_WEEKDAY_LABELS,
  isIranFriday,
  normalizeDigits,
  toGregorianParts,
  toJalaliParts,
  type CalendarCellDate,
} from '@deska/shared'
import { Button } from '@/components/ui/button'
import { JalaliDateInput } from '@/components/ui/jalali-date-input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  type CalendarSystem,
  formatJalaliDate,
} from '@/lib/date'
import { cn } from '@/lib/utils'
import { getEventsForCalendarDay } from '@/lib/calendar-events'
import { apiFetch } from '@/lib/utils'

export interface CalendarMonthEvent {
  id: string
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay?: boolean
  recurrenceType?: string
  recurrenceCal?: string
  recurrenceRule?: unknown
  entityType?: string
  entityId?: string | null
  isHoliday?: boolean
  color?: string | null
  location?: string
}

interface CalendarMonthViewProps {
  events: CalendarMonthEvent[]
  onSelectEvent?: (event: CalendarMonthEvent) => void
  onEventCreated?: () => Promise<unknown> | void
}

interface MonthCursor {
  jalali: { jy: number; jm: number }
  gregorian: { gy: number; gm: number }
}

interface SelectedDay {
  cell: CalendarCellDate
  events: CalendarMonthEvent[]
}

function CalendarToggle({
  value,
  onChange,
}: {
  value: CalendarSystem
  onChange: (system: CalendarSystem) => void
}) {
  return (
    <div
      className="flex rounded-xl border border-slate-200 bg-slate-100/80 p-1"
      role="group"
      aria-label="نوع تقویم"
    >
      {(['jalali', 'gregorian'] as const).map((system) => (
        <button
          key={system}
          type="button"
          onClick={() => onChange(system)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === system
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {system === 'jalali' ? 'شمسی' : 'میلادی'}
        </button>
      ))}
    </div>
  )
}

function formatDayNumber(cell: CalendarCellDate, system: CalendarSystem): string {
  const value = system === 'jalali' ? cell.jalali.jd : cell.gregorian.gd
  return system === 'jalali' ? formatPersianDigits(value) : String(value)
}

function getAlternateDayLabel(cell: CalendarCellDate, system: CalendarSystem): string {
  if (system === 'jalali') {
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]
    return `${cell.gregorian.gd} ${monthNames[cell.gregorian.gm - 1] ?? ''} ${cell.gregorian.gy}`
  }
  return formatPersianDigits(`${formatJalaliLabel(cell.jalali)} ${cell.jalali.jy}`)
}

function getLunarDayLabel(cell: CalendarCellDate): string {
  return formatLunarDate(
    new Date(Date.UTC(cell.gregorian.gy, cell.gregorian.gm - 1, cell.gregorian.gd)),
  )
}

export function CalendarMonthView({ events, onSelectEvent, onEventCreated }: CalendarMonthViewProps) {
  const [system, setSystem] = useState<CalendarSystem>('jalali')
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null)
  const [createDate, setCreateDate] = useState<CalendarCellDate | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', description: '', startAt: '', endAt: '', location: '', allDay: true, recurrenceType: 'none', recurrenceCal: 'jalali', recurrenceUntil: '', recurrenceInterval: '1' })
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<MonthCursor>(() => {
    const jalali = getJalaliToday()
    const gregorian = getGregorianToday()
    return {
      jalali: { jy: jalali.jy, jm: jalali.jm },
      gregorian: { gy: gregorian.gy, gm: gregorian.gm },
    }
  })

  const cells = useMemo(() => {
    if (system === 'jalali') {
      return buildJalaliMonthGrid(cursor.jalali.jy, cursor.jalali.jm)
    }
    return buildGregorianMonthGrid(cursor.gregorian.gy, cursor.gregorian.gm)
  }, [cursor, system])

  const todayJalali = getJalaliToday()
  const todayGregorian = getGregorianToday()
  const todayKey =
    system === 'jalali'
      ? formatJalaliKey(todayJalali)
      : formatGregorianKey(todayGregorian)

  const monthLabel =
    system === 'jalali'
      ? formatJalaliMonthLabel({ ...cursor.jalali, jd: 1 })
      : formatGregorianMonthLabel({ ...cursor.gregorian, gd: 1 })

  const alternateMonthLabel =
    system === 'jalali'
      ? formatGregorianMonthLabel({ ...cursor.gregorian, gd: 1 })
      : formatJalaliMonthLabel(
          { ...toJalaliParts(cursor.gregorian.gy, cursor.gregorian.gm, 1), jd: 1 },
        )

  const handleToday = () => {
    const jalali = getJalaliToday()
    const gregorian = getGregorianToday()
    setCursor({
      jalali: { jy: jalali.jy, jm: jalali.jm },
      gregorian: { gy: gregorian.gy, gm: gregorian.gm },
    })
  }

  const handlePrevMonth = () => {
    setCursor((current) => {
      if (system === 'jalali') {
        const jm = current.jalali.jm === 1 ? 12 : current.jalali.jm - 1
        const jy = current.jalali.jm === 1 ? current.jalali.jy - 1 : current.jalali.jy
        const gregorian = toGregorianParts(jy, jm, 1)
        return {
          jalali: { jy, jm },
          gregorian: { gy: gregorian.gy, gm: gregorian.gm },
        }
      }

      const gm = current.gregorian.gm === 1 ? 12 : current.gregorian.gm - 1
      const gy = current.gregorian.gm === 1 ? current.gregorian.gy - 1 : current.gregorian.gy
      const jalali = toJalaliParts(gy, gm, 1)
      return {
        gregorian: { gy, gm },
        jalali: { jy: jalali.jy, jm: jalali.jm },
      }
    })
  }

  const handleNextMonth = () => {
    setCursor((current) => {
      if (system === 'jalali') {
        const jm = current.jalali.jm === 12 ? 1 : current.jalali.jm + 1
        const jy = current.jalali.jm === 12 ? current.jalali.jy + 1 : current.jalali.jy
        const gregorian = toGregorianParts(jy, jm, 1)
        return {
          jalali: { jy, jm },
          gregorian: { gy: gregorian.gy, gm: gregorian.gm },
        }
      }

      const gm = current.gregorian.gm === 12 ? 1 : current.gregorian.gm + 1
      const gy = current.gregorian.gm === 12 ? current.gregorian.gy + 1 : current.gregorian.gy
      const jalali = toJalaliParts(gy, gm, 1)
      return {
        gregorian: { gy, gm },
        jalali: { jy: jalali.jy, jm: jalali.jm },
      }
    })
  }

  useEffect(() => {
    if (!selectedDay) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedDay(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedDay])

  const openDay = (cell: CalendarCellDate, dayEvents: CalendarMonthEvent[]) => {
    setSelectedDay({ cell, events: dayEvents })
  }

  const openCreate = (cell?: CalendarCellDate) => {
    const date = cell ? new Date(Date.UTC(cell.gregorian.gy, cell.gregorian.gm - 1, cell.gregorian.gd)) : new Date()
    const day = date.toISOString().slice(0, 10)
    setCreateDate(cell ?? null)
    setCreateOpen(true)
    setCreateForm({ title: '', description: '', startAt: `${day}T09:00`, endAt: `${day}T10:00`, location: '', allDay: true, recurrenceType: 'none', recurrenceCal: 'jalali', recurrenceUntil: '', recurrenceInterval: '1' })
    setCreateError(null)
  }

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!createForm.title.trim()) return
    setCreateBusy(true)
    setCreateError(null)
    try {
      const recurrenceRule = createForm.recurrenceType === 'none' ? undefined : {
        calendar: createForm.recurrenceCal,
        interval: Number(createForm.recurrenceInterval) || 1,
        ...(createForm.recurrenceUntil ? { until: createForm.recurrenceUntil } : {}),
      }
      await apiFetch('/calendar/events', { method: 'POST', body: {
        title: createForm.title.trim(), description: createForm.description || undefined,
        startAt: new Date(createForm.startAt).toISOString(), endAt: new Date(createForm.endAt).toISOString(),
        location: createForm.location || undefined, allDay: createForm.allDay,
        recurrenceType: createForm.recurrenceType, recurrenceCal: createForm.recurrenceCal, recurrenceRule,
      } })
      setCreateDate(null)
      setCreateOpen(false)
      await onEventCreated?.()
    } catch (err) { setCreateError(err instanceof Error ? err.message : 'خطا در ثبت رویداد') }
    finally { setCreateBusy(false) }
  }

  const selectedDayTitle = selectedDay
    ? system === 'jalali'
      ? formatJalaliLabel(selectedDay.cell.jalali, true)
      : formatGregorianLabel(selectedDay.cell.gregorian, true)
    : ''
  const selectedDayAlternate = selectedDay
    ? system === 'jalali'
      ? formatGregorianLabel(selectedDay.cell.gregorian, true)
      : formatJalaliLabel(selectedDay.cell.jalali, true)
    : ''
  const selectedDayLunar = selectedDay ? getLunarDayLabel(selectedDay.cell) : ''
  const createDateParts = createForm.startAt.slice(0, 10).split('-').map(Number)
  const createDateLabel = createDateParts.length === 3 && createDateParts.every(Number.isFinite)
    ? formatJalaliLabel(toJalaliParts(createDateParts[0], createDateParts[1], createDateParts[2]), true)
    : ''
  const createDateInput = createForm.startAt.slice(0, 10)
  const changeCreateDate = (date: string) => {
    if (!date) return
    setCreateForm((current) => ({
      ...current,
      startAt: `${date}T${current.startAt.slice(11, 16) || '09:00'}`,
      endAt: `${date}T${current.endAt.slice(11, 16) || '10:00'}`,
    }))
  }
  const selectedIsHoliday = selectedDay?.events.some((event) => event.isHoliday || event.entityId === 'holiday')
  const selectedObservances = selectedDay?.events.filter(
    (event) => event.isHoliday || event.entityId === 'holiday' || event.entityId === 'observance' || event.entityType === 'official_observance',
  ) ?? []
  const selectedEvents = selectedDay?.events.filter(
    (event) => !selectedObservances.some((observance) => observance.id === event.id),
  ) ?? []

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="space-y-4 border-b border-slate-100 bg-gradient-to-l from-slate-50 via-white to-white pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">
                {system === 'jalali' ? 'تقویم شمسی' : 'تقویم میلادی'}
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="text-slate-400">{alternateMonthLabel}</span>
              </p>
              <div className="mt-1 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0"
                  onClick={handlePrevMonth}
                  aria-label="ماه قبل"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <h2 className="min-w-[9rem] text-center text-xl font-bold text-slate-900 sm:min-w-[11rem]">
                  {monthLabel}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0"
                  onClick={handleNextMonth}
                  aria-label="ماه بعد"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CalendarToggle value={system} onChange={setSystem} />
            <Button variant="outline" size="sm" onClick={handleToday}>
              امروز
            </Button>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              افزودن رویداد
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
          {IRAN_WEEKDAY_LABELS.map((label, index) => (
            <div
              key={label}
              className={cn(
                'py-2 text-center text-[10px] font-semibold sm:text-xs',
                index === 6 ? 'text-rose-500' : 'text-slate-500',
              )}
            >
              <span className="text-[10px] leading-tight sm:text-xs">{label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {cells.map((cell) => {
            const key =
              system === 'jalali'
                ? formatJalaliKey(cell.jalali)
                : formatGregorianKey(cell.gregorian)
            const dayEvents = getEventsForCalendarDay(events, cell, system)
            const hasHoliday = dayEvents.some((event) => event.isHoliday || event.entityId === 'holiday')
            const isToday = key === todayKey
            const isFriday = isIranFriday(cell.gregorian.gy, cell.gregorian.gm, cell.gregorian.gd)
            const isThursday = cell.iranWeekday === 5
            const dayNumber = formatDayNumber(cell, system)
            const alternateDay = getAlternateDayLabel(cell, system)
            const lunarDay = getLunarDayLabel(cell)

            return (
              <div
                key={`${formatGregorianKey(cell.gregorian)}-${cell.isOutsideMonth ? 'out' : 'in'}`}
                role="button"
                tabIndex={cell.isOutsideMonth ? -1 : 0}
                onClick={() => !cell.isOutsideMonth && openDay(cell, dayEvents)}
                onKeyDown={(event) => {
                  if (!cell.isOutsideMonth && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault()
                    openDay(cell, dayEvents)
                  }
                }}
                className={cn(
                  'group flex min-h-[5.5rem] flex-col rounded-xl border p-1.5 transition-colors sm:min-h-[6.5rem] sm:p-2',
                  cell.isOutsideMonth
                    ? 'border-transparent bg-slate-50/40'
                    : hasHoliday || isFriday
                      ? 'border-red-200 bg-red-50/70 hover:border-red-300 hover:bg-red-50'
                      : isThursday
                        ? 'border-amber-200 bg-amber-50/70 hover:border-amber-300 hover:bg-amber-50'
                      : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50',
                  isToday && !cell.isOutsideMonth && 'border-primary-200 ring-1 ring-primary-200',
                )}
              >
                <div className="mb-1 flex items-start justify-between gap-1">
                  <span
                    className={cn(
                      'inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold sm:h-7 sm:min-w-7 sm:text-sm',
                      hasHoliday && !cell.isOutsideMonth
                        ? 'bg-red-600 text-white'
                        : isToday && !cell.isOutsideMonth
                          ? 'bg-primary-600 text-white'
                          : isFriday && !cell.isOutsideMonth
                            ? 'text-rose-600'
                            : cell.isOutsideMonth
                              ? 'text-slate-300'
                              : 'text-slate-700',
                    )}
                  >
                    {dayNumber}
                  </span>
                  {!cell.isOutsideMonth && (
                    <span className="flex flex-col items-end truncate text-[9px] text-slate-400 sm:text-[10px]">
                      <span dir="ltr" className="text-left">{alternateDay}</span>
                      <span className="text-slate-300">{lunarDay}</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 2).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation()
                        onSelectEvent?.(event)
                      }}
                      className="truncate rounded-md px-1.5 py-0.5 text-right text-[10px] font-medium text-slate-700 transition-opacity hover:opacity-70 sm:text-[11px]"
                      title={`${event.title} · ${formatJalaliDate(event.startAt)}`}
                    >
                      {event.title}
                    </button>
                  ))}
                  {dayEvents.length > 2 && (
                    <p className="text-[9px] font-medium text-slate-400 sm:text-[10px]">
                      {system === 'jalali'
                        ? `${formatPersianDigits(`+${dayEvents.length - 2}`)} رویداد`
                        : `+${dayEvents.length - 2} more`}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>

      {selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedDay(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-day-title"
            className="max-h-[92vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl"
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-indigo-700 px-6 pb-7 pt-6 text-white">
              <div className="absolute -left-10 -top-16 h-44 w-44 rounded-full bg-white/10" />
              <div className="absolute -bottom-20 right-8 h-48 w-48 rounded-full bg-indigo-300/15" />
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="absolute left-4 top-4 rounded-full bg-white/15 p-2 transition-colors hover:bg-white/25"
                aria-label="بستن جزئیات روز"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="relative flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white/70">جزئیات روز</p>
                  <h2 id="calendar-day-title" className="mt-1 text-2xl font-bold">{selectedDayTitle}</h2>
                  <p className="mt-1 text-xs text-white/70">{selectedDayAlternate} <span className="mx-1">·</span> {selectedDayLunar}</p>
                  <p className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold">تاریخ انتخاب‌شده: {selectedDayTitle}</p>
                </div>
              </div>
              <div className="relative mt-5 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white/15 px-3 py-1.5">{selectedDay.events.length} رویداد</span>
                {selectedIsHoliday && <span className="rounded-full bg-rose-400/80 px-3 py-1.5">تعطیل / مناسبتی</span>}
                {isIranFriday(selectedDay.cell.gregorian.gy, selectedDay.cell.gregorian.gm, selectedDay.cell.gregorian.gd) && <span className="rounded-full bg-white/15 px-3 py-1.5">جمعه</span>}
              </div>
            </div>

            <div className="max-h-[56vh] overflow-y-auto p-5 sm:p-6">
              {selectedDay.events.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600"><Sparkles className="h-7 w-7" /></div>
                  <h3 className="mt-4 font-semibold text-slate-800">رویدادی برای این روز ثبت نشده</h3>
                  <p className="mt-1 text-sm text-slate-500">این روز برای برنامه‌ریزی شما آماده است.</p>
                  <Button className="mt-5" size="sm" onClick={() => openCreate(selectedDay.cell)}>
                    <Plus className="h-4 w-4" />
                    افزودن رویداد برای این روز
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {selectedObservances.length > 0 && (
                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        <h3 className="text-sm font-bold text-slate-800">مناسبت‌ها و تعطیلات</h3>
                      </div>
                      <div className="space-y-3">
                        {selectedObservances.map((event) => (
                          <DayEventCard key={event.id} event={event} onSelect={() => { onSelectEvent?.(event); setSelectedDay(null) }} />
                        ))}
                      </div>
                    </section>
                  )}
                  {selectedEvents.length > 0 && (
                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary-600" />
                        <h3 className="text-sm font-bold text-slate-800">رویدادهای روز</h3>
                      </div>
                      <div className="space-y-3">
                        {selectedEvents.map((event) => (
                          <DayEventCard key={event.id} event={event} onSelect={() => { onSelectEvent?.(event); setSelectedDay(null) }} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-left sm:px-6">
              <Button variant="outline" size="sm" onClick={() => setSelectedDay(null)}>بستن</Button>
            </div>
          </div>
        </div>
      )}
      {createOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCreateDate(null); setCreateOpen(false) } }}>
          <form onSubmit={submitCreate} className="w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold text-slate-900">افزودن رویداد</h2><p className="mt-1 text-sm text-slate-500">رویداد جدید را برای تقویم ثبت کنید</p></div><button type="button" onClick={() => { setCreateDate(null); setCreateOpen(false) }} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <div className="space-y-4">
              <input required autoFocus placeholder="عنوان رویداد" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
              <textarea placeholder="توضیحات (اختیاری)" value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
              <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-primary-700">تاریخ شمسی رویداد</p><p className="mt-1 text-lg font-bold text-slate-800">{createDateLabel}</p></div>{createDate === null && <JalaliDatePicker value={createDateInput} onChange={changeCreateDate} />}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-600">ساعت شروع<input type="time" required value={createForm.startAt.slice(11, 16)} onChange={(e) => setCreateForm({ ...createForm, startAt: `${createForm.startAt.slice(0, 11)}${e.target.value}` })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-sm text-slate-600">ساعت پایان<input type="time" required value={createForm.endAt.slice(11, 16)} onChange={(e) => setCreateForm({ ...createForm, endAt: `${createForm.endAt.slice(0, 11)}${e.target.value}` })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" /></label></div></div>
              <input placeholder="مکان (اختیاری)" value={createForm.location} onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={createForm.allDay} onChange={(e) => setCreateForm({ ...createForm, allDay: e.target.checked })} className="rounded border-slate-300" /> رویداد تمام‌روز</label>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <label className="block text-sm font-medium text-slate-700">تکرار رویداد</label>
                <select value={createForm.recurrenceType} onChange={(e) => setCreateForm({ ...createForm, recurrenceType: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="none">بدون تکرار</option><option value="daily">روزانه</option><option value="weekly">هفتگی</option><option value="monthly">ماهانه</option><option value="yearly">سالانه</option>
                </select>
                {createForm.recurrenceType !== 'none' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-600">تقویم تکرار<select value={createForm.recurrenceCal} onChange={(e) => setCreateForm({ ...createForm, recurrenceCal: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="jalali">شمسی</option><option value="gregorian">میلادی</option><option value="lunar">قمری</option></select></label><label className="text-sm text-slate-600">فاصله تکرار<input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} placeholder="1" value={createForm.recurrenceInterval} onChange={(e) => setCreateForm({ ...createForm, recurrenceInterval: normalizeDigits(e.target.value).slice(0, 2) })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label><div className="sm:col-span-2"><JalaliDateInput label="تکرار تا (اختیاری)" value={createForm.recurrenceUntil} onChange={(e) => setCreateForm({ ...createForm, recurrenceUntil: e.target.value })} /></div></div>}
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setCreateDate(null); setCreateOpen(false) }}>انصراف</Button><Button type="submit" isLoading={createBusy}>ثبت رویداد</Button></div>
          </form>
        </div>
      ) : null}
    </Card>
  )
}

function JalaliDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parsed = value.split('-').map(Number)
  const initial = parsed.length === 3 && parsed.every(Number.isFinite)
    ? toJalaliParts(parsed[0], parsed[1], parsed[2])
    : getJalaliToday()
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState({ jy: initial.jy, jm: initial.jm })
  const selectedKey = parsed.length === 3 ? `${parsed[0]}-${parsed[1]}-${parsed[2]}` : ''
  const cells = buildJalaliMonthGrid(cursor.jy, cursor.jm)
  const today = getJalaliToday()

  const shiftMonth = (amount: number) => {
    let jm = cursor.jm + amount
    let jy = cursor.jy
    if (jm < 1) { jm = 12; jy -= 1 }
    if (jm > 12) { jm = 1; jy += 1 }
    setCursor({ jy, jm })
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} className="mt-1 inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-700 shadow-sm hover:border-primary-400">
        <CalendarDays className="h-4 w-4" /> انتخاب روز شمسی
      </button>
      {open && <div className="absolute left-0 top-full z-30 mt-2 w-[19rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
        <div className="flex items-center justify-between"><button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg p-1.5 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button><p className="text-sm font-bold text-slate-800">{formatJalaliMonthLabel({ jy: cursor.jy, jm: cursor.jm, jd: 1 })}</p><button type="button" onClick={() => shiftMonth(1)} className="rounded-lg p-1.5 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button></div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center">{IRAN_WEEKDAY_LABELS.map((label) => <span key={label} className="py-1 text-[10px] font-semibold text-slate-400">{label}</span>)}
          {cells.map((cell) => { const key = `${cell.gregorian.gy}-${String(cell.gregorian.gm).padStart(2, '0')}-${String(cell.gregorian.gd).padStart(2, '0')}`; const selected = key === selectedKey; const isToday = cell.jalali.jy === today.jy && cell.jalali.jm === today.jm && cell.jalali.jd === today.jd; return <button key={key} type="button" disabled={cell.isOutsideMonth} onClick={() => { const g = cell.gregorian; onChange(`${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`); setOpen(false) }} className={cn('h-8 rounded-lg text-xs transition-colors', cell.isOutsideMonth ? 'text-slate-200' : selected ? 'bg-primary-600 font-bold text-white' : isToday ? 'bg-primary-50 font-bold text-primary-700' : 'text-slate-700 hover:bg-primary-50 hover:text-primary-700')}>{formatPersianDigits(cell.jalali.jd)}</button> })}
        </div>
        <button type="button" onClick={() => { const g = toGregorianParts(today.jy, today.jm, today.jd); onChange(`${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`); setCursor({ jy: today.jy, jm: today.jm }); setOpen(false) }} className="mt-3 w-full rounded-lg bg-slate-50 py-2 text-xs font-medium text-primary-700 hover:bg-primary-50">امروز</button>
      </div>}
    </div>
  )
}

function DayEventCard({ event, onSelect }: { event: CalendarMonthEvent; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={(clickEvent) => { clickEvent.stopPropagation(); onSelect() }}
      className="group flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
    >
      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: event.color ?? (event.isHoliday ? '#e11d48' : '#4f46e5') }} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-800 group-hover:text-primary-700">{event.title}</span>
        {event.description && <span className="mt-1 block text-xs leading-5 text-slate-500">{event.description}</span>}
        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{event.allDay ? 'تمام روز' : new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(event.startAt))}</span>
          {event.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event.location}</span>}
        </span>
      </span>
    </button>
  )
}
