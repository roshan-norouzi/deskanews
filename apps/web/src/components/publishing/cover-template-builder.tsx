'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch, apiFetchBlob, cn, withBasePath } from '@/lib/utils';

type Binding = 'title' | 'lead' | 'author' | 'category' | 'reading_time' | 'summary' | 'link' | 'source' | 'custom';
type LayerType = 'featured-image' | 'author-image' | 'text' | 'image' | 'gradient';

export interface CoverLayer {
  id: string;
  name: string;
  type: LayerType;
  binding?: Binding;
  content?: string;
  imageUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  align?: 'right' | 'center' | 'left' | 'justify';
  backgroundOpacity?: number;
  borderRadius?: number;
  objectFit?: 'cover' | 'contain';
  gradientFrom?: string;
  gradientTo?: string;
  gradientFromOpacity?: number;
  gradientToOpacity?: number;
  gradientAngle?: number;
}

export interface CoverTemplate {
  version: 1;
  width: number;
  height: number;
  backgroundColor: string;
  layers: CoverLayer[];
}

export interface CoverTemplateLibraryItem {
  id: string;
  name: string;
  template: CoverTemplate;
}

export interface CoverTemplateLibrary {
  version: 1;
  defaultTemplateId: string;
  templates: CoverTemplateLibraryItem[];
}

export interface CoverFont {
  id: string;
  name: string;
  variant?: string;
  weight?: number;
  url?: string;
}

export interface CoverDemoArticle {
  title?: string;
  leadText?: string;
  author?: string;
  category?: string;
  readingTime?: number;
  summaryText?: string;
  shortUrl?: string;
  link?: string;
  featuredImageUrl?: string;
  authorImageUrl?: string;
  feed?: { name?: string };
}

const SAMPLE: Record<Binding, string> = {
  title: 'عنوان اصلی مطلب بدون تغییر',
  lead: 'یک لید کوتاه و روشن که مهم‌ترین نکتهٔ مطلب را توضیح می‌دهد.',
  author: 'نام نویسنده',
  category: 'دسته‌بندی مطلب',
  reading_time: '۵ دقیقه مطالعه',
  summary: 'خلاصهٔ دو پاراگرافی مطلب در این بخش نمایش داده می‌شود.',
  link: 'example.com/post',
  source: 'نام رسانه',
  custom: 'متن دلخواه',
};

const BINDINGS: Array<{ value: Binding; label: string }> = [
  { value: 'title', label: 'تیتر مطلب' },
  { value: 'lead', label: 'لید مطلب' },
  { value: 'author', label: 'نام نویسنده' },
  { value: 'category', label: 'دسته‌بندی' },
  { value: 'reading_time', label: 'زمان مطالعه' },
  { value: 'summary', label: 'خلاصه مطلب' },
  { value: 'source', label: 'نام منبع' },
  { value: 'link', label: 'لینک کوتاه' },
  { value: 'custom', label: 'متن دلخواه' },
];

const DEFAULT_TEMPLATE: CoverTemplate = {
  version: 1,
  width: 1080,
  height: 1080,
  backgroundColor: '#0f172a',
  layers: [
    { id: 'featured-image', name: 'تصویر شاخص', type: 'featured-image', x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 100, borderRadius: 0, objectFit: 'cover' },
    { id: 'overlay', name: 'پوشش تیره', type: 'text', binding: 'custom', content: '', x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 55, color: '#ffffff', backgroundColor: '#0f172a', fontSize: 16, fontWeight: 400, align: 'right', borderRadius: 0 },
    { id: 'title', name: 'تیتر مطلب', type: 'text', binding: 'title', x: 8, y: 48, width: 84, height: 28, visible: true, opacity: 100, color: '#ffffff', backgroundColor: 'transparent', fontSize: 46, fontWeight: 800, align: 'right', borderRadius: 0 },
    { id: 'lead', name: 'لید مطلب', type: 'text', binding: 'lead', x: 8, y: 77, width: 84, height: 14, visible: true, opacity: 100, color: '#e2e8f0', backgroundColor: 'transparent', fontSize: 24, fontWeight: 400, align: 'right', borderRadius: 0 },
    { id: 'source', name: 'نام منبع', type: 'text', binding: 'source', x: 8, y: 6, width: 40, height: 8, visible: true, opacity: 100, color: '#ffffff', backgroundColor: '#2563eb', fontSize: 20, fontWeight: 700, align: 'center', borderRadius: 18 },
  ],
};

export function parseTemplate(value: string): CoverTemplate {
  try {
    const parsed = JSON.parse(value) as CoverTemplate;
    if (parsed?.version === 1 && Array.isArray(parsed.layers)) {
      // Normalize templates saved by older versions that used logical RTL
      // values (start/end) instead of the physical left/right values used by
      // Canvas. Without this, some fields appeared mirrored when generated.
      const normalizedLayers = parsed.layers.map((layer) => {
        const legacyAlign = (layer as unknown as { align?: string }).align;
        return { ...layer, align: legacyAlign === 'start' ? 'right' : legacyAlign === 'end' ? 'left' : legacyAlign === 'justify' ? 'justify' : layer.align };
      });
      return { ...parsed, layers: normalizedLayers };
    }
  } catch { /* Old prompt-style values are upgraded to the visual default. */ }
  return DEFAULT_TEMPLATE;
}

