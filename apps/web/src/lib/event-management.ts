export const EVENT_MANAGEMENT_TYPES = [
  { id: 'event', label: 'رویداد', description: 'آیینی، دانشی، داخلی یا برندی' },
  { id: 'press_conference', label: 'نشست خبری', description: 'خانه پیام، رسانه و پرسش‌های سخت' },
  { id: 'media_visit', label: 'بازدید رسانه‌ای', description: 'مسیر روایت، ایمنی و حریم خصوصی' },
  { id: 'exhibition', label: 'نمایشگاه', description: 'غرفه، تیم، رسانه و ثبت لید' },
  { id: 'sponsorship', label: 'حمایت مالی', description: 'ارزیابی فرصت و فعال‌سازی' },
] as const;

export const EVENT_TYPE_LABELS = Object.fromEntries(EVENT_MANAGEMENT_TYPES.map((item) => [item.id, item.label])) as Record<string, string>;

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس', planning: 'در حال برنامه‌ریزی', approved: 'تأیید شده', executing: 'در حال اجرا', completed: 'تکمیل شده', cancelled: 'لغو شده',
};

export const EVENT_RISK_STYLES: Record<string, string> = {
  unassessed: 'bg-slate-100 text-slate-600', green: 'bg-emerald-50 text-emerald-700', yellow: 'bg-amber-50 text-amber-700', orange: 'bg-orange-50 text-orange-700', red: 'bg-red-50 text-red-700',
};

export const EVENT_RISK_LABELS: Record<string, string> = {
  unassessed: 'بررسی نشده', green: 'کم‌ریسک', yellow: 'نیازمند توجه', orange: 'پرریسک', red: 'نامناسب',
};

export interface EventManagementProject {
  id: string;
  title: string;
  type: string;
  status: string;
  objective: string;
  organizationProfile: string;
  mode: string;
  startAt?: string | null;
  endAt?: string | null;
  location?: string | null;
  targetAudience?: string | null;
  approvedBudget?: string | number | null;
  actualCost?: string | number | null;
  details?: Record<string, unknown>;
  calendarRisk: string;
  calendarAssessment?: DateAssessment | null;
  calendarCheckedAt?: string | null;
  tasks?: EventManagementTask[];
  agendaItems?: EventManagementAgendaItem[];
  budgetItems?: EventManagementBudgetItem[];
  _count?: { tasks: number; agendaItems: number; budgetItems: number };
}

export interface EventManagementTask {
  id: string; phase: string; title: string; deliverable?: string | null; ownerName?: string | null; dueAt?: string | null; status: string; required: boolean; notes?: string | null;
}

export interface EventManagementAgendaItem {
  id: string; startAt?: string | null; durationMinutes: number; title: string; ownerName?: string | null; onlineAction?: string | null; technicalNotes?: string | null;
}

export interface EventManagementBudgetItem {
  id: string; category: string; description: string; quantity: string | number; unitCost: string | number; estimatedAmount: string | number; actualAmount?: string | number | null;
}

export interface DateAssessment {
  level: string;
  targetDate: string;
  calendars: { jalali: string; gregorian: string; lunar: string };
  warnings: string[];
  recommendation: string;
  source: string;
  checkedAt: string;
  disclaimer: string;
}
