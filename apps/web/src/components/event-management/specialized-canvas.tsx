'use client';

import { useState } from 'react';
import { Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiFetch, ApiError } from '@/lib/utils';
import type { EventManagementProject } from '@/lib/event-management';

interface FieldDefinition { key: string; label: string; placeholder: string; multiline?: boolean; }

const fieldsByType: Record<string, FieldDefinition[]> = {
  event: [
    { key: 'eventFamily', label: 'خانواده رویداد', placeholder: 'آیینی، دانشی، داخلی یا برندی' },
    { key: 'motherMessage', label: 'پیام مادر', placeholder: 'یک جمله که باید در ذهن مهمان بماند', multiline: true },
    { key: 'guestValue', label: 'ارزش حضور برای مهمان', placeholder: 'مهمان در برابر زمانی که می‌دهد چه چیزی می‌گیرد؟', multiline: true },
    { key: 'symbolicMoment', label: 'لحظه نمادین', placeholder: 'رونمایی، امضا، روبان یا لحظه تصویری اصلی' },
    { key: 'backupPlan', label: 'سناریوی جایگزین', placeholder: 'عدم حضور مقام، خرابی فنی یا تغییر شرایط', multiline: true },
  ],
  press_conference: [
    { key: 'mainNews', label: 'خبر اصلی', placeholder: 'خبر در یک جمله روشن و قابل تیتر' },
    { key: 'motherMessage', label: 'پیام مادر', placeholder: 'ادعای اصلی نشست', multiline: true },
    { key: 'supportingMessages', label: 'سه پیام پشتیبان و شواهد', placeholder: 'هر پیام همراه با عدد یا شاهد و منبع', multiline: true },
    { key: 'hardQuestions', label: 'سؤال‌های سخت و پاسخ آماده', placeholder: 'حداقل هشت سؤال؛ هر پاسخ مستند و کوتاه', multiline: true },
    { key: 'embargo', label: 'زمان‌بندی انتشار', placeholder: 'رسانه‌ها، ساعت رفع محدودیت و بیانیه اضطراری' },
    { key: 'openCommitments', label: 'تعهدات باز رسانه‌ای', placeholder: 'پرسش بی‌پاسخ، مسئول و مهلت پاسخ', multiline: true },
  ],
  media_visit: [
    { key: 'visibleSubject', label: 'چه چیزی باید دیده شود؟', placeholder: 'سوژه واقعی و قابل مشاهده' },
    { key: 'routeNarrative', label: 'روایت مسیر', placeholder: 'آغاز، مسیر و نتیجه‌ای که بازدیدکننده می‌بیند', multiline: true },
    { key: 'climax', label: 'نقطه اوج', placeholder: 'بهترین صحنه و زاویه تصویربرداری' },
    { key: 'freeTime', label: 'زمان آزاد', placeholder: 'مدت و محدوده امن برای مشاهده مستقل' },
    { key: 'restrictedAreas', label: 'محدوده‌های ممنوع تصویربرداری', placeholder: 'محدوده و دلیل روشن هر محدودیت', multiline: true },
    { key: 'consentPlan', label: 'برنامه رضایت آگاهانه', placeholder: 'افراد، سطح رضایت و دامنه مجاز انتشار', multiline: true },
  ],
  exhibition: [
    { key: 'organizer', label: 'برگزارکننده و اعتبارسنجی', placeholder: 'سابقه، گزارش دوره قبل و منبع بررسی' },
    { key: 'mainGoal', label: 'هدف اصلی حضور', placeholder: 'لید، معرفی محصول، شریک، برند یا جذب نیرو' },
    { key: 'booth', label: 'مشخصات غرفه', placeholder: 'سالن، شماره، متراژ، اضلاع باز و نوع ساخت' },
    { key: 'tenMeterMessage', label: 'پیام قابل خواندن از ۱۰ متر', placeholder: 'یک عبارت کوتاه و متمایز' },
    { key: 'zones', label: 'زون‌بندی غرفه', placeholder: 'پذیرش، دمو، گفتگو، جلسه خصوصی، انبار و پذیرایی', multiline: true },
    { key: 'leadDefinition', label: 'تعریف لید واجد شرایط', placeholder: 'معیارهای درجه الف و ب و مسئول پیگیری', multiline: true },
  ],
  sponsorship: [
    { key: 'organizer', label: 'برگزارکننده', placeholder: 'نام، سابقه و نتیجه راستی‌آزمایی' },
    { key: 'supportLevel', label: 'سطح و مبلغ حمایت', placeholder: 'سطح بسته، مبلغ و مهلت تصمیم' },
    { key: 'activationBudget', label: 'بودجه فعال‌سازی', placeholder: 'حداقل ۵۰٪ مبلغ حمایت و اجزای آن' },
    { key: 'packageAssets', label: 'دارایی‌های بسته', placeholder: 'هر دارایی و استفاده واقعی ما از آن', multiline: true },
    { key: 'requestedAssets', label: 'دارایی‌های درخواستی در مذاکره', placeholder: 'سخنرانی، داده لید، فضای اختصاصی، محتوا و ...', multiline: true },
    { key: 'contractConditions', label: 'شرایط قراردادی حیاتی', placeholder: 'لغو، جبران، تأیید محتوا، حق استفاده و گزارش عملکرد', multiline: true },
  ],
};

export function SpecializedCanvas({ project, onSaved }: { project: EventManagementProject; onSaved: () => Promise<unknown> }) {
  const fields = fieldsByType[project.type] ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.key, String(project.details?.[field.key] ?? '')])));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setSaving(true); setMessage('');
    try {
      await apiFetch(`/event-management/projects/${project.id}`, { method: 'PATCH', body: { details: { ...(project.details ?? {}), ...values } } });
      await onSaved(); setMessage('بوم تخصصی ذخیره شد.');
    } catch (err) { setMessage(err instanceof ApiError ? err.message : 'ذخیره انجام نشد.'); }
    finally { setSaving(false); }
  }

  return <Card className="p-5 sm:p-6"><div className="flex items-start gap-3"><span className="rounded-xl bg-violet-50 p-2 text-violet-700"><Sparkles className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">بوم تخصصی این پرونده</h2><p className="mt-1 text-sm leading-6 text-slate-500">اطلاعات کلیدی ابزار را اینجا نگه دارید تا تصمیم، اجرا و گزارش نهایی یک مرجع واحد داشته باشند.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2">{fields.map((field) => <label key={field.key} className={`text-sm font-medium text-slate-700 ${field.multiline ? 'md:col-span-2' : ''}`}>{field.label}{field.multiline ? <textarea rows={4} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 leading-6" placeholder={field.placeholder} value={values[field.key] ?? ''} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} /> : <input className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder={field.placeholder} value={values[field.key] ?? ''} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />}</label>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3">{message ? <p className="text-sm text-emerald-700">{message}</p> : <span />}<Button isLoading={saving} onClick={save}><Save className="h-4 w-4" /> ذخیره بوم</Button></div></Card>;
}
