import { formatEmployeeFullName } from './employee-profile';

export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  inactive: 'غیرفعال',
  terminated: 'قطع همکاری',
};

export interface EmployeeDisplaySource {
  employeeCode?: string | null;
  jobTitle?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
  contact?: { name?: string | null; email?: string | null } | null;
}

export function formatEmployeeLabel(employee: EmployeeDisplaySource | null | undefined): string {
  if (!employee) return '—';
  const profileName = formatEmployeeFullName({ firstName: employee.firstName, lastName: employee.lastName });
  if (profileName) return profileName;
  const name = employee.user?.name?.trim() || employee.contact?.name?.trim() || employee.user?.email?.trim() || employee.contact?.email?.trim();
  if (name && employee.employeeCode) return `${name} (${employee.employeeCode})`;
  if (name) return name;
  if (employee.employeeCode) return employee.employeeCode;
  if (employee.jobTitle) return employee.jobTitle;
  return '—';
}
