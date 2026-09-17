'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarCheck2, CheckCircle2, ClipboardList, Gauge, Megaphone, Plus, ShieldAlert } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { JalaliDateInput } from '@/components/ui/jalali-date-input';
import { useApi } from '@/hooks/use-api';
import { apiFetch, ApiError } from '@/lib/utils';
import { formatJalaliDate } from '@/lib/date';
import { EVENT_RISK_LABELS, EVENT_RISK_STYLES, EVENT_STATUS_LABELS, EVENT_TYPE_LABELS, EVENT_MANAGEMENT_TYPES, type EventManagementProject } from '@/lib/event-management';

type Tab = 'projects' | 'create' | 'assessment';
interface ToolsResponse {
  assessmentCriteria: Record<string, Array<{ key: string; label: string; weight: number; veto?: boolean }>>;
}

const profiles = [
  ['private_company', 'شرکت و بنگاه خصوصی'], ['government', 'دولتی و حاکمیتی'], ['public_institution', 'نهاد عمومی'],
  ['startup', 'استارتاپ'], ['ngo', 'سازمان مردم‌نهاد'], ['academic', 'دانشگاه و مرکز پژوهشی'],
];

export default function EventManagementPage() {
  const { data, error, isLoading, refetch } = useApi<EventManagementProject[]>('/event-management/projects');
  const { data: tools } = useApi<ToolsResponse>('/event-management/tools');
  const projects = Array.isArray(data) ? data : [];
  const [tab, setTab] = useState<Tab>('projects');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ title: '', type: 'event', objective: '', organizationProfile: 'private_company', mode: 'in_person', date: '', time: '10:00', location: '', targetAudience: '', approvedBudget: '' });
  const [assessmentType, setAssessmentType] = useState('event');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [scoreResult, setScoreResult] = useState<{ percent: number; recommendation: string; vetoes: string[] } | null>(null);
  const criteria = useMemo(() => tools?.assessmentCriteria?.[assessmentType] ?? [], [tools, assessmentType]);

  async function createProject() {
    if (!form.title.trim() || !form.objective.trim()) { setMessage('عنوان و هدف واقعی الزامی است.'); return; }
    setBusy(true); setMessage('');
    try {
      const startAt = form.date ? `${form.date}T${form.time || '10:00'}:00+03:30` : undefined;
      await apiFetch('/event-management/projects', { method: 'POST', body: {
        title: form.title.trim(), type: form.type, objective: form.objective.trim(), organizationProfile: form.organizationProfile,
        mode: form.mode, startAt, location: form.location.trim() || undefined, targetAudience: form.targetAudience.trim() || undefined,
        approvedBudget: form.approvedBudget ? Number(form.approvedBudget) : undefined,
      } });
      setForm({ title: '', type: 'event', objective: '', organizationProfile: 'private_company', mode: 'in_person', date: '', time: '10:00', location: '', targetAudience: '', approvedBudget: '' });
      await refetch(); setTab('projects'); setMessage('پرونده مدیریت رویداد ایجاد شد.');
    } catch (err) { setMessage(err instanceof ApiError ? err.message : 'ایجاد پرونده انجام نشد.'); }
    finally { setBusy(false); }
  }

  async function assessOpportunity() {
    const completeScores = Object.fromEntries(criteria.map((item) => [item.key, scores[item.key] ?? 3]));
    setBusy(true); setMessage('');
    try {
      const result = await apiFetch<{ percent: number; recommendation: string; vetoes: string[] }>('/event-management/opportunity-assessment', { method: 'POST', body: { type: assessmentType, scores: completeScores } });
      setScoreResult(result);
    } catch (err) { setMessage(err instanceof ApiError ? err.message : 'ارزیابی انجام نشد.'); }
    finally { setBusy(false); }
  }

  const completedTasks = projects.reduce((sum, project) => sum + (project.tasks?.filter((task) => task.status === 'done').length ?? 0), 0);
  const totalTasks = projects.reduce((sum, project) => sum + (project._count?.tasks ?? project.tasks?.length ?? 0), 0);

  return <ProtectedLayout title="مدیریت رویداد"><main className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
    <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-violet-950 via-slate-900 to-slate-950 p-6 text-white shadow-xl shadow-violet-950/10 sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 p-3 ring-1 ring-white/15"><Megaphone className="h-7 w-7" /></span><div><h1 className="text-2xl font-black">میزکار مدیریت رویداد</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">از تصمیم و انتخاب تاریخ تا اجرای رویداد، ارتباط با رسانه، بودجه و گزارش نهایی.</p></div></div><Button onClick={() => setTab('create')} className="bg-violet-600 hover:bg-violet-500"><Plus className="h-4 w-4" /> پرونده جدید</Button></div>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      <Card className="p-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-2 text-violet-700"><ClipboardList className="h-5 w-5" /></span><div><p className="text-xs text-slate-500">پرونده‌ها</p><p className="mt-1 text-xl font-black">{formatPersianDigits(projects.length)}</p></div></div></Card>
      <Card className="p-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span><div><p className="text-xs text-slate-500">وظایف انجام‌شده</p><p className="mt-1 text-xl font-black">{formatPersianDigits(`${completedTasks} از ${totalTasks}`)}</p></div></div></Card>
      <Card className="p-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-700"><ShieldAlert className="h-5 w-5" /></span><div><p className="text-xs text-slate-500">تاریخ‌های پرریسک</p><p className="mt-1 text-xl font-black">{formatPersianDigits(projects.filter((p) => ['orange', 'red'].includes(p.calendarRisk)).length)}</p></div></div></Card>
    </section>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
      {([['projects', 'پرونده‌ها'], ['create', 'پرونده جدید'], ['assessment', 'ارزیابی فرصت']] as [Tab, string][]).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
    </div>

    {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    {tab === 'projects' && <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">{EVENT_MANAGEMENT_TYPES.map((tool) => <Card key={tool.id} className="p-4"><p className="font-bold text-slate-900">{tool.label}</p><p className="mt-2 text-xs leading-6 text-slate-500">{tool.description}</p></Card>)}</div>
      {isLoading ? <Card className="p-10 text-center text-sm text-slate-500">در حال دریافت پرونده‌ها...</Card> : projects.length === 0 ? <Card className="p-12 text-center"><Megaphone className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm text-slate-500">هنوز پرونده‌ای ساخته نشده است.</p><Button className="mt-4" onClick={() => setTab('create')}>ساخت اولین پرونده</Button></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <Link href={`/event-management/${project.id}`} key={project.id}><Card className="group h-full p-5 transition hover:-translate-y-1 hover:shadow-lg"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-semibold text-violet-700">{EVENT_TYPE_LABELS[project.type] ?? project.type}</span><h2 className="mt-1 font-black text-slate-900">{project.title}</h2></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${EVENT_RISK_STYLES[project.calendarRisk] ?? EVENT_RISK_STYLES.unassessed}`}>{EVENT_RISK_LABELS[project.calendarRisk] ?? project.calendarRisk}</span></div><p className="mt-3 line-clamp-2 min-h-12 text-sm leading-6 text-slate-500">{project.objective}</p><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">{EVENT_STATUS_LABELS[project.status] ?? project.status}</span>{project.startAt && <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">{formatJalaliDate(project.startAt)}</span>}<span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">{formatPersianDigits(project._count?.tasks ?? 0)} وظیفه</span></div><span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-violet-700">ورود به پرونده <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" /></span></Card></Link>)}</div>}
    </section>}

    {tab === 'create' && <Card className="p-5 sm:p-7"><div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-2 text-violet-700"><Plus className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">پرونده جدید</h2><p className="mt-1 text-xs text-slate-500">هدف واقعی را پیش از تاریخ و جزئیات اجرایی مشخص کنید.</p></div></div><div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">عنوان<input className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="text-sm font-medium text-slate-700">نوع برنامه<select className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{EVENT_MANAGEMENT_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="md:col-span-2 text-sm font-medium text-slate-700">هدف واقعی<textarea rows={3} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="پس از اجرای این برنامه دقیقاً چه چیزی باید تغییر کرده باشد؟" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} /></label>
      <label className="text-sm font-medium text-slate-700">پروفایل سازمان<select className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" value={form.organizationProfile} onChange={(e) => setForm({ ...form, organizationProfile: e.target.value })}>{profiles.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-700">حالت اجرا<select className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}><option value="in_person">حضوری</option><option value="online">آنلاین</option><option value="hybrid">ترکیبی</option></select></label>
      <JalaliDateInput label="تاریخ اجرا" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <label className="text-sm font-medium text-slate-700">ساعت<input type="time" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
      <label className="text-sm font-medium text-slate-700">مکان<input className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
      <label className="text-sm font-medium text-slate-700">بودجه مصوب (ریال)<input type="number" min="0" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" value={form.approvedBudget} onChange={(e) => setForm({ ...form, approvedBudget: e.target.value })} /></label>
      <label className="md:col-span-2 text-sm font-medium text-slate-700">مخاطب هدف<textarea rows={2} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} /></label>
    </div><div className="mt-6 flex justify-end"><Button isLoading={busy} onClick={createProject}><Plus className="h-4 w-4" /> ایجاد پرونده</Button></div></Card>}

    {tab === 'assessment' && <Card className="p-5 sm:p-7"><div className="flex items-start gap-3"><span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Gauge className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">ارزیابی فرصت</h2><p className="mt-1 text-sm leading-6 text-slate-500">پیش از صرف بودجه، ضرورت و آمادگی را عددی بسنجید. معیارهای وتو با علامت هشدار مشخص‌اند.</p></div></div><div className="mt-6 grid gap-5 md:grid-cols-[260px_1fr]"><div><label className="text-sm font-medium text-slate-700">نوع ابزار<select className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" value={assessmentType} onChange={(e) => { setAssessmentType(e.target.value); setScores({}); setScoreResult(null); }}>{EVENT_MANAGEMENT_TYPES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600"><CalendarCheck2 className="mb-2 h-5 w-5 text-violet-600" />بعد از ساخت پرونده، تاریخ آن نیز جداگانه با تقویم شمسی، قمری، تعطیلات و ملاحظات تجاری بررسی می‌شود.</div></div><div className="grid gap-3 sm:grid-cols-2">{criteria.map((item) => <label key={item.key} className="rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700"><span className="flex items-center justify-between"><span>{item.label}{item.veto && <span className="mr-1 text-red-600">⚠</span>}</span><span className="text-xs text-slate-400">ضریب {formatPersianDigits(item.weight)}</span></span><input type="range" min="1" max="5" value={scores[item.key] ?? 3} onChange={(e) => setScores({ ...scores, [item.key]: Number(e.target.value) })} className="mt-4 w-full accent-violet-600" /><div className="mt-1 flex justify-between text-xs text-slate-400"><span>ضعیف</span><strong className="text-violet-700">{formatPersianDigits(scores[item.key] ?? 3)}</strong><span>عالی</span></div></label>)}</div></div><div className="mt-6 flex flex-wrap items-center gap-4"><Button isLoading={busy} onClick={assessOpportunity}>محاسبه نتیجه</Button>{scoreResult && <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${scoreResult.recommendation === 'proceed' ? 'bg-emerald-50 text-emerald-700' : scoreResult.recommendation === 'conditional' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>امتیاز {formatPersianDigits(scoreResult.percent)}٪ — {scoreResult.recommendation === 'proceed' ? 'قابل ورود با بودجه اجرایی' : scoreResult.recommendation === 'conditional' ? 'مشروط به اصلاح و مذاکره' : 'توصیه به عدم ورود'}{scoreResult.vetoes.length > 0 && `؛ وتو: ${scoreResult.vetoes.join('، ')}`}</div>}</div></Card>}
  </main></ProtectedLayout>;
}
