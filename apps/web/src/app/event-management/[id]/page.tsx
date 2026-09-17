'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Banknote, CalendarCheck2, ListChecks, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SpecializedCanvas } from '@/components/event-management/specialized-canvas';
import { useApi } from '@/hooks/use-api';
import { apiFetch, ApiError } from '@/lib/utils';
import { formatJalaliDateTime, formatNumber } from '@/lib/date';
import { EVENT_RISK_LABELS, EVENT_RISK_STYLES, EVENT_STATUS_LABELS, EVENT_TYPE_LABELS, type DateAssessment, type EventManagementBudgetItem, type EventManagementProject } from '@/lib/event-management';

type Tab = 'overview' | 'tasks' | 'agenda' | 'budget';

export default function EventManagementProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data: project, error, isLoading, refetch } = useApi<EventManagementProject>(id ? `/event-management/projects/${id}` : null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [taskForm, setTaskForm] = useState({ phase: 'سایر', title: '', ownerName: '' });
  const [budgetForm, setBudgetForm] = useState({ category: 'سایر', description: '', estimatedAmount: '' });
  const [agendaForm, setAgendaForm] = useState({ title: '', durationMinutes: '15', ownerName: '' });

  const doneTasks = project?.tasks?.filter((item) => item.status === 'done').length ?? 0;
  const taskProgress = project?.tasks?.length ? Math.round(doneTasks / project.tasks.length * 100) : 0;
  const budgetTotals = useMemo(() => (project?.budgetItems ?? []).reduce((acc, item) => ({ estimated: acc.estimated + Number(item.estimatedAmount || 0), actual: acc.actual + Number(item.actualAmount || 0) }), { estimated: 0, actual: 0 }), [project?.budgetItems]);
  const tasksByPhase = useMemo(() => (project?.tasks ?? []).reduce<Record<string, NonNullable<EventManagementProject['tasks']>>>((groups, item) => {
    (groups[item.phase] ??= []).push(item);
    return groups;
  }, {}), [project?.tasks]);

  async function action(name: string, fn: () => Promise<unknown>, success: string) {
    setBusy(name); setMessage('');
    try { await fn(); await refetch(); setMessage(success); }
    catch (err) { setMessage(err instanceof ApiError ? err.message : 'عملیات انجام نشد.'); }
    finally { setBusy(''); }
  }

  function generateChecklist() {
    const replace = Boolean(project?.tasks?.length) && window.confirm('چک‌لیست فعلی با قالب استاندارد جایگزین شود؟');
    if (project?.tasks?.length && !replace) return;
    return action('generate', () => apiFetch(`/event-management/projects/${id}/generate-checklist`, { method: 'POST', body: { replace } }), 'چک‌لیست، بودجه پایه و سناریوی اجرا ساخته شد.');
  }

  async function assessDate() {
    if (!project?.startAt) { setMessage('ابتدا تاریخ اجرا را برای پرونده ثبت کنید.'); return; }
    await action('date', () => apiFetch<DateAssessment>('/event-management/date-assessment', { method: 'POST', body: { projectId: id, targetDate: project.startAt, type: project.type, objective: project.objective, flexible: true } }), 'ارزیابی تاریخ ثبت شد.');
  }

  async function updateStatus(status: string) {
    await action('status', () => apiFetch(`/event-management/projects/${id}`, { method: 'PATCH', body: { status } }), 'وضعیت پرونده به‌روز شد.');
  }

  async function addTask() {
    if (!taskForm.title.trim()) return;
    await action('task-add', () => apiFetch(`/event-management/projects/${id}/tasks`, { method: 'POST', body: taskForm }), 'وظیفه افزوده شد.');
    setTaskForm({ phase: 'سایر', title: '', ownerName: '' });
  }

  async function addBudget() {
    if (!budgetForm.description.trim()) return;
    await action('budget-add', () => apiFetch(`/event-management/projects/${id}/budget`, { method: 'POST', body: { ...budgetForm, estimatedAmount: Number(budgetForm.estimatedAmount || 0) } }), 'ردیف بودجه افزوده شد.');
    setBudgetForm({ category: 'سایر', description: '', estimatedAmount: '' });
  }

  async function setActualBudget(item: EventManagementBudgetItem) {
    const input = window.prompt('مبلغ واقعی این ردیف را به ریال وارد کنید:', String(item.actualAmount ?? item.estimatedAmount ?? 0));
    if (input === null) return;
    const actualAmount = Number(input.replace(/[,،]/g, ''));
    if (!Number.isFinite(actualAmount) || actualAmount < 0) { setMessage('مبلغ واقعی معتبر نیست.'); return; }
    await action(`budget-${item.id}`, () => apiFetch(`/event-management/budget/${item.id}`, { method: 'PATCH', body: { actualAmount } }), 'هزینه واقعی ثبت شد.');
  }

  async function addAgenda() {
    if (!agendaForm.title.trim()) return;
    await action('agenda-add', () => apiFetch(`/event-management/projects/${id}/agenda`, { method: 'POST', body: { ...agendaForm, durationMinutes: Number(agendaForm.durationMinutes || 15) } }), 'بخش سناریو افزوده شد.');
    setAgendaForm({ title: '', durationMinutes: '15', ownerName: '' });
  }

  async function deleteProject() {
    if (!project || !window.confirm(`پرونده «${project.title}» و همه چک‌لیست و بودجه آن حذف شود؟`)) return;
    setBusy('delete');
    try { await apiFetch(`/event-management/projects/${id}`, { method: 'DELETE' }); router.push('/event-management'); }
    catch (err) { setMessage(err instanceof ApiError ? err.message : 'حذف انجام نشد.'); setBusy(''); }
  }

  if (isLoading) return <ProtectedLayout title="مدیریت رویداد"><Card className="mx-auto max-w-5xl p-12 text-center text-sm text-slate-500">در حال دریافت پرونده...</Card></ProtectedLayout>;
  if (!project) return <ProtectedLayout title="مدیریت رویداد"><Card className="mx-auto max-w-5xl p-10 text-center text-red-700">{error || 'پرونده یافت نشد.'}</Card></ProtectedLayout>;

  const assessment = project.calendarAssessment;
  return <ProtectedLayout title={project.title}><main className="mx-auto w-full max-w-7xl space-y-5" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/event-management" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700"><ArrowRight className="h-4 w-4" /> بازگشت به میزکار</Link><Button variant="danger" size="sm" isLoading={busy === 'delete'} onClick={deleteProject}><Trash2 className="h-4 w-4" /> حذف پرونده</Button></div>

    <header className="rounded-3xl bg-gradient-to-l from-violet-950 via-slate-900 to-slate-950 p-6 text-white shadow-xl"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-bold text-violet-100">{EVENT_TYPE_LABELS[project.type] ?? project.type}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${EVENT_RISK_STYLES[project.calendarRisk] ?? EVENT_RISK_STYLES.unassessed}`}>{EVENT_RISK_LABELS[project.calendarRisk] ?? project.calendarRisk}</span></div><h1 className="mt-4 text-2xl font-black">{project.title}</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{project.objective}</p></div><div className="min-w-52"><label className="text-xs text-slate-300">وضعیت پرونده<select value={project.status} disabled={busy === 'status'} onChange={(e) => updateStatus(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"><option className="text-slate-900" value="draft">پیش‌نویس</option><option className="text-slate-900" value="planning">در حال برنامه‌ریزی</option><option className="text-slate-900" value="approved">تأیید شده</option><option className="text-slate-900" value="executing">در حال اجرا</option><option className="text-slate-900" value="completed">تکمیل شده</option><option className="text-slate-900" value="cancelled">لغو شده</option></select></label></div></div></header>

    {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card className="p-4"><p className="text-xs text-slate-500">تاریخ اجرا</p><p className="mt-2 font-bold text-slate-900">{formatJalaliDateTime(project.startAt)}</p></Card><Card className="p-4"><p className="text-xs text-slate-500">وضعیت</p><p className="mt-2 font-bold text-slate-900">{EVENT_STATUS_LABELS[project.status] ?? project.status}</p></Card><Card className="p-4"><p className="text-xs text-slate-500">پیشرفت چک‌لیست</p><p className="mt-2 font-bold text-slate-900">{formatPersianDigits(taskProgress)}٪</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${taskProgress}%` }} /></div></Card><Card className="p-4"><p className="text-xs text-slate-500">برآورد بودجه</p><p className="mt-2 font-bold text-slate-900">{formatNumber(budgetTotals.estimated)} ریال</p></Card></section>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">{([['overview', 'نمای کلی'], ['tasks', 'چک‌لیست'], ['agenda', 'سناریوی اجرا'], ['budget', 'بودجه']] as [Tab, string][]).map(([item, label]) => <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div>

    {tab === 'overview' && <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><Card className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">دروازه تقویمی</h2><p className="mt-1 text-sm text-slate-500">تاریخ باید از سه تقویم و ملاحظات تجاری عبور کند.</p></div><Button isLoading={busy === 'date'} onClick={assessDate}><CalendarCheck2 className="h-4 w-4" /> بررسی تاریخ</Button></div>{assessment ? <div className="mt-5 space-y-4"><div className={`rounded-2xl p-4 ${EVENT_RISK_STYLES[assessment.level]}`}><strong>{EVENT_RISK_LABELS[assessment.level]}</strong><p className="mt-2 text-sm leading-6">{assessment.recommendation}</p></div><div className="grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">شمسی</span><p className="mt-1 font-bold">{assessment.calendars.jalali}</p></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">میلادی</span><p className="mt-1 font-bold">{assessment.calendars.gregorian}</p></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">قمری محاسباتی</span><p className="mt-1 font-bold">{assessment.calendars.lunar}</p></div></div>{assessment.warnings.length > 0 && <ul className="space-y-2">{assessment.warnings.map((warning) => <li key={warning} className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</li>)}</ul>}<p className="rounded-xl border border-slate-200 p-3 text-xs leading-6 text-slate-500">{assessment.disclaimer}<br />منبع: {assessment.source}</p></div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">این تاریخ هنوز بررسی نشده است.</div>}</Card><Card className="p-5 sm:p-6"><h2 className="font-black text-slate-900">اطلاعات اجرا</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-slate-500">حالت اجرا</dt><dd className="mt-1 font-bold">{project.mode === 'in_person' ? 'حضوری' : project.mode === 'online' ? 'آنلاین' : 'ترکیبی'}</dd></div><div><dt className="text-slate-500">مکان</dt><dd className="mt-1 font-bold">{project.location || 'ثبت نشده'}</dd></div><div><dt className="text-slate-500">مخاطب هدف</dt><dd className="mt-1 leading-6">{project.targetAudience || 'ثبت نشده'}</dd></div><div><dt className="text-slate-500">پروفایل سازمان</dt><dd className="mt-1 font-bold">{project.organizationProfile}</dd></div></dl><Button className="mt-6 w-full" variant="outline" isLoading={busy === 'generate'} onClick={generateChecklist}><RefreshCw className="h-4 w-4" /> {project.tasks?.length ? 'بازسازی قالب اجرایی' : 'ساخت قالب اجرایی'}</Button></Card></div><SpecializedCanvas project={project} onSaved={refetch} /></div>}

    {tab === 'tasks' && <section className="space-y-4"><Card className="p-4"><div className="grid gap-3 md:grid-cols-[180px_1fr_180px_auto]"><input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="فاز" value={taskForm.phase} onChange={(e) => setTaskForm({ ...taskForm, phase: e.target.value })} /><input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="عنوان وظیفه" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} /><input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="مسئول" value={taskForm.ownerName} onChange={(e) => setTaskForm({ ...taskForm, ownerName: e.target.value })} /><Button isLoading={busy === 'task-add'} onClick={addTask}><Plus className="h-4 w-4" /> افزودن</Button></div></Card>{!project.tasks?.length ? <Card className="p-10 text-center"><ListChecks className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm text-slate-500">چک‌لیست خالی است.</p><Button className="mt-4" onClick={generateChecklist}>ساخت از قالب تخصصی</Button></Card> : <div className="space-y-5">{Object.entries(tasksByPhase).map(([phase, items]) => <Card key={phase} className="overflow-hidden"><div className="border-b border-slate-100 bg-slate-50 px-5 py-3 font-bold text-slate-800">{phase}</div><div className="divide-y divide-slate-100">{items.map((task) => <label key={task.id} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-slate-50"><input type="checkbox" checked={task.status === 'done'} onChange={(e) => action(`task-${task.id}`, () => apiFetch(`/event-management/tasks/${task.id}`, { method: 'PATCH', body: { status: e.target.checked ? 'done' : 'todo' } }), 'وضعیت وظیفه ثبت شد.')} className="mt-1 h-4 w-4 accent-emerald-600" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`font-semibold ${task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</span>{task.required && <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">الزامی</span>}</div>{task.deliverable && <p className="mt-1 text-xs text-slate-500">خروجی: {task.deliverable}</p>}<div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">{task.ownerName && <span>مسئول: {task.ownerName}</span>}{task.dueAt && <span>مهلت: {formatJalaliDateTime(task.dueAt, 'YYYY/MM/DD')}</span>}</div></div>{busy === `task-${task.id}` && <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />}</label>)}</div></Card>)}</div>}</section>}

    {tab === 'agenda' && <section className="space-y-4"><Card className="p-4"><div className="grid gap-3 md:grid-cols-[1fr_130px_180px_auto]"><input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="بخش سناریو" value={agendaForm.title} onChange={(e) => setAgendaForm({ ...agendaForm, title: e.target.value })} /><input type="number" min="1" className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="مدت (دقیقه)" value={agendaForm.durationMinutes} onChange={(e) => setAgendaForm({ ...agendaForm, durationMinutes: e.target.value })} /><input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="عامل مسئول" value={agendaForm.ownerName} onChange={(e) => setAgendaForm({ ...agendaForm, ownerName: e.target.value })} /><Button isLoading={busy === 'agenda-add'} onClick={addAgenda}><Plus className="h-4 w-4" /> افزودن</Button></div></Card><Card className="overflow-hidden"><div className="grid grid-cols-[110px_80px_1fr_160px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500"><span>ساعت</span><span>مدت</span><span>بخش</span><span>عامل</span></div>{project.agendaItems?.length ? <div className="divide-y divide-slate-100">{project.agendaItems.map((item) => <div key={item.id} className="grid grid-cols-[110px_80px_1fr_160px] gap-3 px-4 py-3 text-sm"><span>{item.startAt ? new Date(item.startAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span><span>{formatPersianDigits(item.durationMinutes)} دقیقه</span><div><strong>{item.title}</strong>{item.technicalNotes && <p className="mt-1 text-xs text-slate-500">{item.technicalNotes}</p>}</div><span>{item.ownerName || '—'}</span></div>)}</div> : <div className="p-10 text-center text-sm text-slate-500">سناریوی اجرا هنوز ساخته نشده است.</div>}</Card></section>}

    {tab === 'budget' && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Card className="p-4"><p className="text-xs text-slate-500">بودجه مصوب</p><p className="mt-2 font-black">{formatNumber(Number(project.approvedBudget || 0))} ریال</p></Card><Card className="p-4"><p className="text-xs text-slate-500">جمع برآورد ردیف‌ها</p><p className="mt-2 font-black">{formatNumber(budgetTotals.estimated)} ریال</p></Card><Card className="p-4"><p className="text-xs text-slate-500">هزینه واقعی ثبت‌شده</p><p className="mt-2 font-black">{formatNumber(budgetTotals.actual)} ریال</p></Card></div><Card className="p-4"><div className="grid gap-3 md:grid-cols-[180px_1fr_180px_auto]"><input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="سرفصل" value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })} /><input className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="شرح هزینه" value={budgetForm.description} onChange={(e) => setBudgetForm({ ...budgetForm, description: e.target.value })} /><input type="number" min="0" className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="برآورد (ریال)" value={budgetForm.estimatedAmount} onChange={(e) => setBudgetForm({ ...budgetForm, estimatedAmount: e.target.value })} /><Button isLoading={busy === 'budget-add'} onClick={addBudget}><Plus className="h-4 w-4" /> افزودن</Button></div></Card><div className="grid gap-3 md:grid-cols-2">{project.budgetItems?.map((item) => <Card key={item.id} className="flex flex-wrap items-center gap-4 p-4"><span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><Banknote className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-500">{item.category}</p><p className="mt-1 font-bold text-slate-900">{item.description}</p><p className="mt-1 text-xs text-slate-500">واقعی: {item.actualAmount == null ? 'ثبت نشده' : `${formatNumber(Number(item.actualAmount))} ریال`}</p></div><div className="text-left"><p className="font-black">{formatNumber(Number(item.estimatedAmount))}</p><p className="text-xs text-slate-400">برآورد ریال</p><button onClick={() => setActualBudget(item)} disabled={busy === `budget-${item.id}`} className="mt-2 text-xs font-bold text-violet-700 disabled:opacity-50">ثبت هزینه واقعی</button></div></Card>)}</div>{!project.budgetItems?.length && <Card className="p-10 text-center text-sm text-slate-500">ردیف بودجه‌ای ثبت نشده است.</Card>}</section>}
  </main></ProtectedLayout>;
}
