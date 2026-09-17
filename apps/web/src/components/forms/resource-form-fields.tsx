'use client';

import { Input } from '@/components/ui/input';
import type { FormField } from '@/components/pages/resource-list-page';
import { ContactSelectField } from './contact-select-field';
import { DepartmentSelectField } from './department-select-field';
import { EmployeeSelectField } from './employee-select-field';
import { MemberMultiField } from './member-multi-field';
import { RecurringDateField } from './recurring-date-field';
import { getFieldPlaceholder } from '@/lib/field-guidance';
import { normalizeDigits } from '@deska/shared';

interface ResourceFormFieldsProps {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

const NUMERIC_FIELD_NAMES = new Set([
  'phone', 'mobile', 'nationalId', 'postalCode',
  'economicCode', 'registrationNumber',
]);

function inputProps(field: FormField) {
  const numeric = field.type === 'number' || NUMERIC_FIELD_NAMES.has(field.name);
  if (!numeric) return {};
  return {
    type: 'tel' as const,
    inputMode: 'numeric' as const,
    pattern: '[0-9۰-۹]*',
    maxLength: field.name === 'postalCode' ? 10 : undefined,
  };
}

export function ResourceFormFields({ fields, values, onChange }: ResourceFormFieldsProps) {
  return (
    <>
      {fields.map((field) => {
        if (field.type === 'contact') {
          return (
            <ContactSelectField
              key={field.name}
              label={field.label}
              value={values[field.name] ?? ''}
              onChange={(v) => onChange(field.name, v)}
              required={field.required}
              companyOnly={field.contactCompanyOnly}
            />
          );
        }

        if (field.type === 'employee') {
          return (
            <EmployeeSelectField
              key={field.name}
              label={field.label}
              value={values[field.name] ?? ''}
              onChange={(v) => onChange(field.name, v)}
              required={field.required}
            />
          );
        }

        if (field.type === 'department') {
          return (
            <DepartmentSelectField
              key={field.name}
              label={field.label}
              value={values[field.name] ?? ''}
              onChange={(v) => onChange(field.name, v)}
              required={field.required}
            />
          );
        }

        if (field.type === 'member-multi') {
          return (
            <MemberMultiField
              key={field.name}
              label={field.label}
              value={values[field.name] ?? ''}
              onChange={(v) => onChange(field.name, v)}
              required={field.required}
            />
          );
        }

        if (field.type === 'calendar-date') {
          return (
            <RecurringDateField
              key={field.name}
              label={field.label}
              value={values[field.name] ?? ''}
              calendar={values.calendarType ?? 'jalali'}
              onChange={(value) => onChange(field.name, value)}
              required={field.required}
            />
          );
        }

        if (field.type === 'textarea') {
          return (
            <div key={field.name}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {field.label}{field.required && <span className="mr-1 text-red-500">*</span>}
              </label>
              <textarea
                value={values[field.name] ?? ''}
                onChange={(e) => onChange(field.name, e.target.value)}
                placeholder={field.placeholder ?? getFieldPlaceholder(field.label, 'textarea', field.name)}
                required={field.required}
                rows={3}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm hover:border-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
          );
        }

        if (field.type === 'checkbox') {
          return (
            <label key={field.name} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(values[field.name] ?? '') === 'true'}
                onChange={(e) => onChange(field.name, e.target.checked ? 'true' : 'false')}
                className="rounded border-slate-300"
              />
              <span className="font-medium text-slate-700">
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </span>
            </label>
          );
        }

        if (field.type === 'select') {
          return (
            <div key={field.name}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {field.label}{field.required && <span className="mr-1 text-red-500">*</span>}
              </label>
              <select
                value={values[field.name] ?? ''}
                onChange={(e) => onChange(field.name, e.target.value)}
                required={field.required}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm hover:border-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">انتخاب کنید</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        return (
          <Input
            key={field.name}
            label={field.label}
            {...inputProps(field)}
            type={inputProps(field).type ?? field.type ?? 'text'}
            placeholder={field.placeholder ?? getFieldPlaceholder(field.label, field.type, field.name)}
            required={field.required}
            value={values[field.name] ?? ''}
            onChange={(e) => {
              const props = inputProps(field);
              const value = props.pattern ? normalizeDigits(e.target.value) : e.target.value;
              onChange(field.name, props.maxLength ? value.slice(0, props.maxLength) : value);
            }}
          />
        );
      })}
    </>
  );
}
