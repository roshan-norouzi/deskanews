'use client';

import { useApi } from '@/hooks/use-api';
import { extractListItems } from '@/lib/list-utils';
import { formatEmployeeLabel } from '@deska/shared';

interface Employee {
  id: string;
  employeeCode: string;
  jobTitle?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
  contact?: { name?: string | null; email?: string | null } | null;
}

interface EmployeeSelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function EmployeeSelectField({
  label,
  value,
  onChange,
  required,
}: EmployeeSelectFieldProps) {
  const { data, isLoading } = useApi<unknown>('/employees?status=active');
  const employees = extractListItems<Employee>(data);

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={isLoading}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
      >
        <option value="">{isLoading ? 'بارگذاری...' : 'انتخاب کارمند'}</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {formatEmployeeLabel(emp)}
          </option>
        ))}
      </select>
    </div>
  );
}
