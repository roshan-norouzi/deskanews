'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { JalaliDateInput } from '@/components/ui/jalali-date-input';
import { cn } from '@/lib/utils';
import { getFieldPlaceholder } from '@/lib/field-guidance';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, type, placeholder, required, name, ...props }, ref) => {
    const resolvedPlaceholder = placeholder ?? getFieldPlaceholder(label, type, name);
    if (type === 'date') {
      return (
        <JalaliDateInput
          ref={ref}
          id={id}
          label={label}
          error={error}
          className={className}
          name={name}
          value={typeof props.value === 'string' ? props.value : ''}
          onChange={props.onChange}
          onBlur={props.onBlur}
          disabled={props.disabled}
          required={required}
          placeholder={resolvedPlaceholder}
        />
      );
    }

    const inputId = id ?? label?.replace(/\s/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
            {label}
            {required && <span className="mr-1 text-red-500" aria-hidden="true">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          name={name}
          placeholder={resolvedPlaceholder}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:shadow-none',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className,
          )}
          {...props}
        />
        {error && <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
