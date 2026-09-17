import { Contact, PrismaClient } from '@prisma/client';
import {
  CONTACT_CALENDAR_EVENT_COLORS,
  CONTACT_CALENDAR_EVENT_TYPES,
  getContactBirthCalendarLabel,
  RECURRENCE_CALENDAR,
  RECURRENCE_TYPE,
} from '@deska/shared';

type ContactDateField = 'birthDate' | 'marriageDate';

interface ContactDateSpec {
  field: ContactDateField;
  entityType: string;
  label?: string;
  skipForCompany?: boolean;
}

const CONTACT_DATE_SPECS: ContactDateSpec[] = [
  { field: 'birthDate', entityType: CONTACT_CALENDAR_EVENT_TYPES.BIRTH },
  { field: 'marriageDate', entityType: CONTACT_CALENDAR_EVENT_TYPES.MARRIAGE, skipForCompany: true },
];

const CONTACT_EVENT_ENTITY_TYPES = CONTACT_DATE_SPECS.map((spec) => spec.entityType);

type ContactCalendarInput = Pick<Contact, 'id' | 'name' | 'type'> &
  Partial<Pick<Contact, ContactDateField>>;

function toAllDayRange(date: Date): { startAt: Date; endAt: Date } {
  const startAt = new Date(date);
  startAt.setUTCHours(0, 0, 0, 0);
  const endAt = new Date(date);
  endAt.setUTCHours(23, 59, 59, 999);
  return { startAt, endAt };
}

function buildEventTitle(spec: ContactDateSpec, contact: ContactCalendarInput): string {
  if (spec.field === 'birthDate') {
    return `${getContactBirthCalendarLabel(contact.type)} ${contact.name}`;
  }

  if (spec.field === 'marriageDate') {
    return `سالگرد ازدواج ${contact.name}`;
  }

  return '';
}

async function upsertContactDateEvent(
  prisma: PrismaClient,
  tenantId: string,
  contact: ContactCalendarInput,
  spec: ContactDateSpec,
) {
  const existing = await prisma.calendarEvent.findFirst({
    where: {
      tenantId,
      entityType: spec.entityType,
      entityId: contact.id,
    },
  });

  if (contact.type === 'company' && spec.skipForCompany) {
    if (existing) {
      await prisma.calendarEvent.delete({ where: { id: existing.id } });
    }
    return;
  }

  const dateValue = contact[spec.field];
  if (!dateValue) {
    if (existing) {
      await prisma.calendarEvent.delete({ where: { id: existing.id } });
    }
    return;
  }

  const { startAt, endAt } = toAllDayRange(dateValue);
  const payload = {
    title: buildEventTitle(spec, contact),
    startAt,
    endAt,
    allDay: true,
    recurrenceType: RECURRENCE_TYPE.YEARLY,
    recurrenceCal: RECURRENCE_CALENDAR.JALALI,
    color: CONTACT_CALENDAR_EVENT_COLORS[spec.entityType],
    entityType: spec.entityType,
    entityId: contact.id,
  };

  if (existing) {
    await prisma.calendarEvent.update({
      where: { id: existing.id },
      data: payload,
    });
    return;
  }

  await prisma.calendarEvent.create({
    data: {
      tenantId,
      ...payload,
    },
  });
}

export async function syncContactCalendarEvents(
  prisma: PrismaClient,
  tenantId: string,
  contact: ContactCalendarInput,
) {
  await Promise.all(
    CONTACT_DATE_SPECS.map((spec) => upsertContactDateEvent(prisma, tenantId, contact, spec)),
  );
}

export async function removeContactCalendarEvents(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string,
) {
  await prisma.calendarEvent.deleteMany({
    where: {
      tenantId,
      entityId: contactId,
      entityType: { in: CONTACT_EVENT_ENTITY_TYPES },
    },
  });
}

export async function syncAllContactCalendarEvents(prisma: PrismaClient, tenantId: string) {
  await prisma.calendarEvent.deleteMany({ where: { tenantId, entityType: CONTACT_CALENDAR_EVENT_TYPES.MEMBERSHIP } });
  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      type: true,
      birthDate: true,
      marriageDate: true,
    },
  });

  for (const contact of contacts) {
    await syncContactCalendarEvents(prisma, tenantId, contact);
  }
}
