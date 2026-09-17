'use client';

import { useApi } from '@/hooks/use-api';
import { extractListItems } from '@/lib/list-utils';

interface Contact {
  id: string;
  name: string;
  type?: string;
}

interface ContactSelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  companyOnly?: boolean;
}

export function ContactSelectField({
  label,
  value,
  onChange,
  required,
  companyOnly,
}: ContactSelectFieldProps) {
  const { data, isLoading } = useApi<unknown>('/contacts?take=200');
  const contacts = extractListItems<Contact>(data).filter(
    (c) => !companyOnly || c.type === 'company',
  );

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
        <option value="">{isLoading ? 'بارگذاری...' : 'انتخاب مخاطب'}</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
