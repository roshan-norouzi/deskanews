'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, Clock3, Copy, Globe2, Pencil, Plus, Save, Settings2, Share2, Star, TestTube2, Trash2, Upload } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { CoverTemplateBuilder, parseTemplate, parseTemplateLibrary, type CoverDemoArticle, type CoverFont, type CoverTemplateLibrary } from '@/components/publishing/cover-template-builder';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useApi } from '@/hooks/use-api';
import { useTenant } from '@/lib/tenant-context';
import { ApiError, apiFetch } from '@/lib/utils';
import {
  DESTINATION_PLATFORM_ORDER,
  DESTINATION_PLATFORMS,
  destinationConnectionKeys,
  destinationPublishFields,
  destinationSecretKeys,
  destinationSiteUrlKey,
  resolveDestinationPlatform,
} from '@/lib/destination-platforms';

type Settings = Record<string, string>;
type ActiveTab = 'social' | 'news';
type WordPressCategory = { id: number; name: string; slug: string; parent: number };
type DestinationCategoryRow = {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'approved' | 'rejected' | 'stale';
  isGeneral: boolean;
  externalId: string;
  parentExternalId: string;
  serviceUrl: string;
  rssUrl: string;
};

type DestinationCategoryDraft = {
  name: string;
  serviceUrl: string;
  rssUrl: string;
};

const EMPTY_CATEGORY_DRAFT: DestinationCategoryDraft = { name: '', serviceUrl: '', rssUrl: '' };

type DestinationCategorySyncChanges = {
  added: Array<{ externalId: string; name: string }>;
  updated: Array<{ externalId: string; name: string; previousName?: string }>;
  removed: Array<{ externalId: string; name: string }>;
};

const DESTINATION_CATEGORY_STATUS_META: Record<DestinationCategoryRow['status'], { label: string; className: string }> = {
  pending: { label: 'در انتظار تأیید', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  approved: { label: 'تأیید شده', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  rejected: { label: 'رد شده', className: 'border-red-200 bg-red-50 text-red-700' },
  stale: { label: 'منقضی', className: 'border-slate-200 bg-slate-100 text-slate-600' },
};
const SETTINGS_DRAFT_KEY = 'deska_publishing_settings_draft';
const SETTINGS_DRAFT_VERSION = 2;
const MAX_COVER_TEMPLATES = 20;
const SECRET_SETTING_KEYS = new Set(['gapgpt_api_key', 'wp_app_password', 'is_password', 'ns_password', 'telegram_bot_token', 'social_instagram_access_token', 'social_linkedin_access_token', 'social_facebook_page_access_token']);

function sanitizeDraft(values: Settings): Settings {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !SECRET_SETTING_KEYS.has(key) && !key.endsWith('_configured')),
  );
}

function readAllSettingsDrafts(): Record<string, Settings> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SETTINGS_DRAFT_KEY) || '{}');
    if (parsed?.version !== SETTINGS_DRAFT_VERSION || !parsed.drafts || typeof parsed.drafts !== 'object' || Array.isArray(parsed.drafts)) {
      return {};
    }
    return parsed.drafts as Record<string, Settings>;
  } catch {
    return {};
  }
}

function readSettingsDraft(tenantId: string | null): Settings {
  if (!tenantId) return {};
  const values = readAllSettingsDrafts()[tenantId];
  return values && typeof values === 'object' && !Array.isArray(values) ? values : {};
}

function writeSettingsDraft(tenantId: string | null, values: Settings) {
  if (typeof window === 'undefined' || !tenantId) return;
  try {
    const drafts = readAllSettingsDrafts();
    drafts[tenantId] = sanitizeDraft(values);
    window.sessionStorage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify({ version: SETTINGS_DRAFT_VERSION, drafts }));
  } catch {
    // Session storage can be disabled or full; the in-memory form still works.
  }
}

function parseFontLibrary(value?: string): CoverFont[] {
  try {
    const fonts = JSON.parse(value || '[]');
    if (Array.isArray(fonts)) {
      const normalized = fonts.map((font, index) => {
        const item = typeof font === 'string' ? { id: `legacy-${index}`, name: font.trim() } : font;
        const variant = String(item?.variant || 'regular');
        const weights: Record<string, number> = { thin: 100, 'extra-light': 200, light: 300, regular: 400, medium: 500, 'semi-bold': 600, bold: 700, 'extra-bold': 800, black: 900 };
        return { id: String(item?.id || `font-${index}`), name: String(item?.name || '').trim(), variant, weight: Number(item?.weight) || weights[variant] || 400, url: item?.url ? String(item.url) : undefined };
      }).filter((font) => font.name);
      if (normalized.length) return normalized.filter((font) => font.name === 'Vazirmatn' || font.url);
    }
  } catch { /* Older settings did not have a font library. */ }
  return [{ id: 'vazirmatn', name: 'Vazirmatn' }];
}

// These flags are returned by the API only to describe whether a secret is
// already stored. They are read-only metadata and must never be submitted
// back to the strict settings DTO.
function editableSettings(values: Settings): Settings {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !key.endsWith('_configured')),
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-slate-700">{label}{children}{hint && <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span>}</label>;
}

function parseWordPressCategories(value?: string): WordPressCategory[] {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((category) => ({
      id: Number(category?.id),
      name: String(category?.name || '').trim(),
      slug: String(category?.slug || '').trim(),
      parent: Number(category?.parent || 0),
    })).filter((category) => Number.isSafeInteger(category.id) && category.id > 0 && category.name);
  } catch { return []; }
}

