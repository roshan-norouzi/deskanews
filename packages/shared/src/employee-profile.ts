/** Employee identity profile — shared validation (client + server) */

export const MARITAL_STATUS = {
  MARRIED: 'married',
  SINGLE: 'single',
} as const;

export type MaritalStatus = (typeof MARITAL_STATUS)[keyof typeof MARITAL_STATUS];

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  married: 'متاهل',
  single: 'مجرد',
};

export interface EmployeeProfileInput {
  firstName?: string;
  lastName?: string;
  nationalId?: string;
  fatherName?: string;
  motherName?: string;
  birthCertificateNumber?: string;
  birthCertificateDate?: string;
  birthDate?: string;
  maritalStatus?: string;
  address?: string;
  postalCode?: string;
  mobilePhone?: string;
  landlinePhone?: string;
  bankAccountNumber?: string;
  bankCardNumber?: string;
  iban?: string;
  bankName?: string;
  insuranceNumber?: string;
}

export type EmployeeProfileField = keyof EmployeeProfileInput;

const PERSIAN_NAME = /^[\u0600-\u06FF\u0750-\u077F\s\u200c]{2,60}$/u;
const DIGITS = /^\d+$/;

const REQUIRED_PROFILE_FIELDS: EmployeeProfileField[] = [
  'firstName',
  'lastName',
  'nationalId',
  'fatherName',
  'motherName',
  'birthCertificateNumber',
  'birthCertificateDate',
  'birthDate',
  'maritalStatus',
  'address',
  'postalCode',
  'mobilePhone',
  'bankAccountNumber',
  'bankCardNumber',
  'iban',
  'bankName',
  'insuranceNumber',
];

const OPTIONAL_PROFILE_FIELDS: EmployeeProfileField[] = ['landlinePhone'];

export function normalizeDigits(value: string): string {
  return value
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '');
}

