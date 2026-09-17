export const CONTACT_TYPE_LABELS: Record<string, string> = {
  person: 'حقیقی',
  company: 'حقوقی',
};

export interface ContactBankAccountInput {
  bankName: string;
  accountNumber?: string;
  cardNumber?: string;
  sheba?: string;
  isDefault?: boolean;
}

export interface ContactFormInput {
  type?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  nationalId?: string;
  economicCode?: string;
  registrationNumber?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  website?: string;
  notes?: string;
  birthDate?: string | null;
  marriageDate?: string | null;
  membershipDate?: string | null;
  isActive?: boolean;
}

/** نام نمایشی: حقیقی = نام + نام خانوادگی، حقوقی = نام شرکت */
export function resolveContactDisplayName(input: ContactFormInput): string {
  if (input.name?.trim()) return input.name.trim();
  if (input.type === 'company') {
    return input.companyName?.trim() || 'بدون نام';
  }
  const full = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(' ');
  if (full) return full;
  return input.companyName?.trim() || 'بدون نام';
}


/** انواع رویداد تقویم مرتبط با مخاطب */
export const CONTACT_CALENDAR_EVENT_TYPES = {
  BIRTH: 'contact_birth_date',
  MARRIAGE: 'contact_marriage_date',
  MEMBERSHIP: 'contact_membership_date',
} as const;

export const CONTACT_CALENDAR_EVENT_LABELS: Record<string, string> = {
  [CONTACT_CALENDAR_EVENT_TYPES.BIRTH]: 'تولد',
  [CONTACT_CALENDAR_EVENT_TYPES.MARRIAGE]: 'سالگرد ازدواج',
  [CONTACT_CALENDAR_EVENT_TYPES.MEMBERSHIP]: 'سالگرد عضویت',
};

export function getContactBirthDateLabel(type?: string | null): string {
  return type === 'company' ? 'تاریخ تأسیس' : 'تاریخ تولد';
}

export function getContactBirthCalendarLabel(type?: string | null): string {
  return type === 'company' ? 'تأسیس' : 'تولد';
}

export const CONTACT_CALENDAR_EVENT_COLORS: Record<string, string> = {
  [CONTACT_CALENDAR_EVENT_TYPES.BIRTH]: '#ec4899',
  [CONTACT_CALENDAR_EVENT_TYPES.MARRIAGE]: '#f59e0b',
  [CONTACT_CALENDAR_EVENT_TYPES.MEMBERSHIP]: '#8b5cf6',
};