function AutomationToggle({ title, description, enabled, onChange }: { title: string; description: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={enabled} onClick={() => onChange(!enabled)} className={`flex items-center justify-between gap-4 rounded-2xl border p-4 text-right transition ${enabled ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><span><span className="block font-semibold text-slate-900">{title}</span><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{description}</span></span><span className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? 'bg-emerald-600' : 'bg-slate-300'}`} aria-hidden="true"><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? 'right-6' : 'right-1'}`} /></span></button>;
}

function FontLibrary({ value, onChange }: { value: CoverFont[]; onChange: (fonts: CoverFont[]) => void }) {
  const variants = [
    ['thin', 'Thin · خیلی نازک'], ['extra-light', 'Extra Light · نازک'], ['light', 'Light · سبک'], ['regular', 'Regular · معمولی'], ['medium', 'Medium · متوسط'], ['semi-bold', 'Semi Bold · نیمه‌ضخیم'], ['bold', 'Bold · ضخیم'], ['extra-bold', 'Extra Bold · خیلی ضخیم'], ['black', 'Black · مشکی'],
  ] as const;
  const variantLabel = (variant?: string) => variants.find(([id]) => id === variant)?.[1] || 'Regular · معمولی';
  const [name, setName] = useState('');
  const [variant, setVariant] = useState<(typeof variants)[number][0]>('regular');
  const [familyVariants, setFamilyVariants] = useState<Record<string, string>>({});
  const [editingFamily, setEditingFamily] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const families = Array.from(value.reduce((groups, font) => {
    const key = font.name.toLocaleLowerCase('en-US');
    const current = groups.get(key) || { name: font.name, fonts: [] as CoverFont[] };
    current.fonts.push(font); groups.set(key, current);
    return groups;
  }, new Map<string, { name: string; fonts: CoverFont[] }>() ).values());
  async function upload(file: File, familyName = name, selectedVariant: string = variant) {
    const finalName = familyName.trim() || file.name.replace(/\.[^.]+$/, '');
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file', file); form.append('name', finalName); form.append('variant', selectedVariant);
      const font = await apiFetch<CoverFont>('/publishing/settings/fonts', { method: 'POST', body: form });
      onChange([...value.filter((item) => item.id !== font.id && !(item.name.toLocaleLowerCase('en-US') === font.name.toLocaleLowerCase('en-US') && item.variant === font.variant)), font]); setName('');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'بارگذاری فونت انجام نشد');
    } finally { setBusy(false); }
  }
  async function remove(id: string) { setBusy(true); setError(''); try { await apiFetch(`/publishing/settings/fonts/${id}`, { method: 'DELETE' }); onChange(value.filter((font) => font.id !== id)); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'حذف فونت انجام نشد'); } finally { setBusy(false); } }
  async function renameFamily(family: { name: string; fonts: CoverFont[] }) {
    const nextName = renameDraft.trim();
    if (!nextName || nextName === family.name) { setEditingFamily(null); return; }
    setBusy(true); setError('');
    try {
      const fonts = await apiFetch<CoverFont[]>(`/publishing/settings/fonts/${family.fonts[0].id}`, { method: 'PATCH', body: { name: nextName } });
      onChange(fonts); setEditingFamily(null); setRenameDraft('');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'ویرایش نام فونت انجام نشد');
    } finally { setBusy(false); }
  }
  return <div className="mt-6 space-y-5">
    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><h3 className="font-bold text-slate-900">ایجاد خانواده فونت</h3><p className="mt-1 text-sm leading-6 text-slate-600">نام خانواده را وارد کنید، Variant فایل را انتخاب کنید و آن را بارگذاری کنید. بعداً می‌توانید Variantهای دیگر همین خانواده را اضافه یا جایگزین کنید.</p><div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_auto]"><input dir="ltr" className="min-w-0 rounded-xl border bg-white px-3 py-2.5" placeholder="نام خانواده فونت" value={name} onChange={(e) => setName(e.target.value)} /><select className="rounded-xl border bg-white px-3 py-2.5 text-sm" value={variant} onChange={(e) => setVariant(e.target.value as typeof variant)}>{variants.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Upload className="h-4 w-4" /> آپلود فایل<input type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" className="hidden" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = ''; }} /></label></div><p className="mt-2 text-xs text-slate-500">فقط فایل‌های woff2، woff، ttf و otf تا حجم ۱۰ مگابایت پذیرفته می‌شوند.</p></div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{families.map((family) => { const isBuiltin = family.fonts.some((font) => font.id === 'vazirmatn'); const nextVariant = familyVariants[family.name] || 'regular'; const isEditing = editingFamily === family.name; return <div key={family.name} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg font-bold text-slate-700">آ</span><div className="min-w-0 flex-1">{isEditing ? <div className="flex gap-1"><input autoFocus dir="ltr" className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void renameFamily(family); if (event.key === 'Escape') setEditingFamily(null); }} /><button type="button" className="rounded-lg bg-violet-600 px-2 text-xs text-white" disabled={busy} onClick={() => void renameFamily(family)}>ثبت</button></div> : <p className="truncate font-semibold" dir="ltr">{family.name}</p>}<p className="text-xs text-slate-500">{isBuiltin ? 'فونت پیش‌فرض سیستم' : `${family.fonts.length} Variant`}</p></div>{!isBuiltin && !isEditing && <button type="button" title="ویرایش نام خانواده فونت" aria-label="ویرایش نام خانواده فونت" className="rounded-lg p-2 text-violet-700 hover:bg-violet-50" onClick={() => { setRenameDraft(family.name); setEditingFamily(family.name); }}><Pencil className="h-4 w-4" /></button>}</div><div className="mt-3 flex flex-wrap gap-2">{family.fonts.sort((a, b) => (a.weight || 400) - (b.weight || 400)).map((font) => <span key={font.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{variantLabel(font.variant)}{!isBuiltin && <button type="button" disabled={busy} className="mr-1 text-red-600" aria-label={`حذف ${font.variant}`} onClick={() => void remove(font.id)}>×</button>}</span>)}</div>{!isBuiltin && <div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><select className="rounded-lg border px-2 py-2 text-xs" value={nextVariant} onChange={(e) => setFamilyVariants((current) => ({ ...current, [family.name]: e.target.value }))}>{variants.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"><Upload className="h-3.5 w-3.5" /> افزودن فایل<input type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" className="hidden" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, family.name, nextVariant); e.currentTarget.value = ''; }} /></label></div>}</div>; })}</div>
  </div>;
}

export default function PublishingSettingsPage() {
  const { activeTenantId } = useTenant();
  const { data } = useApi<Settings>(activeTenantId ? '/publishing/settings' : null, { cache: 'no-store' });
  const { data: socialArticles } = useApi<CoverDemoArticle[]>(activeTenantId ? '/publishing/social/articles' : null);
  const [values, setValues] = useState<Settings>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('news');
  const [subTab, setSubTab] = useState('schedule');
  const [subTabs, setSubTabs] = useState<Record<ActiveTab, string>>({
    social: 'monitor',
    news: 'schedule',
  });
  const hasLocalEdits = useRef(false);
  const hasSavedInSession = useRef(false);
  const loadedTenantId = useRef<string | null>(null);
  const [selectedCoverTemplateId, setSelectedCoverTemplateId] = useState('');
  const [destinationCategoryRows, setDestinationCategoryRows] = useState<DestinationCategoryRow[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<DestinationCategoryDraft>(EMPTY_CATEGORY_DRAFT);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryDraft, setEditingCategoryDraft] = useState<DestinationCategoryDraft>(EMPTY_CATEGORY_DRAFT);
  const coverTemplateLibrary = useMemo(
    () => parseTemplateLibrary(values.social_image_templates, values.social_image_template),
    [values.social_image_template, values.social_image_templates],
  );
  const selectedCoverTemplate = coverTemplateLibrary.templates.find((item) => item.id === selectedCoverTemplateId)
    || coverTemplateLibrary.templates.find((item) => item.id === coverTemplateLibrary.defaultTemplateId)
    || coverTemplateLibrary.templates[0];
  const wordpressCategories = useMemo(() => parseWordPressCategories(values.wp_categories), [values.wp_categories]);
  const destinationPlatform = resolveDestinationPlatform(values.destination_platform);
  const destinationMeta = DESTINATION_PLATFORMS[destinationPlatform];
  const destinationKeys = useMemo(() => destinationConnectionKeys(destinationPlatform), [destinationPlatform]);
  const destinationSiteUrlSettingKey = destinationSiteUrlKey(destinationPlatform);
  const destinationPublishOnlyFields = useMemo(() => destinationPublishFields(destinationPlatform), [destinationPlatform]);
  const pendingDestinationCategories = useMemo(
    () => destinationCategoryRows.filter((row) => row.status === 'pending' && !row.isGeneral),
    [destinationCategoryRows],
  );
  const staleDestinationCategories = useMemo(
    () => destinationCategoryRows.filter((row) => row.status === 'stale' && !row.isGeneral),
    [destinationCategoryRows],
  );

  const loadDestinationCategories = useCallback(async () => {
    if (!activeTenantId) {
      setDestinationCategoryRows([]);
      return;
    }
    try {
      const rows = await apiFetch<DestinationCategoryRow[]>('/publishing/destination/categories');
      setDestinationCategoryRows(Array.isArray(rows) ? rows : []);
    } catch {
      setDestinationCategoryRows([]);
    }
  }, [activeTenantId]);

  useEffect(() => {
    if (loadedTenantId.current === activeTenantId) return;
    loadedTenantId.current = activeTenantId;
    hasLocalEdits.current = false;
    hasSavedInSession.current = false;
    setValues({});
    setDestinationCategoryRows([]);
    setCategoryDraft(EMPTY_CATEGORY_DRAFT);
    setEditingCategoryId(null);
    setEditingCategoryDraft(EMPTY_CATEGORY_DRAFT);
    setMessage('');
    setError('');
  }, [activeTenantId]);

  useEffect(() => {
    if (activeTab === 'news' && subTab === 'destination') {
      void loadDestinationCategories();
    }
  }, [activeTab, subTab, destinationPlatform, loadDestinationCategories]);

  useEffect(() => {
    // The first GET may finish after a save. Once this form has received a
    // confirmed PUT response, never let an older GET overwrite it.
    if (data && loadedTenantId.current === activeTenantId && !hasLocalEdits.current && !hasSavedInSession.current) {
      setValues({ ...data, ...readSettingsDraft(activeTenantId) });
    }
  }, [data, activeTenantId]);
  useEffect(() => {
    if (!coverTemplateLibrary.templates.some((item) => item.id === selectedCoverTemplateId)) {
      setSelectedCoverTemplateId(coverTemplateLibrary.defaultTemplateId || coverTemplateLibrary.templates[0]?.id || '');
    }
  }, [coverTemplateLibrary, selectedCoverTemplateId]);
  const set = (key: string, value: string) => {
    hasLocalEdits.current = true;
    setValues((current) => {
      const next = { ...current, [key]: value };
      // Keep only fields the user has actually edited. This prevents an old
      // draft for one tab from masking newer server values in other tabs.
      writeSettingsDraft(activeTenantId, { ...readSettingsDraft(activeTenantId), [key]: value });
      return next;
    });
  };

  function setCoverTemplateLibrary(library: CoverTemplateLibrary) {
    set('social_image_templates', JSON.stringify(library));
  }

  function addCoverTemplate(copyCurrent = false) {
    if (coverTemplateLibrary.templates.length >= MAX_COVER_TEMPLATES) {
      setError(`حداکثر ${MAX_COVER_TEMPLATES} قالب تصویری می‌توانید داشته باشید.`);
      return;
    }
    if (copyCurrent && !selectedCoverTemplate) return;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `template-${Date.now()}`;
    const template = copyCurrent && selectedCoverTemplate
      ? JSON.parse(JSON.stringify(selectedCoverTemplate.template))
      : JSON.parse(JSON.stringify(parseTemplate('')));
    const baseName = copyCurrent ? `${selectedCoverTemplate?.name || 'قالب'} - کپی` : `قالب جدید ${coverTemplateLibrary.templates.length + 1}`;
    const existingNames = new Set(coverTemplateLibrary.templates.map((item) => item.name.trim().toLocaleLowerCase('fa')));
    let name = baseName;
    let suffix = 2;
    while (existingNames.has(name.toLocaleLowerCase('fa'))) name = `${baseName} (${suffix++})`;
    const next = { id, name, template };
    setCoverTemplateLibrary({ ...coverTemplateLibrary, templates: [...coverTemplateLibrary.templates, next] });
    setSelectedCoverTemplateId(id);
    setError('');
    if (copyCurrent) setMessage(`قالب «${selectedCoverTemplate?.name}» تکثیر شد؛ نسخه جدید را ویرایش و سپس ذخیره کنید.`);
  }

  async function createCoverTemplateFromSample(file?: File) {
    if (!file) return;
    if (coverTemplateLibrary.templates.length >= MAX_COVER_TEMPLATES) {
      setError(`حداکثر ${MAX_COVER_TEMPLATES} قالب تصویری می‌توانید داشته باشید.`);
      return;
    }
    setBusy('cover-from-sample');
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await apiFetch<{ name: string; template: Record<string, unknown>; usedAi: boolean }>('/publishing/settings/cover-templates/from-sample', {
        method: 'POST',
        body: form,
      });
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `template-${Date.now()}`;
      const existingNames = new Set(coverTemplateLibrary.templates.map((item) => item.name.trim().toLocaleLowerCase('fa')));
      let name = result.name || 'قالب از تصویر نمونه';
      let suffix = 2;
      while (existingNames.has(name.toLocaleLowerCase('fa'))) name = `${result.name || 'قالب از تصویر نمونه'} (${suffix++})`;
      const template = parseTemplate(JSON.stringify(result.template || {}));
      setCoverTemplateLibrary({ ...coverTemplateLibrary, templates: [...coverTemplateLibrary.templates, { id, name, template }] });
      setSelectedCoverTemplateId(id);
      setMessage(result.usedAi
        ? 'قالب از تصویر نمونه ساخته شد؛ لایه‌ها را بررسی و در صورت نیاز اصلاح کنید، سپس ذخیره کنید.'
        : 'قالب پایه از تصویر نمونه ساخته شد. لایه‌ها را مطابق تصویر اصلاح و سپس ذخیره کنید.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'ساخت قالب از تصویر نمونه انجام نشد');
    } finally {
      setBusy(null);
    }
  }

  function updateSelectedCoverTemplate(patch: Partial<(typeof coverTemplateLibrary.templates)[number]>) {
    if (!selectedCoverTemplate) return;
    setCoverTemplateLibrary({ ...coverTemplateLibrary, templates: coverTemplateLibrary.templates.map((item) => item.id === selectedCoverTemplate.id ? { ...item, ...patch } : item) });
  }

  function removeSelectedCoverTemplate() {
    if (!selectedCoverTemplate || coverTemplateLibrary.templates.length <= 1) return;
    if (!window.confirm(`قالب «${selectedCoverTemplate.name}» حذف شود؟`)) return;
    const templates = coverTemplateLibrary.templates.filter((item) => item.id !== selectedCoverTemplate.id);
    const defaultTemplateId = coverTemplateLibrary.defaultTemplateId === selectedCoverTemplate.id ? templates[0].id : coverTemplateLibrary.defaultTemplateId;
    setCoverTemplateLibrary({ ...coverTemplateLibrary, defaultTemplateId, templates });
    setSelectedCoverTemplateId(defaultTemplateId);
  }

  async function run(kind: string, operation: () => Promise<unknown>, success: string) {
    setBusy(kind); setError(''); setMessage('');
    try { await operation(); setMessage(success); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'عملیات انجام نشد'); }
    finally { setBusy(null); }
  }

  const tabKeys: Record<ActiveTab, string[]> = {
    social: ['social_poll_interval_minutes', 'social_max_age_days', 'social_auto_poll', 'social_auto_prepare', 'social_auto_generate_image', 'social_auto_image_template_id', 'social_auto_publish_telegram', 'social_auto_publish_instagram', 'social_auto_publish_linkedin', 'social_auto_publish_facebook', 'social_caption_template', 'social_image_template', 'social_image_templates', 'social_font_library'],
    news: ['news_poll_interval_minutes', 'news_max_age_days', 'news_auto_poll', 'news_auto_prepare', 'news_auto_publish', 'news_auto_send_social'],
  };

  function selectTab(tab: ActiveTab) {
    setActiveTab(tab);
    setSubTab(subTabs[tab]);
  }

  async function testDestinationConnection() {
    setBusy('destination'); setError(''); setMessage('');
    try {
      const body = editableSettings(Object.fromEntries(destinationKeys.map((key) => [key, values[key] ?? ''])));
      body.destination_platform = destinationPlatform;
      const response = await apiFetch<{ ok: true; message?: string; categories?: WordPressCategory[] }>('/publishing/settings/test-wordpress', {
        method: 'POST',
        body,
      });
      if (destinationPlatform === 'wordpress') {
        const categories = Array.isArray(response.categories) ? response.categories : [];
        set('wp_categories', JSON.stringify(categories));
        if (values.wp_category_id && !categories.some((category) => String(category.id) === values.wp_category_id)) set('wp_category_id', '');
        setMessage(`${response.message || 'اتصال WordPress تأیید شد'}. برای نگهداری فهرست دسته‌بندی‌ها، تنظیمات را ذخیره کنید.`);
      } else {
        setMessage(response.message || `اتصال ${destinationMeta.label} تأیید شد.`);
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : `آزمایش اتصال ${destinationMeta.label} انجام نشد`);
    } finally { setBusy(null); }
  }

  async function syncDestinationCategories() {
    const siteUrl = values[destinationSiteUrlSettingKey]?.trim();
    if (!siteUrl) {
      setError('آدرس سایت مقصد را وارد کنید');
      return;
    }
    setBusy('category-sync'); setError(''); setMessage('');
    try {
      const result = await apiFetch<{ ok: true; synced: number; categories: DestinationCategoryRow[]; changes?: DestinationCategorySyncChanges }>('/publishing/destination/categories/sync', {
        method: 'POST',
        body: { siteUrl },
      });
      setDestinationCategoryRows(Array.isArray(result.categories) ? result.categories : []);
      const changes = result.changes || { added: [], updated: [], removed: [] };
      const parts = [
        `${result.synced} دسته اصلی از سایت دریافت شد`,
        changes.added.length ? `${changes.added.length} پیشنهاد افزودن` : '',
        changes.updated.length ? `${changes.updated.length} پیشنهاد ویرایش` : '',
        changes.removed.length ? `${changes.removed.length} پیشنهاد حذف (منقضی)` : '',
      ].filter(Boolean);
      setMessage(parts.join('؛ '));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'همگام‌سازی دسته‌بندی‌ها انجام نشد');
    } finally { setBusy(null); }
  }

  async function bulkDeleteStaleDestinationCategories() {
    setBusy('category-delete-stale'); setError('');
    try {
      const result = await apiFetch<{ ok: true; deleted: number }>('/publishing/destination/categories/bulk-delete-stale', { method: 'POST' });
      await loadDestinationCategories();
      setMessage(result.deleted ? `${result.deleted} دسته منقضی حذف شد.` : 'دسته منقضی‌ای برای حذف نبود.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'حذف دسته‌های منقضی انجام نشد');
    } finally { setBusy(null); }
  }

  async function updateDestinationCategoryStatus(id: string, status: 'approved' | 'rejected') {
    setBusy(`category-${id}`); setError('');
    try {
      const updated = await apiFetch<DestinationCategoryRow & { deleted?: boolean }>(`/publishing/destination/categories/${id}/status`, { method: 'PATCH', body: { status } });
      if (status === 'rejected' || updated.deleted) {
        setDestinationCategoryRows((current) => current.filter((row) => row.id !== id));
        if (editingCategoryId === id) {
          setEditingCategoryId(null);
          setEditingCategoryDraft(EMPTY_CATEGORY_DRAFT);
        }
        setMessage('سرویس اشتباه حذف شد.');
        return;
      }
      setDestinationCategoryRows((current) => current.map((row) => (row.id === id ? { ...row, ...updated } : row)));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'به‌روزرسانی دسته‌بندی انجام نشد');
    } finally { setBusy(null); }
  }

  function startEditingDestinationCategory(category: DestinationCategoryRow) {
    setEditingCategoryId(category.id);
    setEditingCategoryDraft({
      name: category.name,
      serviceUrl: category.serviceUrl || '',
      rssUrl: category.rssUrl || '',
    });
  }

  async function saveDestinationCategoryEdit(id: string) {
    if (!editingCategoryDraft.name.trim()) {
      setError('نام سرویس الزامی است');
      return;
    }
    setBusy(`category-edit-${id}`); setError('');
    try {
      const updated = await apiFetch<DestinationCategoryRow>(`/publishing/destination/categories/${id}`, {
        method: 'PATCH',
        body: editingCategoryDraft,
      });
      setDestinationCategoryRows((current) => current.map((row) => (row.id === id ? updated : row)));
      setEditingCategoryId(null);
      setEditingCategoryDraft(EMPTY_CATEGORY_DRAFT);
      setMessage('سرویس به‌روزرسانی شد.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'ویرایش سرویس انجام نشد');
    } finally { setBusy(null); }
  }

  async function createDestinationCategory() {
    if (!categoryDraft.name.trim()) {
      setError('نام سرویس الزامی است');
      return;
    }
    setBusy('category-create'); setError('');
    try {
      const created = await apiFetch<DestinationCategoryRow>('/publishing/destination/categories', {
        method: 'POST',
        body: categoryDraft,
      });
      setDestinationCategoryRows((current) => [...current, created].sort((a, b) => Number(b.isGeneral) - Number(a.isGeneral) || a.name.localeCompare(b.name, 'fa')));
      setCategoryDraft(EMPTY_CATEGORY_DRAFT);
      setMessage('سرویس جدید اضافه شد.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'افزودن سرویس انجام نشد');
    } finally { setBusy(null); }
  }

  async function bulkApproveDestinationCategories() {
    if (!pendingDestinationCategories.length) return;
    setBusy('category-bulk'); setError(''); setMessage('');
    try {
      const result = await apiFetch<{ ok: true; approved: number }>('/publishing/destination/categories/bulk-approve', {
        method: 'POST',
        body: { ids: pendingDestinationCategories.map((row) => row.id) },
      });
      await loadDestinationCategories();
      setMessage(`${result.approved} دسته در انتظار تأیید شد.`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'تأیید گروهی دسته‌بندی‌ها انجام نشد');
    } finally { setBusy(null); }
  }

  function selectSubTab(tab: string) {
    setSubTab(tab);
    setSubTabs((current) => ({ ...current, [activeTab]: tab }));
  }

  async function saveTab(tab: ActiveTab) {
    await run('save', async () => {
      const keys = tab === 'social'
        ? subTab === 'monitor' ? ['social_poll_interval_minutes', 'social_max_age_days', 'social_auto_poll', 'social_auto_prepare', 'social_auto_generate_image', 'social_auto_image_template_id', 'social_auto_publish_telegram', 'social_auto_publish_instagram', 'social_auto_publish_linkedin', 'social_auto_publish_facebook']
          : subTab === 'caption' ? ['social_caption_template']
          : subTab === 'image' ? ['social_image_templates']
              : subTab === 'networks' ? ['telegram_bot_token', 'telegram_chat_id', 'telegram_bridge_url', 'social_instagram_access_token', 'social_instagram_account_id', 'social_instagram_api_version', 'social_linkedin_access_token', 'social_linkedin_author_urn', 'social_linkedin_api_version', 'social_facebook_page_access_token', 'social_facebook_page_id', 'social_facebook_api_version', 'social_public_media_base_url']
                : ['social_font_library']
        : tab === 'news'
          ? subTab === 'schedule' ? ['news_poll_interval_minutes', 'news_max_age_days', 'news_auto_poll', 'news_auto_prepare', 'news_auto_publish', 'news_auto_send_social']
            : ['destination_platform', ...destinationKeys]
          : tabKeys[tab];
      const body = Object.fromEntries(keys.map((key) => [key, values[key] ?? '']));
      const saved = await apiFetch<Settings>('/publishing/settings', { method: 'PUT', body: editableSettings(body) });
      // Keep the confirmed server response in the form immediately; a late
      // initial GET must not overwrite values just saved by the user.
      hasLocalEdits.current = false;
      hasSavedInSession.current = true;
      setValues((current) => {
        const merged = { ...current, ...saved };
        // The API intentionally never returns secret values. Keep the value
        // just entered visible in this session while the configured flag
        // confirms that it is safely stored server-side.
        for (const key of SECRET_SETTING_KEYS) {
          if (current[key] && !saved[key]) merged[key] = current[key];
        }
        return merged;
      });
      const draft = readSettingsDraft(activeTenantId);
      for (const key of keys) delete draft[key];
      writeSettingsDraft(activeTenantId, draft);
    }, 'تنظیمات این بخش با موفقیت ذخیره شد.');
  }

  async function testSocial(network: 'telegram' | 'instagram' | 'linkedin' | 'facebook') {
    const keys = network === 'telegram'
      ? ['telegram_bot_token', 'telegram_chat_id', 'telegram_bridge_url']
      : network === 'instagram'
        ? ['social_instagram_access_token', 'social_instagram_account_id', 'social_instagram_api_version']
        : network === 'linkedin'
          ? ['social_linkedin_access_token', 'social_linkedin_author_urn', 'social_linkedin_api_version']
          : ['social_facebook_page_access_token', 'social_facebook_page_id', 'social_facebook_api_version'];
    await run(`test-${network}`, () => apiFetch(`/publishing/settings/test-social/${network}`, { method: 'POST', body: editableSettings(Object.fromEntries(keys.map((key) => [key, values[key] ?? '']))) }), `اتصال ${network === 'telegram' ? 'تلگرام' : network === 'instagram' ? 'اینستاگرام' : network === 'linkedin' ? 'لینکدین' : 'فیسبوک'} با موفقیت تأیید شد.`);
  }

  return (
    <ProtectedLayout title="تنظیمات انتشار" ownerOnly>
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6" dir="rtl">
        <PageHeader
          title="تنظیمات انتشار"
          description="پیش‌فرض‌های پایش خبر، اتصال سایت مقصد، شبکه‌های اجتماعی و قالب‌های استودیو — مخصوص این سازمان."
          icon={Settings2}
        />

        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{message}</div>}

        <nav role="tablist" className="grid grid-cols-2 gap-2 rounded-2xl border bg-white p-2 shadow-sm" aria-label="دسته‌بندی تنظیمات">
          {([['news', 'پایش خبر', Clock3], ['social', 'استودیوی اجتماعی', Share2]] as const).map(([tab, label, Icon]) => <button role="tab" type="button" key={tab} onClick={() => selectTab(tab)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition ${activeTab === tab ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1}><Icon className="h-4 w-4" />{label}</button>)}
        </nav>

        {(activeTab === 'social' || activeTab === 'news') && <nav role="tablist" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2" aria-label="زیرمجموعه تنظیمات">
          {(activeTab === 'social' ? [['monitor', 'پایش فیدها'], ['caption', 'قالب کپشن'], ['image', 'قالب تصویری'], ['networks', 'شبکه‌های اجتماعی'], ['fonts', 'کتابخانه فونت']] : [['schedule', 'پیش‌فرض پایش خبر'], ['destination', 'اتصال سایت مقصد']]).map(([tab, label]) => <button role="tab" type="button" key={tab} onClick={() => selectSubTab(tab)} className={`rounded-xl px-4 py-2 text-sm font-medium transition ${subTab === tab ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:bg-white'}`} aria-selected={subTab === tab} tabIndex={subTab === tab ? 0 : -1}>{label}</button>)}
        </nav>}

        {activeTab === 'social' && <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Share2 className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-slate-900">قالب‌های استودیوی اجتماعی</h2><p className="mt-1 text-sm text-slate-500">ساختار کپشن و دستور طراحی تصویر برای تمام مطالب اجتماعی از اینجا مدیریت می‌شود.</p></div></div>
          {subTab === 'monitor' && <div className="mt-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="فاصله پایش فیدهای اجتماعی (دقیقه)" hint="مقدار معتبر بین ۵ تا ۱۴۴۰ دقیقه است."><input type="number" min="5" max="1440" inputMode="numeric" dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.social_poll_interval_minutes || '240'} onChange={(e) => set('social_poll_interval_minutes', e.target.value)} /></Field>
              <Field label="حداکثر قدمت مطلب اجتماعی (روز)" hint="مطالب قدیمی‌تر هنگام پایش وارد استودیو نمی‌شوند."><input type="number" min="1" max="90" inputMode="numeric" dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.social_max_age_days || '10'} onChange={(e) => set('social_max_age_days', e.target.value)} /></Field>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4"><h3 className="font-bold text-slate-900">اتوماسیون استودیوی اجتماعی</h3><p className="mt-1 text-xs leading-5 text-slate-600">هر مرحله مستقل است. در صورت فعال‌بودن تولید خودکار، تصویر قالبی پیش از انتشار ساخته می‌شود؛ در غیر این صورت تصویر شاخص منبع استفاده خواهد شد.</p><div className="mt-4 grid gap-3 md:grid-cols-2">
              <AutomationToggle title="پایش خودکار فیدها" description="فیدهای فعال طبق فاصله زمانی بالا دریافت شوند." enabled={values.social_auto_poll !== 'false'} onChange={(enabled) => set('social_auto_poll', String(enabled))} />
              <AutomationToggle title="آماده‌سازی خودکار مطالب" description="لید، خلاصه و کپشن مطالب تازه بدون کلیک کاربر آماده شود." enabled={values.social_auto_prepare === 'true'} onChange={(enabled) => set('social_auto_prepare', String(enabled))} />
              <AutomationToggle title="تولید خودکار قالب تصویری" description="پس از آماده‌شدن مطلب، تصویر نهایی با قالب انتخاب‌شده ساخته و برای انتشار خودکار استفاده شود." enabled={values.social_auto_generate_image === 'true'} onChange={(enabled) => set('social_auto_generate_image', String(enabled))} />
              <Field label="قالب پیش‌فرض تولید خودکار" hint="این انتخاب مستقل از قالب پیش‌فرض کتابخانه است و فقط برای فرایند خودکار استفاده می‌شود."><select className="rounded-xl border bg-white px-3 py-2.5" value={values.social_auto_image_template_id || coverTemplateLibrary.defaultTemplateId} disabled={values.social_auto_generate_image !== 'true'} onChange={(event) => set('social_auto_image_template_id', event.target.value)}>{coverTemplateLibrary.templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === coverTemplateLibrary.defaultTemplateId ? ' (پیش‌فرض کتابخانه)' : ''}</option>)}</select></Field>
              <AutomationToggle title="انتشار خودکار در تلگرام" description="مطالب آماده‌ای که قبلاً ارسال نشده‌اند، خودکار در تلگرام منتشر شوند." enabled={values.social_auto_publish_telegram === 'true'} onChange={(enabled) => set('social_auto_publish_telegram', String(enabled))} />
              <AutomationToggle title="انتشار خودکار در اینستاگرام" description="انتشار پس از آماده‌شدن مطلب و در صورت کامل‌بودن تنظیمات حساب." enabled={values.social_auto_publish_instagram === 'true'} onChange={(enabled) => set('social_auto_publish_instagram', String(enabled))} />
              <AutomationToggle title="انتشار خودکار در لینکدین" description="مطالب آماده و ارسال‌نشده خودکار در حساب انتخاب‌شده منتشر شوند." enabled={values.social_auto_publish_linkedin === 'true'} onChange={(enabled) => set('social_auto_publish_linkedin', String(enabled))} />
              <AutomationToggle title="انتشار خودکار در فیسبوک" description="مطالب آماده و ارسال‌نشده خودکار در صفحه انتخاب‌شده منتشر شوند." enabled={values.social_auto_publish_facebook === 'true'} onChange={(enabled) => set('social_auto_publish_facebook', String(enabled))} />
            </div></div>
          </div>}
          {subTab === 'caption' && <div className="mt-6 grid gap-5"><Field label="قالب کپشن" hint={'متغیرهای مجاز: {title}، {lead}، {author}، {category}، {reading_time}، {summary}، {link} و {source}. برای قالب‌بندی تلگرام از تگ‌های HTML مانند <b>، <i>، <u>، <a href="https://example.com"> و <code> استفاده کنید.'}><textarea dir="rtl" className="min-h-64 rounded-xl border px-3 py-3 leading-7" placeholder={'<b>{title}</b>\n\n{lead}\n\nنویسنده: {author}\nدسته‌بندی: {category}\nزمان مطالعه: {reading_time} دقیقه\n\n{summary}\n\n<a href="{link}">مطالعه مطلب</a>'} value={values.social_caption_template || ''} onChange={(e) => set('social_caption_template', e.target.value)} /></Field></div>}
          {subTab === 'image' && <div className="mt-6 grid gap-5">
            <div><h3 className="font-bold text-slate-900">کتابخانه قالب‌های تصویری</h3><p className="mt-1 text-sm leading-6 text-slate-500">چند قالب مستقل بسازید و هنگام تولید تصویر، قالب موردنظر را انتخاب کنید. تغییرات همه قالب‌ها با دکمه ذخیره پایین صفحه ثبت می‌شوند.</p></div>
            <div className="grid gap-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_auto]">
              <label className="grid gap-1 text-xs font-medium text-slate-600">قالب در حال ویرایش<select className="rounded-xl border bg-white px-3 py-2.5 text-sm" value={selectedCoverTemplate?.id || ''} onChange={(event) => setSelectedCoverTemplateId(event.target.value)}>{coverTemplateLibrary.templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === coverTemplateLibrary.defaultTemplateId ? ' (پیش‌فرض)' : ''}</option>)}</select></label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">نام قالب<input className="rounded-xl border bg-white px-3 py-2.5 text-sm" maxLength={80} value={selectedCoverTemplate?.name || ''} onChange={(event) => updateSelectedCoverTemplate({ name: event.target.value })} /></label>
              <div className="flex flex-wrap items-end gap-2">
                <Button type="button" size="sm" disabled={coverTemplateLibrary.templates.length >= MAX_COVER_TEMPLATES} onClick={() => addCoverTemplate(false)}><Plus className="h-4 w-4" /> قالب جدید</Button>
                <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50 ${busy === 'cover-from-sample' || coverTemplateLibrary.templates.length >= MAX_COVER_TEMPLATES ? 'pointer-events-none opacity-60' : ''}`}>
                  <Upload className="h-4 w-4" /> ساخت از تصویر نمونه
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" className="hidden" disabled={busy === 'cover-from-sample' || coverTemplateLibrary.templates.length >= MAX_COVER_TEMPLATES} onChange={(event) => { const file = event.target.files?.[0]; if (file) void createCoverTemplateFromSample(file); event.currentTarget.value = ''; }} />
                </label>
                <Button type="button" size="sm" variant="outline" disabled={!selectedCoverTemplate || coverTemplateLibrary.templates.length >= MAX_COVER_TEMPLATES} onClick={() => addCoverTemplate(true)}><Copy className="h-4 w-4" /> تکثیر قالب انتخاب‌شده</Button>
                <Button type="button" size="sm" variant="outline" disabled={!selectedCoverTemplate || selectedCoverTemplate.id === coverTemplateLibrary.defaultTemplateId} onClick={() => selectedCoverTemplate && setCoverTemplateLibrary({ ...coverTemplateLibrary, defaultTemplateId: selectedCoverTemplate.id })}><Star className="h-4 w-4" /> پیش‌فرض</Button>
                <Button type="button" size="sm" variant="outline" className="text-red-600" disabled={coverTemplateLibrary.templates.length <= 1} onClick={removeSelectedCoverTemplate}><Trash2 className="h-4 w-4" /> حذف</Button>
              </div>
            </div>
            <p className="text-xs leading-5 text-slate-500">یک کاور نمونه آپلود کنید تا لایه‌های تیتر، لید، منبع، پوشش و تصویر شاخص مطابق آن ساخته شوند؛ سپس موقعیت لایه‌ها را دستی اصلاح کنید.</p>
            {selectedCoverTemplate && <CoverTemplateBuilder key={selectedCoverTemplate.id} value={JSON.stringify(selectedCoverTemplate.template)} onChange={(templateValue) => updateSelectedCoverTemplate({ template: parseTemplate(templateValue) })} fontLibrary={parseFontLibrary(values.social_font_library)} demoArticle={socialArticles?.find((article) => article.authorImageUrl || article.featuredImageUrl) || socialArticles?.[0]} />}
          </div>}
          {subTab === 'networks' && <div className="mt-6 space-y-6"><div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4"><h3 className="font-bold text-slate-900">اتصال شبکه‌های اجتماعی</h3><p className="mt-1 text-sm leading-6 text-slate-600">توکن‌ها فقط در سرور و به‌صورت رمزنگاری‌شده نگهداری می‌شوند. برای حفظ اتصال قبلی، فیلد رمز را خالی بگذارید.</p></div><div className="grid gap-4 md:grid-cols-2"><Field label="توکن ربات تلگرام" hint={values.telegram_bot_token_configured === 'true' ? 'توکن قبلی ثبت شده است.' : 'توکن BotFather را وارد کنید.'}><input type="password" dir="ltr" autoComplete="new-password" className="rounded-xl border px-3 py-2.5" placeholder={values.telegram_bot_token_configured === 'true' ? 'توکن ثبت شده است' : '123456:ABC...'} value={values.telegram_bot_token || ''} onChange={(e) => set('telegram_bot_token', e.target.value)} /></Field><Field label="شناسه کانال یا گفت‌وگوی تلگرام" hint="ربات باید در کانال دسترسی ارسال داشته باشد."><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="@channel یا -100..." value={values.telegram_chat_id || ''} onChange={(e) => set('telegram_chat_id', e.target.value)} /></Field><Field label="آدرس Worker واسط تلگرام" hint="اختیاری؛ برای دورزدن محدودیت دسترسی مستقیم سرور به تلگرام استفاده می‌شود."><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="https://telegram-bridge.example.workers.dev/" value={values.telegram_bridge_url || ''} onChange={(e) => set('telegram_bridge_url', e.target.value)} /></Field></div><div className="flex justify-end"><Button variant="outline" isLoading={busy === 'test-telegram'} onClick={() => void testSocial('telegram')}><TestTube2 className="h-4 w-4" /> تست اتصال تلگرام</Button></div><div className="rounded-2xl border border-pink-100 bg-pink-50/50 p-4"><h3 className="font-bold text-slate-900">اینستاگرام</h3><p className="mt-1 text-xs leading-5 text-slate-600">نیازمند حساب Professional، شناسه Instagram Business و توکن Graph API است. آدرس عمومی تصویر برای انتشار لازم است.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Access Token اینستاگرام" hint={values.social_instagram_access_token_configured === 'true' ? 'توکن قبلی ثبت شده است.' : 'توکن را وارد کنید.'}><input type="password" dir="ltr" autoComplete="new-password" className="rounded-xl border px-3 py-2.5" placeholder={values.social_instagram_access_token_configured === 'true' ? 'توکن ثبت شده است' : 'Access token'} value={values.social_instagram_access_token || ''} onChange={(e) => set('social_instagram_access_token', e.target.value)} /></Field><Field label="شناسه حساب Instagram Business"><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="1784..." value={values.social_instagram_account_id || ''} onChange={(e) => set('social_instagram_account_id', e.target.value)} /></Field><Field label="نسخه Graph API"><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="v23.0" value={values.social_instagram_api_version || ''} onChange={(e) => set('social_instagram_api_version', e.target.value)} /></Field></div><div className="mt-3 flex justify-end"><Button variant="outline" isLoading={busy === 'test-instagram'} onClick={() => void testSocial('instagram')}><TestTube2 className="h-4 w-4" /> تست اتصال اینستاگرام</Button></div></div><div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><h3 className="font-bold text-slate-900">لینکدین</h3><p className="mt-1 text-xs leading-5 text-slate-600">شناسه نویسنده باید URN شخص یا سازمانی باشد که توکن به آن دسترسی انتشار دارد.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Access Token لینکدین" hint={values.social_linkedin_access_token_configured === 'true' ? 'توکن قبلی ثبت شده است.' : 'توکن را وارد کنید.'}><input type="password" dir="ltr" autoComplete="new-password" className="rounded-xl border px-3 py-2.5" placeholder={values.social_linkedin_access_token_configured === 'true' ? 'توکن ثبت شده است' : 'Access token'} value={values.social_linkedin_access_token || ''} onChange={(e) => set('social_linkedin_access_token', e.target.value)} /></Field><Field label="URN نویسنده یا سازمان"><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="urn:li:person:..." value={values.social_linkedin_author_urn || ''} onChange={(e) => set('social_linkedin_author_urn', e.target.value)} /></Field><Field label="نسخه API لینکدین"><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="202501" value={values.social_linkedin_api_version || ''} onChange={(e) => set('social_linkedin_api_version', e.target.value)} /></Field></div><div className="mt-3 flex justify-end"><Button variant="outline" isLoading={busy === 'test-linkedin'} onClick={() => void testSocial('linkedin')}><TestTube2 className="h-4 w-4" /> تست اتصال لینکدین</Button></div></div><div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><h3 className="font-bold text-slate-900">فیسبوک</h3><p className="mt-1 text-xs leading-5 text-slate-600">از Page Access Token و شناسه صفحه‌ای استفاده کنید که مجوز انتشار تصویر دارد.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Page Access Token فیسبوک" hint={values.social_facebook_page_access_token_configured === 'true' ? 'توکن قبلی ثبت شده است.' : 'توکن را وارد کنید.'}><input type="password" dir="ltr" autoComplete="new-password" className="rounded-xl border px-3 py-2.5" placeholder={values.social_facebook_page_access_token_configured === 'true' ? 'توکن ثبت شده است' : 'Page access token'} value={values.social_facebook_page_access_token || ''} onChange={(e) => set('social_facebook_page_access_token', e.target.value)} /></Field><Field label="شناسه صفحه فیسبوک"><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="123456789" value={values.social_facebook_page_id || ''} onChange={(e) => set('social_facebook_page_id', e.target.value)} /></Field><Field label="نسخه Graph API"><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="v23.0" value={values.social_facebook_api_version || ''} onChange={(e) => set('social_facebook_api_version', e.target.value)} /></Field></div><div className="mt-3 flex justify-end"><Button variant="outline" isLoading={busy === 'test-facebook'} onClick={() => void testSocial('facebook')}><TestTube2 className="h-4 w-4" /> تست اتصال فیسبوک</Button></div></div><Field label="آدرس عمومی فایل‌های رسانه‌ای" hint="برای اینستاگرام لازم است APIهای Meta بتوانند تصویر را از اینترنت دریافت کنند؛ در محیط محلی باید دامنه عمومی یا تونل امن تنظیم شود."><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="https://public.example.com" value={values.social_public_media_base_url || ''} onChange={(e) => set('social_public_media_base_url', e.target.value)} /></Field></div>}
          {subTab === 'fonts' && <FontLibrary value={parseFontLibrary(values.social_font_library)} onChange={(fonts) => set('social_font_library', JSON.stringify(fonts))} />}
          <div className="mt-5 flex justify-end"><Button isLoading={busy === 'save'} onClick={() => saveTab('social')}><Save className="h-4 w-4" /> ذخیره</Button></div>
        </Card>}

        {activeTab === 'news' && <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Clock3 className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-slate-900">پیش‌فرض پایش و اتوماسیون خبر</h2><p className="mt-1 text-sm text-slate-500">این مقادیر پیش‌فرض سازمان هستند. هر منبع می‌تواند در صفحه «منابع خبری» تنظیم اختصاصی داشته باشد که اولویت دارد.</p></div></div>
          {subTab === 'schedule' && <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-900">
              زمان‌بندی پایش و اتوماسیون را می‌توانید برای هر فید جداگانه در «منابع خبری → تنظیمات منبع» هم تنظیم کنید. اگر فیدی تنظیم اختصاصی داشته باشد، همان اعمال می‌شود.
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="فاصله پایش (دقیقه)" hint="مقدار معتبر بین ۵ تا ۱۴۴۰ دقیقه است."><input type="number" min="5" max="1440" inputMode="numeric" dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.news_poll_interval_minutes || '240'} onChange={(e) => set('news_poll_interval_minutes', e.target.value)} /></Field>
              <Field label="حداکثر قدمت خبر (روز)" hint="خبرهای قدیمی‌تر هنگام دریافت نادیده گرفته می‌شوند."><input type="number" min="1" max="90" inputMode="numeric" dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.news_max_age_days || '10'} onChange={(e) => set('news_max_age_days', e.target.value)} /></Field>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><h3 className="font-bold text-slate-900">اتوماسیون اتاق خبر</h3><p className="mt-1 text-xs leading-5 text-slate-600">زبان هر خبر پیش از آماده‌سازی تشخیص داده می‌شود؛ خبر فارسی بازنویسی و خبر خارجی ترجمه خواهد شد.</p><div className="mt-4 grid gap-3 md:grid-cols-2">
              <AutomationToggle title="پایش خودکار خبرها" description="فیدهای فعال طبق فاصله زمانی بالا بدون دخالت کاربر پایش شوند." enabled={values.news_auto_poll !== 'false'} onChange={(enabled) => set('news_auto_poll', String(enabled))} />
              <AutomationToggle title="آماده‌سازی خودکار خبرها" description="تیتر و خلاصه خبرهای تازه با پرامپت متناسب با زبان آماده شود." enabled={values.news_auto_prepare !== 'false'} onChange={(enabled) => set('news_auto_prepare', String(enabled))} />
              <AutomationToggle title="انتشار خودکار در سایت" description="خبر آماده مستقیماً با متن کامل پردازش‌شده به سایت مقصد ارسال شود؛ اتصال سایت باید کامل باشد." enabled={values.news_auto_publish === 'true'} onChange={(enabled) => { set('news_auto_publish', String(enabled)); if (enabled) set('news_auto_send_social', 'false'); }} />
              <AutomationToggle title="ارسال خودکار به استودیوی اجتماعی" description="خبر آماده مستقیماً برای شبکه‌های اجتماعی آماده شود؛ در این حالت به سایت مقصد ارسال نمی‌شود." enabled={values.news_auto_send_social === 'true'} onChange={(enabled) => { set('news_auto_send_social', String(enabled)); if (enabled) set('news_auto_publish', 'false'); }} />
            </div></div>
          </div>}
          <div className="mt-5 flex justify-end"><Button isLoading={busy === 'save'} onClick={() => saveTab('news')}><Save className="h-4 w-4" /> ذخیره</Button></div>
        </Card>}

        {activeTab === 'news' && subTab === 'destination' && <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><Globe2 className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-slate-900">اتصال سایت مقصد</h2><p className="mt-1 text-sm text-slate-500">استخراج دسته‌بندی‌ها فقط با آدرس سایت انجام می‌شود؛ اتصال کامل API برای انتشار در فاز بعدی است.</p></div></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {DESTINATION_PLATFORM_ORDER.map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => set('destination_platform', platform)}
                className={`rounded-2xl border p-4 text-right transition ${destinationPlatform === platform ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-100' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <span className="block font-semibold text-slate-900">{DESTINATION_PLATFORMS[platform].label}</span>
                <span className="mt-2 block text-xs leading-5 text-slate-500">{DESTINATION_PLATFORMS[platform].description}</span>
              </button>
            ))}
          </div>

          <section className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">دسته‌بندی‌های اتاق خبر</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {destinationPlatform === 'wordpress'
                    ? 'فقط دسته‌بندی‌های اصلی WordPress (بدون زیردسته) خوانده می‌شوند.'
                    : `فقط سرویس‌های اصلی منوی ${destinationMeta.label} خوانده می‌شوند؛ زیرمجموعه‌ها و لینک خبر نادیده گرفته می‌شوند.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" isLoading={busy === 'category-sync'} onClick={() => void syncDestinationCategories()}>
                  همگام‌سازی دسته‌بندی‌ها
                </Button>
                {pendingDestinationCategories.length > 0 && (
                  <Button size="sm" isLoading={busy === 'category-bulk'} onClick={() => void bulkApproveDestinationCategories()}>
                    تأیید همه ({pendingDestinationCategories.length})
                  </Button>
                )}
                {staleDestinationCategories.length > 0 && (
                  <Button size="sm" variant="outline" className="text-red-700" isLoading={busy === 'category-delete-stale'} onClick={() => void bulkDeleteStaleDestinationCategories()}>
                    حذف همه منقضی ({staleDestinationCategories.length})
                  </Button>
                )}
              </div>
            </div>
            <Field label="آدرس سایت" hint={DESTINATION_PLATFORMS[destinationPlatform].fields.find((field) => field.key === destinationSiteUrlSettingKey)?.hint}>
              <input
                dir="ltr"
                className="rounded-xl border px-3 py-2.5"
                placeholder={DESTINATION_PLATFORMS[destinationPlatform].fields.find((field) => field.key === destinationSiteUrlSettingKey)?.placeholder || 'https://example.com'}
                value={values[destinationSiteUrlSettingKey] || ''}
                onChange={(e) => {
                  set(destinationSiteUrlSettingKey, e.target.value);
                  if (destinationPlatform === 'wordpress') {
                    set('wp_categories', '[]');
                    set('wp_category_id', '');
                  }
                }}
              />
            </Field>
            <div className="mt-4 rounded-xl border border-sky-100 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">افزودن سرویس دستی</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Field label="نام سرویس">
                  <input className="rounded-xl border px-3 py-2.5" value={categoryDraft.name} onChange={(e) => setCategoryDraft((current) => ({ ...current, name: e.target.value }))} />
                </Field>
                <Field label="لینک صفحه سرویس">
                  <input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="https://example.com/fa/sport" value={categoryDraft.serviceUrl} onChange={(e) => setCategoryDraft((current) => ({ ...current, serviceUrl: e.target.value }))} />
                </Field>
                <Field label="آدرس RSS">
                  <input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="https://example.com/fa/rss/7" value={categoryDraft.rssUrl} onChange={(e) => setCategoryDraft((current) => ({ ...current, rssUrl: e.target.value }))} />
                </Field>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" isLoading={busy === 'category-create'} onClick={() => void createDestinationCategory()}>
                  <Plus className="h-4 w-4" /> افزودن سرویس
                </Button>
              </div>
            </div>
            {destinationCategoryRows.length ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-sky-100 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">نام</th>
                      <th className="px-3 py-2 text-right font-medium">لینک سرویس</th>
                      <th className="px-3 py-2 text-right font-medium">RSS</th>
                      <th className="px-3 py-2 text-right font-medium">وضعیت</th>
                      <th className="px-3 py-2 text-right font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {destinationCategoryRows.map((category) => {
                      const statusMeta = DESTINATION_CATEGORY_STATUS_META[category.status];
                      const parent = destinationCategoryRows.find((row) => row.externalId === category.parentExternalId);
                      const isEditing = editingCategoryId === category.id;
                      return (
                        <tr key={category.id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2.5 text-slate-800">
                            {isEditing ? (
                              <input className="w-full rounded-lg border px-2 py-1.5" value={editingCategoryDraft.name} onChange={(e) => setEditingCategoryDraft((current) => ({ ...current, name: e.target.value }))} />
                            ) : (
                              <>
                                {parent ? <span className="text-slate-500">{parent.name} ← </span> : null}
                                {category.name}
                                {category.isGeneral ? <span className="mr-2 text-xs text-slate-500">(پیش‌فرض)</span> : null}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {isEditing ? (
                              <input dir="ltr" className="w-full min-w-[220px] rounded-lg border px-2 py-1.5" value={editingCategoryDraft.serviceUrl} onChange={(e) => setEditingCategoryDraft((current) => ({ ...current, serviceUrl: e.target.value }))} />
                            ) : category.serviceUrl ? (
                              <a dir="ltr" href={category.serviceUrl} target="_blank" rel="noreferrer" className="break-all text-sky-700 hover:underline">{category.serviceUrl}</a>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {isEditing ? (
                              <input dir="ltr" className="w-full min-w-[220px] rounded-lg border px-2 py-1.5" value={editingCategoryDraft.rssUrl} onChange={(e) => setEditingCategoryDraft((current) => ({ ...current, rssUrl: e.target.value }))} />
                            ) : category.rssUrl ? (
                              <a dir="ltr" href={category.rssUrl} target="_blank" rel="noreferrer" className="break-all text-sky-700 hover:underline">{category.rssUrl}</a>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-medium ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {!category.isGeneral ? (
                              <div className="flex flex-wrap gap-2">
                                {isEditing ? (
                                  <>
                                    <button type="button" className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60" disabled={busy === `category-edit-${category.id}`} onClick={() => void saveDestinationCategoryEdit(category.id)}>ذخیره</button>
                                    <button type="button" className="rounded-lg border px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setEditingCategoryId(null); setEditingCategoryDraft(EMPTY_CATEGORY_DRAFT); }}>انصراف</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" className="rounded-lg border px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={() => startEditingDestinationCategory(category)}>ویرایش</button>
                                    {category.status === 'pending' ? (
                                      <>
                                        <button type="button" className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60" disabled={busy === `category-${category.id}`} onClick={() => void updateDestinationCategoryStatus(category.id, 'approved')}>تأیید</button>
                                        <button type="button" className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" disabled={busy === `category-${category.id}`} onClick={() => void updateDestinationCategoryStatus(category.id, 'rejected')}>حذف</button>
                                      </>
                                    ) : category.status === 'stale' ? (
                                      <button type="button" className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" disabled={busy === `category-${category.id}`} onClick={() => void updateDestinationCategoryStatus(category.id, 'rejected')}>حذف</button>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-600">آدرس سایت را وارد کنید و «همگام‌سازی دسته‌بندی‌ها» را بزنید.</p>
            )}
          </section>

          <section className="mt-6 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900">اتصال انتشار در سایت مقصد</h3>
              <p className="mt-1 text-sm text-slate-500">برای انتشار خودکار خبرها در فاز بعدی؛ فعلاً اختیاری است.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
            {destinationPublishOnlyFields.map((field) => {
              const configuredKey = `${field.key}_configured`;
              const isSecret = destinationSecretKeys().has(field.key);
              if (field.type === 'select' && field.options) {
                return (
                  <Field key={field.key} label={field.label} hint={field.hint}>
                    <select className="rounded-xl border px-3 py-2.5" value={values[field.key] || field.options[0]?.value || ''} onChange={(e) => set(field.key, e.target.value)}>
                      {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                );
              }
              if (field.key === 'wp_login_path') {
                return (
                  <Field key={field.key} label={field.label} hint={field.hint}>
                    <div className="flex items-center gap-2">
                      <span dir="ltr" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500">/</span>
                      <input dir="ltr" className="min-w-0 flex-1 rounded-xl border px-3 py-2.5" placeholder={field.placeholder} value={values[field.key] || 'wp-admin'} onChange={(e) => set(field.key, e.target.value.replace(/^\/+/, ''))} />
                    </div>
                  </Field>
                );
              }
              if (field.key === 'wp_category_id' && destinationPlatform === 'wordpress') {
                return (
                  <Field key={field.key} label={field.label} hint={field.hint}>
                    <select className="rounded-xl border px-3 py-2.5" value={values.wp_category_id || ''} onChange={(e) => set('wp_category_id', e.target.value)}>
                      <option value="">دسته پیش‌فرض خود WordPress</option>
                      {values.wp_category_id && !wordpressCategories.some((category) => String(category.id) === values.wp_category_id) && <option value={values.wp_category_id}>شناسه قبلی: {values.wp_category_id}</option>}
                      {destinationCategoryRows.filter((row) => row.status === 'approved' && !row.isGeneral).map((category) => {
                        const parent = destinationCategoryRows.find((row) => row.externalId === category.parentExternalId);
                        return <option key={category.id} value={category.externalId}>{parent ? `${parent.name} ← ` : ''}{category.name}</option>;
                      })}
                    </select>
                  </Field>
                );
              }
              if (field.key === 'wp_category_id') return null;
              return (
                <Field key={field.key} label={field.label} hint={isSecret && values[configuredKey] === 'true' ? 'رمز قبلی ثبت شده است؛ برای حفظ آن خالی بگذارید.' : field.hint}>
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    dir="ltr"
                    autoComplete={isSecret ? 'new-password' : field.key.includes('username') ? 'username' : 'off'}
                    className="rounded-xl border px-3 py-2.5"
                    placeholder={isSecret && values[configuredKey] === 'true' ? 'رمز ثبت شده است' : field.placeholder}
                    value={values[field.key] || ''}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                </Field>
              );
            })}
            </div>
          </section>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" isLoading={busy === 'destination'} onClick={() => void testDestinationConnection()}>
              <TestTube2 className="h-4 w-4" /> تست اتصال انتشار {destinationMeta.label}
            </Button>
            <Button isLoading={busy === 'save'} onClick={() => saveTab('news')}><Save className="h-4 w-4" /> ذخیره</Button>
          </div>
        </Card>}
      </main>
    </ProtectedLayout>
  );
}