/** Display digits with Western thousand separators. */
export function formatGroupedDigits(value: string | number): string {
  const digits = normalizeDigits(String(value));
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function parseGroupedDigits(value: string): string {
  return normalizeDigits(value);
}

export function normalizeIban(value: string): string {
  const compact = value.replace(/\s/g, '').toUpperCase();
  const withoutPrefix = compact.replace(/^I?R?/, '');
  return `IR${normalizeDigits(withoutPrefix)}`.slice(0, 26);
}

export function validatePersianName(value: string): boolean {
  return PERSIAN_NAME.test(value.trim());
}

export function validateIranNationalId(value: string): boolean {
  const code = normalizeDigits(value);
  if (!/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;

  const check = Number(code[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(code[i]) * (10 - i);
  }
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

export function validateIranPostalCode(value: string): boolean {
  const code = normalizeDigits(value);
  if (!/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;
  return true;
}

export function validateIranMobile(value: string): boolean {
  const digits = normalizeDigits(value);
  return /^09\d{9}$/.test(digits);
}

export function validateIranLandline(value: string): boolean {
  const digits = normalizeDigits(value);
  if (!digits) return true;
  return /^0\d{10}$/.test(digits);
}

export function validateBankCardNumber(value: string): boolean {
  const digits = normalizeDigits(value);
  if (!/^\d{16}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let digit = Number(digits[15 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function validateIranIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^IR\d{24}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = '';
  for (const ch of rearranged) {
    const chunk = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    remainder += chunk;
    if (remainder.length > 7) {
      remainder = String(Number(remainder) % 97);
    }
  }
  return Number(remainder) % 97 === 1;
}

export function validateBankAccountNumber(value: string): boolean {
  const digits = normalizeDigits(value);
  return digits.length >= 6 && digits.length <= 20 && DIGITS.test(digits);
}

export function validateInsuranceNumber(value: string): boolean {
  const digits = normalizeDigits(value);
  return digits.length >= 8 && digits.length <= 16 && DIGITS.test(digits);
}

export function validateBirthCertificateNumber(value: string): boolean {
  const trimmed = value.trim();
  return /^[\d\u0600-\u06FF/-]{1,20}$/u.test(trimmed);
}

export function validateDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const [year, month, day] = value.split('-').map(Number);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function validateMaritalStatus(value: string): boolean {
  return value === MARITAL_STATUS.MARRIED || value === MARITAL_STATUS.SINGLE;
}

export function validateAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 10 && trimmed.length <= 500;
}

export function validateBankName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 80;
}

export function formatEmployeeFullName(profile: {
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const full = [profile.firstName?.trim(), profile.lastName?.trim()].filter(Boolean).join(' ');
  return full || null;
}

/** Split a display name into first + last (Persian-friendly). */
export function splitPersianFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

const FIELD_LABELS: Record<EmployeeProfileField, string> = {
  firstName: 'نام',
  lastName: 'نام خانوادگی',
  nationalId: 'کد ملی',
  fatherName: 'نام پدر',
  motherName: 'نام مادر',
  birthCertificateNumber: 'شماره شناسنامه',
  birthCertificateDate: 'تاریخ تولد شناسنامه',
  birthDate: 'تاریخ تولد واقعی',
  maritalStatus: 'وضعیت تأهل',
  address: 'آدرس',
  postalCode: 'کد پستی',
  mobilePhone: 'تلفن همراه',
  landlinePhone: 'تلفن ثابت',
  bankAccountNumber: 'شماره سپرده',
  bankCardNumber: 'شماره کارت',
  iban: 'شماره شبا',
  bankName: 'بانک',
  insuranceNumber: 'شماره بیمه',
};

function validateField(
  field: EmployeeProfileField,
  rawValue: string | undefined,
  requireAll: boolean,
): string | null {
  const value = rawValue?.trim() ?? '';

  if (!value) {
    if (!requireAll || OPTIONAL_PROFILE_FIELDS.includes(field)) return null;
    return `${FIELD_LABELS[field]} الزامی است`;
  }

  switch (field) {
    case 'firstName':
    case 'lastName':
    case 'fatherName':
    case 'motherName':
      if (!validatePersianName(value)) return `${FIELD_LABELS[field]} معتبر نیست`;
      break;
    case 'nationalId': {
      const digits = normalizeDigits(value);
      if (digits.length !== 10) return 'کد ملی باید دقیقاً ۱۰ رقم باشد';
      if (!validateIranNationalId(value)) return 'کد ملی معتبر نیست';
      break;
    }
    case 'birthCertificateNumber':
      if (!validateBirthCertificateNumber(value)) return 'شماره شناسنامه معتبر نیست';
      break;
    case 'birthCertificateDate':
    case 'birthDate':
      if (!validateDateString(value)) return `${FIELD_LABELS[field]} معتبر نیست`;
      break;
    case 'maritalStatus':
      if (!validateMaritalStatus(value)) return 'وضعیت تأهل معتبر نیست';
      break;
    case 'address':
      if (!validateAddress(value)) return 'آدرس باید حداقل ۱۰ کاراکتر باشد';
      break;
    case 'postalCode': {
      const digits = normalizeDigits(value);
      if (digits.length !== 10) return 'کد پستی باید دقیقاً ۱۰ رقم باشد';
      if (!validateIranPostalCode(value)) return 'کد پستی معتبر نیست';
      break;
    }
    case 'mobilePhone': {
      const digits = normalizeDigits(value);
      if (digits.length !== 11) return 'تلفن همراه باید ۱۱ رقم باشد';
      if (!validateIranMobile(value)) return 'تلفن همراه باید با 09 شروع شود';
      break;
    }
    case 'landlinePhone': {
      const digits = normalizeDigits(value);
      if (digits.length > 0 && digits.length !== 11) return 'تلفن ثابت باید ۱۱ رقم باشد';
      if (!validateIranLandline(value)) return 'تلفن ثابت معتبر نیست';
      break;
    }
    case 'bankAccountNumber': {
      const digits = normalizeDigits(value);
      if (digits.length < 6 || digits.length > 20) return 'شماره سپرده باید ۶ تا ۲۰ رقم باشد';
      if (!validateBankAccountNumber(value)) return 'شماره سپرده معتبر نیست';
      break;
    }
    case 'bankCardNumber': {
      const digits = normalizeDigits(value);
      if (digits.length !== 16) return 'شماره کارت باید دقیقاً ۱۶ رقم باشد';
      if (!validateBankCardNumber(value)) return 'شماره کارت بانکی معتبر نیست';
      break;
    }
    case 'iban': {
      const iban = normalizeIban(value);
      if (iban.length !== 26) return 'شماره شبا باید ۲۶ کاراکتر باشد (IR + ۲۴ رقم)';
      if (!validateIranIban(iban)) return 'شماره شبا معتبر نیست';
      break;
    }
    case 'bankName':
      if (!validateBankName(value)) return 'نام بانک معتبر نیست';
      break;
    case 'insuranceNumber': {
      const digits = normalizeDigits(value);
      if (digits.length < 8 || digits.length > 16) return 'شماره بیمه باید ۸ تا ۱۶ رقم باشد';
      if (!validateInsuranceNumber(value)) return 'شماره بیمه معتبر نیست';
      break;
    }
    default:
      break;
  }

  return null;
}

export interface EmployeeProfileValidationResult {
  valid: boolean;
  errors: Partial<Record<EmployeeProfileField, string>>;
}

export function validateEmployeeProfile(
  input: EmployeeProfileInput,
  options?: { requireAll?: boolean },
): EmployeeProfileValidationResult {
  const requireAll = options?.requireAll ?? true;
  const fieldsToCheck = requireAll
    ? [...REQUIRED_PROFILE_FIELDS, ...OPTIONAL_PROFILE_FIELDS]
    : ([...REQUIRED_PROFILE_FIELDS, ...OPTIONAL_PROFILE_FIELDS] as EmployeeProfileField[]);

  const errors: Partial<Record<EmployeeProfileField, string>> = {};

  for (const field of fieldsToCheck) {
    const message = validateField(field, input[field], requireAll);
    if (message) errors[field] = message;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function pickProvidedProfileFields(input: EmployeeProfileInput): EmployeeProfileInput {
  const result: EmployeeProfileInput = {};
  const allFields = [...REQUIRED_PROFILE_FIELDS, ...OPTIONAL_PROFILE_FIELDS] as EmployeeProfileField[];

  for (const field of allFields) {
    const raw = input[field];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;
    result[field] = raw;
  }

  return result;
}

export function normalizeEmployeeProfile(input: EmployeeProfileInput): EmployeeProfileInput {
  return {
    firstName: input.firstName?.trim(),
    lastName: input.lastName?.trim(),
    nationalId: input.nationalId ? normalizeDigits(input.nationalId) : undefined,
    fatherName: input.fatherName?.trim(),
    motherName: input.motherName?.trim(),
    birthCertificateNumber: input.birthCertificateNumber?.trim(),
    birthCertificateDate: input.birthCertificateDate?.trim(),
    birthDate: input.birthDate?.trim(),
    maritalStatus: input.maritalStatus?.trim(),
    address: input.address?.trim(),
    postalCode: input.postalCode ? normalizeDigits(input.postalCode) : undefined,
    mobilePhone: input.mobilePhone ? normalizeDigits(input.mobilePhone) : undefined,
    landlinePhone: input.landlinePhone ? normalizeDigits(input.landlinePhone) : undefined,
    bankAccountNumber: input.bankAccountNumber
      ? normalizeDigits(input.bankAccountNumber)
      : undefined,
    bankCardNumber: input.bankCardNumber ? normalizeDigits(input.bankCardNumber) : undefined,
    iban: input.iban ? normalizeIban(input.iban) : undefined,
    bankName: input.bankName?.trim(),
    insuranceNumber: input.insuranceNumber ? normalizeDigits(input.insuranceNumber) : undefined,
  };
}

export const EMPLOYEE_PROFILE_FIELD_LABELS = FIELD_LABELS;
