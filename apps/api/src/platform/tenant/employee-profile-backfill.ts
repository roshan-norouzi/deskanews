import type { Department, Employee, Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { normalizeEmployeeProfile, splitPersianFullName } from '@deska/shared';
import { DEMO_EMPLOYEE_PROFILES } from './demo-employee-profiles';

type EmployeeWithDepartment = Employee & { department?: Department | null };

export function serializeEmployeeForApi(employee: EmployeeWithDepartment) {
  return {
    id: employee.id,
    tenantId: employee.tenantId,
    userId: employee.userId,
    contactId: employee.contactId,
    employeeCode: employee.employeeCode,
    departmentId: employee.departmentId,
    jobTitle: employee.jobTitle,
    hireDate: employee.hireDate?.toISOString() ?? null,
    status: employee.status,
    firstName: employee.firstName,
    lastName: employee.lastName,
    nationalId: employee.nationalId,
    fatherName: employee.fatherName,
    motherName: employee.motherName,
    birthCertificateNumber: employee.birthCertificateNumber,
    birthCertificateDate: employee.birthCertificateDate?.toISOString() ?? null,
    birthDate: employee.birthDate?.toISOString() ?? null,
    maritalStatus: employee.maritalStatus,
    address: employee.address,
    postalCode: employee.postalCode,
    mobilePhone: employee.mobilePhone,
    landlinePhone: employee.landlinePhone,
    bankAccountNumber: employee.bankAccountNumber,
    bankCardNumber: employee.bankCardNumber,
    iban: employee.iban,
    bankName: employee.bankName,
    insuranceNumber: employee.insuranceNumber,
    department: employee.department
      ? { id: employee.department.id, name: employee.department.name }
      : null,
  };
}

function isProfileIncomplete(employee: Employee): boolean {
  return !employee.firstName || !employee.lastName || !employee.nationalId;
}

export async function backfillEmployeeProfile(
  prisma: PrismaClient,
  employee: Employee,
  user: { name: string; email: string },
  options?: { applyDemoProfile?: boolean },
) {
  const update: Prisma.EmployeeUpdateInput = {};
  const demo = options?.applyDemoProfile
    ? DEMO_EMPLOYEE_PROFILES[user.email.toLowerCase()]
    : undefined;

  if (!employee.firstName || !employee.lastName) {
    const fromDemo = demo
      ? { firstName: demo.firstName, lastName: demo.lastName }
      : splitPersianFullName(user.name);
    if (!employee.firstName && fromDemo.firstName) update.firstName = fromDemo.firstName;
    if (!employee.lastName && fromDemo.lastName) update.lastName = fromDemo.lastName;
  }

  if (demo) {
    const normalized = normalizeEmployeeProfile(demo);
    const assignIfMissing = (
      key: keyof Prisma.EmployeeUpdateInput,
      value: string | Date | null | undefined,
    ) => {
      if (value === undefined || value === null || value === '') return;
      const current = employee[key as keyof Employee];
      if (current != null && current !== '') return;
      update[key] = value as never;
    };

    assignIfMissing('nationalId', normalized.nationalId);
    assignIfMissing('fatherName', normalized.fatherName);
    assignIfMissing('motherName', normalized.motherName);
    assignIfMissing('birthCertificateNumber', normalized.birthCertificateNumber);
    assignIfMissing(
      'birthCertificateDate',
      normalized.birthCertificateDate ? new Date(normalized.birthCertificateDate) : undefined,
    );
    assignIfMissing('birthDate', normalized.birthDate ? new Date(normalized.birthDate) : undefined);
    assignIfMissing('maritalStatus', normalized.maritalStatus);
    assignIfMissing('address', normalized.address);
    assignIfMissing('postalCode', normalized.postalCode);
    assignIfMissing('mobilePhone', normalized.mobilePhone);
    assignIfMissing('landlinePhone', normalized.landlinePhone);
    assignIfMissing('bankAccountNumber', normalized.bankAccountNumber);
    assignIfMissing('bankCardNumber', normalized.bankCardNumber);
    assignIfMissing('iban', normalized.iban);
    assignIfMissing('bankName', normalized.bankName);
    assignIfMissing('insuranceNumber', normalized.insuranceNumber);

    if (!employee.jobTitle && demo.jobTitle) update.jobTitle = demo.jobTitle;
    if (demo.employeeCode && employee.employeeCode.startsWith('EMP-')) {
      update.employeeCode = demo.employeeCode;
    }
  }

  if (Object.keys(update).length === 0) return employee;

  const updated = await prisma.employee.update({
    where: { id: employee.id },
    data: update,
    include: { department: true },
  });

  return updated;
}

export async function backfillTenantEmployeeProfiles(
  prisma: PrismaClient,
  tenantId: string,
  options?: { applyDemoProfile?: boolean },
) {
  const employees = await prisma.employee.findMany({
    where: { tenantId, userId: { not: null } },
    include: { user: true, department: true },
  });

  for (const employee of employees) {
    if (!employee.user) continue;
    if (!isProfileIncomplete(employee) && !options?.applyDemoProfile) continue;
    await backfillEmployeeProfile(prisma, employee, employee.user, options);
  }
}
