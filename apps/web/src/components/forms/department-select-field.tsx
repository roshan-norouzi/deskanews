'use client';

import { useApi } from '@/hooks/use-api';
import { extractListItems } from '@/lib/list-utils';

interface Department {
  id: string;
  name: string;
}

interface DepartmentSelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function DepartmentSelectField({
  label,
  value,
  onChange,
  required,
}: DepartmentSelectFieldProps) {
  const { data, isLoading } = useApi<unknown>('/employees/departments');
  const departments = extractListItems<Department>(data);

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
        <option value="">{isLoading ? 'بارگذاری...' : 'انتخاب دپارتمان'}</option>
        {departments.map((dept) => (
          <option key={dept.id} value={dept.id}>
            {dept.name}
          </option>
        ))}
      </select>
    </div>
  );
}
