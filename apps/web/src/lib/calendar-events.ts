import {
  type CalendarCellDate,
  eventMatchesCalendarCell,
} from '@deska/shared'

export interface CalendarDisplayEvent {
  id: string
  title: string
  startAt: string
  endAt: string
  allDay?: boolean
  recurrenceType?: string
  recurrenceCal?: string
  recurrenceRule?: unknown
  entityId?: string | null
  isHoliday?: boolean
  color?: string | null
}

export function getEventsForCalendarDay(
  events: CalendarDisplayEvent[],
  cell: CalendarCellDate,
  system: 'jalali' | 'gregorian',
): CalendarDisplayEvent[] {
  return events.filter((event) =>
    eventMatchesCalendarCell(
      event.startAt,
      cell,
      system,
      event.recurrenceType,
      event.recurrenceCal,
      event.recurrenceRule,
    ),
  )
}
