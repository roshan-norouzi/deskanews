import { Employee, PrismaClient } from '@prisma/client';
import { RECURRENCE_CALENDAR, RECURRENCE_TYPE } from '@deska/shared';

type EmployeeDateField = 'hireDate' | 'birthDate' | 'birthCertificateDate';

interface EmployeeDateSpec {
  field: EmployeeDateField;
  entityType: string;
  title: (employee: Employee) => string;
}

const EMPLOYEE_DATE_SPECS: EmployeeDateSpec[] = [
  { field: 'hireDate', entityType: 'employee_hire_date', title: (e) => `سالگرد استخدام ${employeeName(e)}` },
  { field: 'birthDate', entityType: 'employee_birth_date', title: (e) => `تولد ${employeeName(e)}` },
  { field: 'birthCertificateDate', entityType: 'employee_birth_certificate_date', title: (e) => `تاریخ شناسنامه ${employeeName(e)}` },
];

const EMPLOYEE_EVENT_TYPES = EMPLOYEE_DATE_SPECS.map((spec) => spec.entityType);

function employeeName(employee: Employee) {
  const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim();
  return name || `کارمند ${employee.employeeCode}`;
}

function toAllDayRange(date: Date) {
  const startAt = new Date(date);
  startAt.setUTCHours(0, 0, 0, 0);
  const endAt = new Date(date);
  endAt.setUTCHours(23, 59, 59, 999);
  return { startAt, endAt };
}

async function upsertEmployeeDateEvent(prisma: PrismaClient, tenantId: string, employee: Employee, spec: EmployeeDateSpec) {
  const existing = await prisma.calendarEvent.findFirst({ where: { tenantId, entityType: spec.entityType, entityId: employee.id } });
  const dateValue = employee[spec.field];
  if (!dateValue) {
    if (existing) await prisma.calendarEvent.delete({ where: { id: existing.id } });
    return;
  }
  const { startAt, endAt } = toAllDayRange(dateValue);
  const payload = {
    title: spec.title(employee), startAt, endAt, allDay: true,
    recurrenceType: RECURRENCE_TYPE.YEARLY, recurrenceCal: RECURRENCE_CALENDAR.JALALI,
    color: '#7c3aed', entityType: spec.entityType, entityId: employee.id,
  };
  if (existing) await prisma.calendarEvent.update({ where: { id: existing.id }, data: payload });
  else await prisma.calendarEvent.create({ data: { tenantId, ...payload } });
}

export async function syncAllEmployeeCalendarEvents(prisma: PrismaClient, tenantId: string) {
  const employees = await prisma.employee.findMany({ where: { tenantId } });
  for (const employee of employees) {
    await Promise.all(EMPLOYEE_DATE_SPECS.map((spec) => upsertEmployeeDateEvent(prisma, tenantId, employee, spec)));
  }
  const employeeIds = employees.map((employee) => employee.id);
  await prisma.calendarEvent.deleteMany({
    where: { tenantId, entityType: { in: EMPLOYEE_EVENT_TYPES }, ...(employeeIds.length ? { entityId: { notIn: employeeIds } } : {}) },
  });
}
