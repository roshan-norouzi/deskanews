'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'
import { formatGroupedDigits, normalizeDigits } from '@deska/shared'
import { Input, type InputProps } from '@/components/ui/input'

export interface DigitsInputProps extends Omit<InputProps, 'type' | 'onChange' | 'value'> {
  value: string
  onValueChange: (digits: string) => void
  maxDigits?: number
}

export const DigitsInput = forwardRef<HTMLInputElement, DigitsInputProps>(
  ({ value, onValueChange, maxDigits, onKeyDown, dir = 'ltr', className, ...props }, ref) => {
    function handleChange(raw: string) {
      let digits = normalizeDigits(raw)
      if (maxDigits != null) digits = digits.slice(0, maxDigits)
      onValueChange(digits)
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir={dir}
        className={className ?? 'text-left'}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key.length === 1 && !/[\d۰-۹٠-٩]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
          }
          onKeyDown?.(e)
        }}
        onPaste={(e) => {
          e.preventDefault()
          handleChange(e.clipboardData.getData('text'))
        }}
      />
    )
  },
)

DigitsInput.displayName = 'DigitsInput'

export function formatCardDigits(value: string): string {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  return digits.match(/.{1,4}/g)?.join(' ') ?? digits;
}

export interface CardDigitsInputProps extends Omit<InputProps, 'type' | 'onChange' | 'value'> {
  value: string
  onValueChange: (digits: string) => void
  maxDigits?: number
}

export const CardDigitsInput = forwardRef<HTMLInputElement, CardDigitsInputProps>(
  ({ value, onValueChange, maxDigits = 16, onKeyDown, dir = 'ltr', className, ...props }, ref) => {
    const display = formatCardDigits(value)

    function handleChange(raw: string) {
      let digits = normalizeDigits(raw)
      if (maxDigits != null) digits = digits.slice(0, maxDigits)
      onValueChange(digits)
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir={dir}
        className={className}
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key.length === 1 && !/[\d۰-۹٠-٩\s]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
          }
          onKeyDown?.(e)
        }}
        onPaste={(e) => {
          e.preventDefault()
          handleChange(e.clipboardData.getData('text'))
        }}
      />
    )
  },
)

CardDigitsInput.displayName = 'CardDigitsInput'

export interface CurrencyInputProps extends Omit<InputProps, 'type' | 'onChange' | 'value'> {
  value: string
  onValueChange: (digits: string) => void
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, dir = 'ltr', className, ...props }, ref) => {
    const display = formatGroupedDigits(value)

    function handleChange(raw: string) {
      onValueChange(normalizeDigits(raw))
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        dir={dir}
        className={className}
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key.length === 1 && !/[\d۰-۹٠-٩,]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
          }
        }}
        onPaste={(e) => {
          e.preventDefault()
          handleChange(e.clipboardData.getData('text'))
        }}
      />
    )
  },
)

CurrencyInput.displayName = 'CurrencyInput'

export function formatIbanInput(raw: string): string {
  let cleaned = raw
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!cleaned.startsWith('IR')) {
    cleaned = `IR${cleaned.replace(/^I?R?/, '').replace(/\D/g, '')}`
  } else {
    cleaned = `IR${cleaned.slice(2).replace(/\D/g, '')}`
  }
  return cleaned.slice(0, 26)
}

export interface IbanInputProps extends Omit<InputProps, 'type' | 'onChange' | 'value'> {
  value: string
  onValueChange: (iban: string) => void
}

export const IbanInput = forwardRef<HTMLInputElement, IbanInputProps>(
  ({ value, onValueChange, ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      type="text"
      dir="ltr"
      className="text-left font-mono tracking-wide"
      value={value}
      maxLength={26}
      onChange={(e) => onValueChange(formatIbanInput(e.target.value))}
      onKeyDown={(e) => {
        if (e.key.length === 1 && !/[a-zA-Z0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
        }
      }}
    />
  ),
)

IbanInput.displayName = 'IbanInput'

export function blockNonPersianNameKey(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key.length === 1 && !/[\u0600-\u06FF\s\u200c]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
  }
}

export function digitsOnlyProps(maxDigits?: number): Partial<InputHTMLAttributes<HTMLInputElement>> {
  return {
    inputMode: 'numeric',
    autoComplete: 'off',
    maxLength: maxDigits,
  }
}