export function parseTemplateLibrary(value?: string, legacyTemplateValue = ''): CoverTemplateLibrary {
  try {
    const parsed = JSON.parse(value || '') as CoverTemplateLibrary;
    if (parsed?.version === 1 && Array.isArray(parsed.templates) && parsed.templates.length) {
      const templates = parsed.templates.map((item, index) => ({
        id: String(item?.id || `template-${index + 1}`),
        name: String(item?.name || `قالب ${index + 1}`),
        template: parseTemplate(JSON.stringify(item?.template || {})),
      }));
      const defaultTemplateId = templates.some((item) => item.id === parsed.defaultTemplateId)
        ? parsed.defaultTemplateId
        : templates[0].id;
      return { version: 1, defaultTemplateId, templates };
    }
  } catch { /* The legacy single-template setting is migrated below. */ }
  return {
    version: 1,
    defaultTemplateId: 'default',
    templates: [{ id: 'default', name: 'قالب اصلی', template: parseTemplate(legacyTemplateValue) }],
  };
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `layer-${Date.now()}`;
}

function textFor(layer: CoverLayer, article?: CoverDemoArticle) {
  if (layer.binding === 'custom') return layer.content || SAMPLE.custom;
  const values: Record<Exclude<Binding, 'custom'>, string> = {
    title: article?.title || SAMPLE.title,
    lead: article?.leadText || SAMPLE.lead,
    author: article?.author || SAMPLE.author,
    category: article?.category || SAMPLE.category,
    reading_time: article?.readingTime ? `${article.readingTime} دقیقه مطالعه` : SAMPLE.reading_time,
    summary: article?.summaryText || SAMPLE.summary,
    link: article?.shortUrl || article?.link || SAMPLE.link,
    source: article?.feed?.name || SAMPLE.source,
  };
  return values[layer.binding as Exclude<Binding, 'custom'>] || SAMPLE.title;
}

function rgba(hex: string, opacity: number) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((value) => value + value).join('') : clean;
  const number = Number.parseInt(full, 16);
  if (!Number.isFinite(number)) return `rgba(15,23,42,${opacity / 100})`;
  return `rgba(${number >> 16},${(number >> 8) & 255},${number & 255},${opacity / 100})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundedPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  // roundRect is not available in some embedded/older Chromium builds used
  // by desktop deployments. Keep the renderer compatible with those clients.
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, r);
    return;
  }
  if (r <= 0) { context.rect(x, y, width, height); return; }
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = [];
  // Templates created by older releases may contain an unknown binding or a
  // missing content value. Rendering must degrade to text instead of calling
  // split() on undefined and aborting the whole image generation.
  const safeValue = String(value ?? '');
  for (const paragraph of safeValue.split(/\r?\n/u)) {
    const words = paragraph.split(/\s+/u).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line); line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

function rtlCanvasText(value: string) {
  // Explicit RTL embedding prevents Canvas implementations from choosing LTR
  // for mixed Persian text, numbers and Latin words.
  return `\u202B${value}\u202C`;
}

const COVER_ASSET_TIMEOUT_MS = 8_000;

async function loadCoverImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const image = new Image();
    let objectUrl = '';
    let settled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { controller.abort(); finish(null); }, COVER_ASSET_TIMEOUT_MS);
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    if (/^https?:\/\//iu.test(url)) {
      void apiFetchBlob(`/publishing/media/image?url=${encodeURIComponent(url)}`, { signal: controller.signal }).then((blob) => { if (!settled) { objectUrl = URL.createObjectURL(blob); image.src = objectUrl; } }).catch(() => finish(null));
    } else image.src = withBasePath(url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : `/${url}`}`);
  });
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, objectFit: 'cover' | 'contain', radius: number) {
  const sourceRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
  const targetRatio = width / Math.max(1, height);
  let drawWidth = width;
  let drawHeight = height;
  if (objectFit === 'cover' ? sourceRatio > targetRatio : sourceRatio < targetRatio) {
    drawWidth = height * sourceRatio;
  } else {
    drawHeight = width / sourceRatio;
  }
  roundedPath(context, x, y, width, height, radius);
  context.save(); context.clip();
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
}

