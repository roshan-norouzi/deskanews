'use client'

import { ProtectedLayout } from '@/components/layout/protected-layout'
import { CalendarMonthView } from '@/components/calendar/calendar-month-view'
import { useApi } from '@/hooks/use-api'

interface CalendarEvent {
  id: string
  title: string
  startAt: string
  endAt: string
  location?: string
  allDay?: boolean
  recurrenceType?: string
  recurrenceCal?: string
  recurrenceRule?: unknown
  entityType?: string
  entityId?: string
  isHoliday?: boolean
  color?: string | null
}

function CalendarContent() {
  const { data: monthEvents, refetch } = useApi<CalendarEvent[]>('/calendar/events')
  const events = Array.isArray(monthEvents) ? monthEvents : []

  return (
    <div>
      <CalendarMonthView events={events} onEventCreated={refetch} />
    </div>
  )
}

export default function CalendarPage() {
  return (
    <ProtectedLayout title="تقویم">
      <CalendarContent />
    </ProtectedLayout>
  )
}
