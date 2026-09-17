import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RECURRENCE_CALENDAR } from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { syncAllContactCalendarEvents } from '../contacts/contact-calendar-sync';
import { syncAllEmployeeCalendarEvents } from '../../platform/tenant/employee-calendar-sync';

export interface CalendarEventInput {
  title: string;
  description?: string;
  startAt: string | Date;
  endAt: string | Date;
  allDay?: boolean;
  location?: string;
  recurrenceType?: string;
  recurrenceRule?: Prisma.InputJsonValue;
  recurrenceCal?: string;
  color?: string;
  entityType?: string;
  entityId?: string;
  attendees?: Array<{ userId?: string; email?: string; name?: string }>;
}

export interface SystemObservanceInput extends CalendarEventInput {
  isHoliday?: boolean;
  sourceKey?: string;
}

function validateEventRange(startAt: string | Date | undefined, endAt: string | Date | undefined) {
  if (startAt === undefined || endAt === undefined) return;
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new BadRequestException('بازه زمانی رویداد معتبر نیست؛ پایان باید بعد از شروع باشد');
  }
}

@Injectable()
export class CalendarService {
  private readonly syncedContactCalendarTenants = new Set<string>();

  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, from?: string, to?: string, entityType?: string) {
    if (!this.syncedContactCalendarTenants.has(tenantId)) {
      await syncAllContactCalendarEvents(this.prisma, tenantId);
      this.syncedContactCalendarTenants.add(tenantId);
    }
    // Employee dates can be edited from the organization/member forms after
    // the calendar has already been opened, so refresh these events each time.
    await syncAllEmployeeCalendarEvents(this.prisma, tenantId);

    const where: Prisma.CalendarEventWhereInput = { tenantId };
    if (entityType) where.entityType = entityType;
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = new Date(from);
      if (to) where.startAt.lte = new Date(to);
    }
    const events = await this.prisma.calendarEvent.findMany({
      where,
      include: { attendees: true },
      orderBy: { startAt: 'asc' },
    });

    if (entityType && entityType !== 'official_observance') return events;

    const systemObservances = await this.prisma.systemCalendarObservance.findMany({
      where: { isActive: true },
      orderBy: { startAt: 'asc' },
    });
    const systemEvents = systemObservances.map((event) => ({
      ...event,
      entityType: 'official_observance',
      entityId: event.isHoliday ? 'holiday' : 'observance',
      isHoliday: event.isHoliday,
      attendees: [],
      createdById: null,
    }));

    return entityType === 'official_observance' ? systemEvents : [...events, ...systemEvents].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime(),
    );
  }

  async findSystemObservances() {
    return this.prisma.systemCalendarObservance.findMany({
      where: { isActive: true },
      orderBy: { startAt: 'asc' },
    });
  }

  async createSystemObservance(data: SystemObservanceInput) {
    validateEventRange(data.startAt, data.endAt);
    const { attendees: _attendees, sourceKey, isHoliday, ...eventData } = data;
    return this.prisma.systemCalendarObservance.create({
      data: {
        sourceKey: sourceKey ?? `manual-${Date.now()}`,
        title: eventData.title,
        description: eventData.description,
        startAt: new Date(eventData.startAt),
        endAt: new Date(eventData.endAt),
        allDay: eventData.allDay ?? true,
        recurrenceType: eventData.recurrenceType ?? 'yearly',
        recurrenceRule: eventData.recurrenceRule,
        recurrenceCal: eventData.recurrenceCal ?? RECURRENCE_CALENDAR.JALALI,
        isHoliday: isHoliday ?? eventData.entityId === 'holiday',
        isActive: true,
        source: 'manual',
      },
    });
  }

  async updateSystemObservance(id: string, data: Partial<SystemObservanceInput>) {
    const {
      attendees: _attendees,
      sourceKey: _sourceKey,
      isHoliday,
      entityType: _entityType,
      entityId: _entityId,
      startAt,
      endAt,
      ...rest
    } = data;
    return this.prisma.systemCalendarObservance.update({
      where: { id },
      data: {
        ...rest,
        ...(isHoliday === undefined ? {} : { isHoliday }),
        ...(startAt ? { startAt: new Date(startAt) } : {}),
        ...(endAt ? { endAt: new Date(endAt) } : {}),
        isActive: true,
        source: 'manual-override',
      },
    });
  }

  async removeSystemObservance(id: string) {
    return this.prisma.systemCalendarObservance.update({
      where: { id },
      data: { isActive: false, source: 'manual-override' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, tenantId },
      include: { attendees: true },
    });
    if (!event) throw new NotFoundException('رویداد یافت نشد');
    return event;
  }

  async create(tenantId: string, createdById: string, data: CalendarEventInput) {
    validateEventRange(data.startAt, data.endAt);
    const { attendees, ...eventData } = data;
    return this.prisma.calendarEvent.create({
      data: {
        tenantId,
        createdById,
        title: eventData.title,
        description: eventData.description,
        startAt: new Date(eventData.startAt),
        endAt: new Date(eventData.endAt),
        allDay: eventData.allDay ?? false,
        location: eventData.location,
        recurrenceType: eventData.recurrenceType ?? 'none',
        recurrenceRule: eventData.recurrenceRule,
        recurrenceCal: eventData.recurrenceCal ?? RECURRENCE_CALENDAR.JALALI,
        color: eventData.color,
        entityType: eventData.entityType,
        entityId: eventData.entityId,
        attendees: attendees?.length
          ? { create: attendees.map((a) => ({ userId: a.userId, email: a.email, name: a.name })) }
          : undefined,
      },
      include: { attendees: true },
    });
  }

  async update(tenantId: string, id: string, data: Partial<CalendarEventInput>) {
    const existing = await this.findOne(tenantId, id);
    validateEventRange(data.startAt ?? existing.startAt, data.endAt ?? existing.endAt);
    const { attendees, startAt, endAt, ...rest } = data;

    const updated = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...rest,
        ...(startAt ? { startAt: new Date(startAt) } : {}),
        ...(endAt ? { endAt: new Date(endAt) } : {}),
      },
      include: { attendees: true },
    });

    if (attendees) {
      await this.prisma.calendarEventAttendee.deleteMany({ where: { eventId: id } });
      await this.prisma.calendarEventAttendee.createMany({
        data: attendees.map((a) => ({
          eventId: id,
          userId: a.userId,
          email: a.email,
          name: a.name,
        })),
      });
      return this.findOne(tenantId, id);
    }

    return updated;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.calendarEvent.delete({ where: { id } });
  }

  async updateAttendeeStatus(tenantId: string, eventId: string, attendeeId: string, status: string) {
    const attendee = await this.prisma.calendarEventAttendee.findFirst({
      where: { id: attendeeId, eventId, event: { tenantId } },
      select: { id: true },
    });
    if (!attendee) throw new NotFoundException('شرکت‌کننده رویداد یافت نشد');
    return this.prisma.calendarEventAttendee.update({
      where: { id: attendeeId },
      data: { status },
    });
  }
}