async function waitWithTimeout<T>(promise: Promise<T>, timeoutMs = COVER_ASSET_TIMEOUT_MS): Promise<T | undefined> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => { timer = window.setTimeout(() => resolve(undefined), timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

/** Render the saved visual template for a real social article. */
export async function renderCoverToDataUrl(templateValue: string, article?: CoverDemoArticle, fontLibrary: CoverFont[] = []): Promise<string> {
  const template = parseTemplate(templateValue);
  // Wait for custom uploaded fonts before measuring/drawing text; otherwise
  // canvas silently falls back to a system font and line wrapping is wrong.
  if (typeof document !== 'undefined' && document.fonts) {
    const requestedFonts = Array.from(new Map(template.layers.filter((layer) => layer.type === 'text').map((layer) => {
      const family = layer.fontFamily || 'Vazirmatn';
      const requestedWeight = layer.fontWeight || 500;
      const candidates = fontLibrary.filter((font) => font.name === family && font.url);
      const registered = candidates.find((font) => font.weight === requestedWeight)
        || candidates.sort((a, b) => Math.abs((a.weight || 400) - requestedWeight) - Math.abs((b.weight || 400) - requestedWeight))[0];
      return [`${family}:${registered?.weight || requestedWeight}`, { family, registered, weight: registered?.weight || requestedWeight }] as const;
    })).values());
    await Promise.all(requestedFonts.map(async ({ family, registered, weight }) => {
      if (registered?.url) {
        try {
          const face = new FontFace(family, `url(${withBasePath(`/api${registered.url}`)})`, { weight: String(weight) });
          await waitWithTimeout(face.load());
          document.fonts.add(face);
        } catch { /* CSS @font-face remains the fallback path. */ }
      }
      await waitWithTimeout(document.fonts.load(`${weight} 24px "${family.replace(/"/gu, '')}"`));
    }));
    await waitWithTimeout(document.fonts.ready);
  }
  const canvas = document.createElement('canvas');
  canvas.width = template.width; canvas.height = template.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('امکان ساخت تصویر وجود ندارد');
  context.fillStyle = template.backgroundColor || '#0f172a';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const values: Record<Binding, string> = {
    title: article?.title || SAMPLE.title,
    lead: article?.leadText || SAMPLE.lead,
    author: article?.author || SAMPLE.author,
    category: article?.category || SAMPLE.category,
    reading_time: article?.readingTime ? `${article.readingTime} دقیقه مطالعه` : SAMPLE.reading_time,
    summary: article?.summaryText || SAMPLE.summary,
    link: article?.shortUrl || article?.link || SAMPLE.link,
    source: article?.feed?.name || SAMPLE.source,
    custom: SAMPLE.custom,
  };

  for (const layer of template.layers) {
    if (!layer.visible) continue;
    const x = template.width * clamp(layer.x, 0, 100) / 100;
    const y = template.height * clamp(layer.y, 0, 100) / 100;
    const width = template.width * clamp(layer.width, 0, 100) / 100;
    const height = template.height * clamp(layer.height, 0, 100) / 100;
    const radius = Math.min(template.width, template.height) * clamp(layer.borderRadius || 0, 0, 100) / 100;
    context.save(); context.globalAlpha = clamp(layer.opacity ?? 100, 0, 100) / 100;
    if (layer.type === 'gradient') {
      const angle = ((layer.gradientAngle ?? 135) * Math.PI) / 180;
      const length = Math.sqrt(width ** 2 + height ** 2);
      const cx = x + width / 2; const cy = y + height / 2;
      const gradient = context.createLinearGradient(cx - Math.cos(angle) * length / 2, cy - Math.sin(angle) * length / 2, cx + Math.cos(angle) * length / 2, cy + Math.sin(angle) * length / 2);
      gradient.addColorStop(0, rgba(layer.gradientFrom || '#2563eb', layer.gradientFromOpacity ?? 100));
      gradient.addColorStop(1, rgba(layer.gradientTo || '#7c3aed', layer.gradientToOpacity ?? 100));
      context.fillStyle = gradient; roundedPath(context, x, y, width, height, radius); context.fill();
    } else if (layer.type === 'text') {
      if (layer.backgroundColor && layer.backgroundColor !== 'transparent') {
        context.fillStyle = rgba(layer.backgroundColor, layer.backgroundOpacity ?? 100);
        roundedPath(context, x, y, width, height, radius); context.fill();
      }
      const text = String(layer.binding === 'custom' ? (layer.content || SAMPLE.custom) : (values[layer.binding || 'custom'] ?? SAMPLE.custom));
      const fontSize = Math.max(8, layer.fontSize || 24);
      context.font = `${layer.fontWeight || 500} ${fontSize}px ${JSON.stringify(layer.fontFamily || 'Vazirmatn')}`;
      context.fillStyle = layer.color || '#ffffff'; context.textBaseline = 'top';
      // Use physical Canvas alignment values. The canvas `direction` setting
      // changes the meaning of logical start/end in some browsers and caused
      // the RTL controls to appear mirrored for author/category fields.
      // Keep generated Persian text and justification right-to-left.
      context.direction = 'rtl';
      const lines = wrapCanvasText(context, text, Math.max(20, width - 32));
      const lineHeight = fontSize * 1.35;
      const totalHeight = lines.length * lineHeight;
      const startY = y + Math.max(8, (height - totalHeight) / 2);
      const align = layer.align === 'left' || layer.align === 'center' || layer.align === 'justify' || layer.align === 'right' ? layer.align : 'right';
      const textX = align === 'left' ? x + 16 : align === 'center' ? x + width / 2 : x + width - 16;
      // Canvas has no native justify value; distribute spaces on wrapped lines
      // while preserving the requested physical left/right alignment.
      lines.forEach((line, index) => {
        if (align === 'justify' && index < lines.length - 1 && /\s/u.test(line)) {
          const words = line.trim().split(/\s+/u);
          const natural = words.reduce((sum, word) => sum + context.measureText(word).width, 0);
          const gap = Math.max(0, (Math.max(20, width - 32) - natural) / Math.max(1, words.length - 1));
          let cursor = x + width - 16;
          context.textAlign = 'right';
          for (const word of words) { context.fillText(rtlCanvasText(word), cursor, startY + index * lineHeight); cursor -= context.measureText(word).width + gap; }
        } else {
          context.textAlign = align === 'justify' ? 'right' : align;
          context.fillText(rtlCanvasText(line), textX, startY + index * lineHeight, Math.max(20, width - 32));
        }
      });
    } else {
      const imageUrl = layer.type === 'featured-image' ? article?.featuredImageUrl : layer.type === 'author-image' ? article?.authorImageUrl : layer.imageUrl;
      const image = await loadCoverImage(imageUrl);
      if (image) drawCoverImage(context, image, x, y, width, height, layer.objectFit || 'cover', radius);
    }
    context.restore();
  }
  return canvas.toDataURL('image/png', 1);
}

export function CoverTemplateBuilder({ value, onChange, fontLibrary = [{ id: 'vazirmatn', name: 'Vazirmatn' }], demoArticle }: { value: string; onChange: (value: string) => void; fontLibrary?: CoverFont[]; demoArticle?: CoverDemoArticle }) {
  const template = useMemo(() => parseTemplate(value), [value]);
  const [selectedId, setSelectedId] = useState(template.layers.at(-1)?.id || '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [fontSizeDraft, setFontSizeDraft] = useState<string | null>(null);
  const [proxiedImages, setProxiedImages] = useState<Record<string, string>>({});
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const selected = template.layers.find((layer) => layer.id === selectedId) || template.layers.at(-1);
  const selectedIndex = selected ? template.layers.findIndex((layer) => layer.id === selected.id) : -1;
  const coveringLayer = selected && selectedIndex >= 0 ? template.layers.slice(selectedIndex + 1).find((layer) => {
    if (!layer.visible || (layer.opacity ?? 100) <= 0) return false;
    const visuallyOpaque = layer.type === 'image' || layer.type === 'featured-image' || layer.type === 'author-image' || layer.type === 'gradient'
      || (layer.type === 'text' && Boolean(layer.backgroundColor && layer.backgroundColor !== 'transparent'));
    return visuallyOpaque
      && layer.x <= selected.x && layer.y <= selected.y
      && layer.x + layer.width >= selected.x + selected.width
      && layer.y + layer.height >= selected.y + selected.height;
  }) : undefined;

  useEffect(() => { setFontSizeDraft(null); }, [selected?.id]);

  const remoteImageUrls = useMemo(() => [demoArticle?.featuredImageUrl, demoArticle?.authorImageUrl, ...template.layers.filter((layer) => layer.type === 'image').map((layer) => layer.imageUrl)].filter((url): url is string => Boolean(url && /^https?:\/\//iu.test(url))), [demoArticle?.authorImageUrl, demoArticle?.featuredImageUrl, template.layers]);

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];
    void Promise.all(remoteImageUrls.map(async (url) => {
      try {
        const blob = await apiFetchBlob(`/publishing/media/image?url=${encodeURIComponent(url)}`);
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        return [url, objectUrl] as const;
      } catch { return [url, ''] as const; }
    })).then((entries) => {
      if (!active) return;
      setProxiedImages(Object.fromEntries(entries.filter(([, objectUrl]) => objectUrl)));
    });
    return () => { active = false; objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [remoteImageUrls]);

  const commit = (next: CoverTemplate) => onChange(JSON.stringify(next));
  const updateTemplate = (patch: Partial<CoverTemplate>) => commit({ ...template, ...patch });
  const updateLayer = (id: string, patch: Partial<CoverLayer>) => commit({ ...template, layers: template.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer) });

  function addText(binding: Binding) {
    const def = BINDINGS.find((item) => item.value === binding)!;
    const layer: CoverLayer = { id: newId(), name: def.label, type: 'text', binding, content: binding === 'custom' ? SAMPLE.custom : '', x: 10, y: 20, width: 80, height: binding === 'summary' ? 24 : 12, visible: true, opacity: 100, color: '#ffffff', backgroundColor: 'transparent', backgroundOpacity: 100, fontSize: binding === 'title' ? 42 : 24, fontWeight: binding === 'title' ? 800 : 500, fontFamily: fontLibrary[0]?.name || 'Vazirmatn', align: 'right', borderRadius: 0 };
    setSelectedId(layer.id);
    commit({ ...template, layers: [...template.layers, layer] });
  }

  function addImage(type: 'featured-image' | 'author-image' | 'image') {
    const layer: CoverLayer = { id: newId(), name: type === 'featured-image' ? 'تصویر شاخص' : type === 'author-image' ? 'تصویر نویسنده' : 'تصویر دلخواه', type, imageUrl: '', x: 10, y: 10, width: 80, height: 55, visible: true, opacity: 100, borderRadius: 0, objectFit: 'cover' };
    setSelectedId(layer.id);
    commit({ ...template, layers: [...template.layers, layer] });
  }

  function addGradient() {
    const layer: CoverLayer = { id: newId(), name: 'گرادینت', type: 'gradient', x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 100, gradientFrom: '#2563eb', gradientTo: '#7c3aed', gradientFromOpacity: 85, gradientToOpacity: 20, gradientAngle: 135 };
    setSelectedId(layer.id);
    commit({ ...template, layers: [...template.layers, layer] });
  }

  function reorderLayers(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const layers = [...template.layers];
    const sourceIndex = layers.findIndex((layer) => layer.id === sourceId);
    const targetIndex = layers.findIndex((layer) => layer.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = layers.splice(sourceIndex, 1);
    layers.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, source);
    commit({ ...template, layers });
  }

  function bringToFront(id: string) {
    const layer = template.layers.find((item) => item.id === id);
    if (!layer || template.layers.at(-1)?.id === id) return;
    commit({ ...template, layers: [...template.layers.filter((item) => item.id !== id), layer] });
  }

  function remove(id: string) {
    const layers = template.layers.filter((layer) => layer.id !== id);
    setSelectedId(layers.at(-1)?.id || '');
    commit({ ...template, layers });
  }

  async function uploadCustomImage(file?: File) {
    if (!file || !selected || selected.type !== 'image') return;
    setUploadingImage(true); setImageUploadError('');
    try {
      const form = new FormData(); form.append('file', file);
      const result = await apiFetch<{ url: string }>('/publishing/settings/images', { method: 'POST', body: form });
      updateLayer(selected.id, { imageUrl: result.url });
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : 'آپلود تصویر انجام نشد');
    } finally { setUploadingImage(false); }
  }

  function previewImageUrl(url: string) {
    if (/^https?:\/\//iu.test(url)) return proxiedImages[url] || url;
    return withBasePath(url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : `/${url}`}`);
  }

  const previewScale = 100 / Math.max(template.width, template.height);

  const fontFamilies = Array.from(new Map(fontLibrary.map((font) => [font.name, font])).values());
  const fontFaceCss = fontLibrary.filter((font) => font.url).map((font) => `@font-face{font-family:'${font.name.replace(/'/g, '')}';src:url('${withBasePath(`/api${font.url!}`)}');font-weight:${font.weight || 400};font-style:normal;font-display:swap;}`).join('\n');
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
    {fontFaceCss && <style>{fontFaceCss}</style>}
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-2">{BINDINGS.map((item) => <Button key={item.value} type="button" size="sm" variant="outline" onClick={() => addText(item.value)}><Type className="h-4 w-4" />{item.label}</Button>)}</div>
        <Button type="button" size="sm" variant="outline" onClick={() => addImage('featured-image')}><ImageIcon className="h-4 w-4" /> تصویر شاخص</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => addImage('author-image')}><ImageIcon className="h-4 w-4" /> تصویر نویسنده</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => addImage('image')}><Plus className="h-4 w-4" /> تصویر دلخواه</Button>
        <Button type="button" size="sm" variant="outline" onClick={addGradient}><Plus className="h-4 w-4" /> گرادینت</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-slate-100 p-4">
        <div ref={canvasRef} className="mx-auto overflow-hidden shadow-2xl" style={{ position: 'relative', width: `${template.width * previewScale}%`, maxWidth: '100%', aspectRatio: `${template.width}/${template.height}`, backgroundColor: template.backgroundColor }}>
          {template.layers.map((layer) => layer.visible && <button type="button" key={layer.id} onClick={() => setSelectedId(layer.id)} onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { id: layer.id, clientX: event.clientX, clientY: event.clientY, x: layer.x, y: layer.y }; setSelectedId(layer.id); }} onPointerMove={(event) => { const drag = dragRef.current; const canvas = canvasRef.current; if (!drag || drag.id !== layer.id || !event.currentTarget.hasPointerCapture(event.pointerId) || !canvas) return; const rect = canvas.getBoundingClientRect(); const x = Math.max(0, Math.min(100 - layer.width, drag.x + ((event.clientX - drag.clientX) / rect.width) * 100)); const y = Math.max(0, Math.min(100 - layer.height, drag.y + ((event.clientY - drag.clientY) / rect.height) * 100)); updateLayer(layer.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); dragRef.current = null; }} className={cn('absolute cursor-move overflow-hidden border-2 text-right transition', selected?.id === layer.id ? 'border-blue-400' : 'border-transparent hover:border-white/60')} style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, opacity: layer.opacity / 100, borderRadius: `${layer.borderRadius || 0}px`, backgroundColor: layer.type === 'text' && layer.backgroundColor !== 'transparent' ? rgba(layer.backgroundColor || '#ffffff', layer.backgroundOpacity ?? 100) : undefined, touchAction: 'none' }}>
            {layer.type === 'featured-image' && (demoArticle?.featuredImageUrl ? <img src={previewImageUrl(demoArticle.featuredImageUrl)} alt="" className={cn('h-full w-full', layer.objectFit === 'contain' ? 'object-contain' : 'object-cover')} /> : <div className="grid h-full place-items-center bg-gradient-to-br from-slate-500 to-slate-800 text-center text-sm text-white"><ImageIcon className="mb-1 h-8 w-8" />تصویر شاخص مطلب</div>)}
            {layer.type === 'author-image' && (demoArticle?.authorImageUrl ? <img src={previewImageUrl(demoArticle.authorImageUrl)} alt="" className={cn('h-full w-full', layer.objectFit === 'contain' ? 'object-contain' : 'object-cover')} /> : <div className="grid h-full place-items-center bg-gradient-to-br from-violet-500 to-fuchsia-600 text-center text-sm text-white"><ImageIcon className="mb-1 h-8 w-8" />تصویر نویسنده</div>)}
            {layer.type === 'gradient' && <div className="h-full w-full" style={{ background: `linear-gradient(${layer.gradientAngle ?? 135}deg, ${rgba(layer.gradientFrom || '#2563eb', layer.gradientFromOpacity ?? 100)}, ${rgba(layer.gradientTo || '#7c3aed', layer.gradientToOpacity ?? 100)})` }} />}
            {layer.type === 'image' && (layer.imageUrl ? <img src={previewImageUrl(layer.imageUrl)} alt="" className={cn('h-full w-full', layer.objectFit === 'contain' ? 'object-contain' : 'object-cover')} /> : <div className="grid h-full place-items-center bg-white/90 text-sm text-slate-500">تصویر دلخواه</div>)}
            {layer.type === 'text' && <span className="flex h-full w-full whitespace-pre-wrap p-2 leading-snug" style={{ color: layer.color, fontSize: `${Math.max(10, (layer.fontSize || 24) * 0.42)}px`, fontWeight: layer.fontWeight, fontFamily: layer.fontFamily, direction: 'rtl', textAlign: layer.align, alignItems: 'center', justifyContent: layer.align === 'right' || layer.align === 'justify' ? 'flex-start' : layer.align === 'center' ? 'center' : 'flex-end', backgroundColor: layer.backgroundColor === 'transparent' ? undefined : rgba(layer.backgroundColor || '#ffffff', layer.backgroundOpacity ?? 100) }}>{textFor(layer, demoArticle)}</span>}
          </button>)}
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-slate-600">اندازه خروجی<select className="rounded-lg border bg-white px-2 py-2 text-sm" value={`${template.width}x${template.height}`} onChange={(e) => { const [width, height] = e.target.value.split('x').map(Number); updateTemplate({ width, height }); }}><option value="1080x1080">مربع ۱۰۸۰ × ۱۰۸۰</option><option value="1080x1350">عمودی ۱۰۸۰ × ۱۳۵۰</option><option value="1080x1920">استوری ۱۰۸۰ × ۱۹۲۰</option></select></label>
        <label className="grid gap-1 text-xs text-slate-600">رنگ پس‌زمینه<input type="color" className="h-10 w-full rounded-lg border bg-white p-1" value={template.backgroundColor} onChange={(e) => updateTemplate({ backgroundColor: e.target.value })} /></label>
        <div className="flex items-end"><Button type="button" className="w-full" variant="outline" onClick={() => { setSelectedId(DEFAULT_TEMPLATE.layers.at(-1)!.id); commit(DEFAULT_TEMPLATE); }}>بازنشانی قالب</Button></div>
      </div>
    </div>

    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <h3 className="font-bold text-slate-900">لایه‌ها</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">لایه‌های بالاتر فهرست روی لایه‌های زیرین قرار می‌گیرند. برای تغییر ترتیب، هر لایه را با دستگیرهٔ کنار آن بکشید و در محل دلخواه رها کنید.</p>
        <div className="mt-3 space-y-2">
          {[...template.layers].reverse().map((layer) => {
            return <div key={layer.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', layer.id); setDraggingLayerId(layer.id); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverLayerId(layer.id); }} onDragLeave={() => setDragOverLayerId((current) => current === layer.id ? null : current)} onDrop={(event) => { event.preventDefault(); reorderLayers(event.dataTransfer.getData('text/plain') || draggingLayerId || '', layer.id); setDraggingLayerId(null); setDragOverLayerId(null); }} onDragEnd={() => { setDraggingLayerId(null); setDragOverLayerId(null); }} className={cn('flex cursor-grab items-center gap-1 rounded-xl border p-2 active:cursor-grabbing', selected?.id === layer.id ? 'border-blue-300 bg-blue-50' : 'bg-white', draggingLayerId === layer.id && 'opacity-50', dragOverLayerId === layer.id && draggingLayerId !== layer.id && 'border-dashed border-blue-500')}>
              <GripVertical className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <button type="button" className="min-w-0 flex-1 truncate text-right text-sm font-medium" onClick={() => setSelectedId(layer.id)}>{layer.type === 'text' ? <Type className="ml-2 inline h-4 w-4" /> : layer.type === 'gradient' ? <span className="ml-2 inline-block h-4 w-4 rounded bg-gradient-to-br from-blue-500 to-violet-500 align-middle" /> : <ImageIcon className="ml-2 inline h-4 w-4" />}{layer.name}</button>
              <button type="button" title={layer.visible ? 'مخفی کردن' : 'نمایش'} onClick={() => updateLayer(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-slate-400" />}</button>
              <button type="button" title="حذف" className="text-red-600" onClick={() => remove(layer.id)}><Trash2 className="h-4 w-4" /></button>
            </div>;
          })}
        </div>
      </div>

      {selected && <div className="space-y-4 rounded-2xl border bg-white p-4">
        <div><h3 className="font-bold text-slate-900">تنظیمات «{selected.name}»</h3><p className="mt-1 text-xs text-slate-500">مقادیر موقعیت و اندازه به درصد هستند.</p></div>
        {coveringLayer && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900"><p>این لایه زیر «{coveringLayer.name}» قرار گرفته و ممکن است در تصویر نهایی دیده نشود.</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => bringToFront(selected.id)}>انتقال به بالاترین لایه</Button></div>}
        <div className="grid grid-cols-2 gap-3">
          {(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key} className="grid gap-1 text-xs text-slate-600">{{ x: 'فاصله از چپ', y: 'فاصله از بالا', width: 'عرض', height: 'ارتفاع' }[key]}<input type="number" min="0" max="100" className="rounded-lg border px-2 py-2 text-sm" value={selected[key]} onChange={(e) => updateLayer(selected.id, { [key]: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label>)}
          <label className="grid gap-1 text-xs text-slate-600">شفافیت<input type="number" min="0" max="100" className="rounded-lg border px-2 py-2 text-sm" value={selected.opacity} onChange={(e) => updateLayer(selected.id, { opacity: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label>
          <label className="grid gap-1 text-xs text-slate-600">گردی گوشه<input type="number" min="0" max="100" className="rounded-lg border px-2 py-2 text-sm" value={selected.borderRadius || 0} onChange={(e) => updateLayer(selected.id, { borderRadius: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label>
        </div>

        {selected.type === 'image' && <div className="grid gap-3 rounded-xl bg-slate-50 p-3"><label className="grid gap-1 text-xs text-slate-600">آدرس تصویر دلخواه<input dir="ltr" type="url" className="rounded-lg border px-3 py-2 text-sm" placeholder="https://example.com/image.png" value={selected.imageUrl || ''} onChange={(e) => updateLayer(selected.id, { imageUrl: e.target.value })} /></label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-white px-3 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={uploadingImage} onChange={(event) => { void uploadCustomImage(event.target.files?.[0]); event.target.value = ''; }} />{uploadingImage ? 'در حال آپلود تصویر…' : 'آپلود تصویر دلخواه'}</label><p className="text-xs text-slate-500">فرمت‌های مجاز: JPG، PNG، WebP و AVIF؛ حداکثر ۱۵ مگابایت.</p>{imageUploadError && <p className="text-xs text-red-600">{imageUploadError}</p>}</div>}
        {(selected.type === 'image' || selected.type === 'featured-image' || selected.type === 'author-image') && <label className="grid gap-1 text-xs text-slate-600">نحوه نمایش تصویر<select className="rounded-lg border px-3 py-2 text-sm" value={selected.objectFit || 'cover'} onChange={(e) => updateLayer(selected.id, { objectFit: e.target.value as 'cover' | 'contain' })}><option value="cover">پوشاندن کامل کادر</option><option value="contain">نمایش کامل تصویر</option></select></label>}

        {selected.type === 'gradient' && <div className="grid gap-3 rounded-xl bg-slate-50 p-3"><div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-xs text-slate-600">رنگ ابتدا<input type="color" className="h-10 w-full rounded-lg border bg-white p-1" value={selected.gradientFrom || '#2563eb'} onChange={(e) => updateLayer(selected.id, { gradientFrom: e.target.value })} /></label><label className="grid gap-1 text-xs text-slate-600">شفافیت ابتدا<input type="number" min="0" max="100" className="rounded-lg border px-2 py-2 text-sm" value={selected.gradientFromOpacity ?? 100} onChange={(e) => updateLayer(selected.id, { gradientFromOpacity: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label><label className="grid gap-1 text-xs text-slate-600">رنگ انتها<input type="color" className="h-10 w-full rounded-lg border bg-white p-1" value={selected.gradientTo || '#7c3aed'} onChange={(e) => updateLayer(selected.id, { gradientTo: e.target.value })} /></label><label className="grid gap-1 text-xs text-slate-600">شفافیت انتها<input type="number" min="0" max="100" className="rounded-lg border px-2 py-2 text-sm" value={selected.gradientToOpacity ?? 100} onChange={(e) => updateLayer(selected.id, { gradientToOpacity: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label></div><label className="grid gap-1 text-xs text-slate-600">زاویهٔ گرادینت (درجه)<input type="number" min="0" max="360" className="rounded-lg border px-2 py-2 text-sm" value={selected.gradientAngle ?? 135} onChange={(e) => updateLayer(selected.id, { gradientAngle: Math.max(0, Math.min(360, Number(e.target.value))) })} /></label></div>}

        {selected.type === 'text' && <>
          <label className="grid gap-1 text-xs text-slate-600">محتوای لایه<select className="rounded-lg border px-3 py-2 text-sm" value={selected.binding || 'custom'} onChange={(e) => { const binding = e.target.value as Binding; updateLayer(selected.id, { binding, name: BINDINGS.find((item) => item.value === binding)?.label || selected.name }); }}>{BINDINGS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          {selected.binding === 'custom' && <label className="grid gap-1 text-xs text-slate-600">متن دلخواه<textarea className="min-h-20 rounded-lg border px-3 py-2 text-sm" value={selected.content || ''} onChange={(e) => updateLayer(selected.id, { content: e.target.value })} /></label>}
          <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-xs text-slate-600">فونت<select className="rounded-lg border px-2 py-2 text-sm" value={selected.fontFamily || fontFamilies[0]?.name || 'Vazirmatn'} onChange={(e) => updateLayer(selected.id, { fontFamily: e.target.value })}>{fontFamilies.map((font) => <option key={font.id} value={font.name}>{font.name}</option>)}</select></label><label className="grid gap-1 text-xs text-slate-600">اندازه قلم<input type="number" min="8" max="160" inputMode="numeric" className="rounded-lg border px-2 py-2 text-sm" value={fontSizeDraft ?? String(selected.fontSize || 24)} onFocus={() => setFontSizeDraft(String(selected.fontSize || 24))} onChange={(e) => setFontSizeDraft(e.target.value)} onBlur={() => { const size = Number(fontSizeDraft); if (Number.isFinite(size) && size > 0) updateLayer(selected.id, { fontSize: Math.max(8, Math.min(160, size)) }); setFontSizeDraft(null); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label><label className="grid gap-1 text-xs text-slate-600">ضخامت قلم<select className="rounded-lg border px-2 py-2 text-sm" value={selected.fontWeight || 500} onChange={(e) => updateLayer(selected.id, { fontWeight: Number(e.target.value) })}><option value="100">Thin · خیلی نازک</option><option value="200">Extra Light · نازک</option><option value="300">Light · سبک</option><option value="400">Regular · معمولی</option><option value="500">Medium · متوسط</option><option value="600">Semi Bold · نیمه‌ضخیم</option><option value="700">Bold · ضخیم</option><option value="800">Extra Bold · خیلی ضخیم</option><option value="900">Black · مشکی</option></select></label><label className="grid gap-1 text-xs text-slate-600">رنگ متن<input type="color" className="h-10 w-full rounded-lg border p-1" value={selected.color || '#ffffff'} onChange={(e) => updateLayer(selected.id, { color: e.target.value })} /></label><label className="grid gap-1 text-xs text-slate-600">رنگ پس‌زمینه<input type="color" className="h-10 w-full rounded-lg border p-1" value={selected.backgroundColor === 'transparent' ? '#ffffff' : selected.backgroundColor || '#ffffff'} onChange={(e) => updateLayer(selected.id, { backgroundColor: e.target.value })} /></label><label className="grid gap-1 text-xs text-slate-600">شفافیت پس‌زمینه<input type="number" min="0" max="100" className="rounded-lg border px-2 py-2 text-sm" value={selected.backgroundOpacity ?? 100} onChange={(e) => updateLayer(selected.id, { backgroundOpacity: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label></div>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" aria-label="راست‌چین" title="راست‌چین" variant={selected.align === 'right' ? 'primary' : 'outline'} onClick={() => updateLayer(selected.id, { align: 'right' })}><AlignRight className="h-4 w-4" /> راست‌چین</Button><Button type="button" size="sm" aria-label="وسط‌چین" title="وسط‌چین" variant={selected.align === 'center' ? 'primary' : 'outline'} onClick={() => updateLayer(selected.id, { align: 'center' })}><AlignCenter className="h-4 w-4" /> وسط‌چین</Button><Button type="button" size="sm" aria-label="چپ‌چین" title="چپ‌چین" variant={selected.align === 'left' ? 'primary' : 'outline'} onClick={() => updateLayer(selected.id, { align: 'left' })}><AlignLeft className="h-4 w-4" /> چپ‌چین</Button><Button type="button" size="sm" aria-label="جاستیفای" title="جاستیفای" variant={selected.align === 'justify' ? 'primary' : 'outline'} onClick={() => updateLayer(selected.id, { align: 'justify' })}>☰ جاستیفای</Button></div>
        </>}
      </div>}
    </div>
  </div>;
}
