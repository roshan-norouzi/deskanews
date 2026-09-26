export type InferredCoverLayer = {
  id: string;
  name: string;
  type: 'featured-image' | 'author-image' | 'text' | 'image' | 'gradient' | 'line' | 'rect' | 'circle';
  binding?: 'title' | 'lead' | 'author' | 'category' | 'reading_time' | 'summary' | 'link' | 'source' | 'custom';
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
};

export type InferredCoverTemplate = {
  version: 1;
  width: number;
  height: number;
  backgroundColor: string;
  layers: InferredCoverLayer[];
};

const ALLOWED_TYPES = new Set(['featured-image', 'author-image', 'text', 'image', 'gradient', 'line', 'rect', 'circle']);
const ALLOWED_BINDINGS = new Set(['title', 'lead', 'author', 'category', 'reading_time', 'summary', 'link', 'source', 'custom']);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(clamp(value, 0, 100) * 10) / 10;
}

export function resolveCoverCanvasSize(width: number, height: number): { width: 1080; height: 1080 | 1350 | 1920 } {
  const ratio = height / Math.max(1, width);
  if (ratio >= 1.55) return { width: 1080, height: 1920 };
  if (ratio >= 1.12) return { width: 1080, height: 1350 };
  return { width: 1080, height: 1080 };
}

export function readRasterImageSize(buffer: Buffer, contentType: string): { width: number; height: number } | null {
  if (contentType === 'image/png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (contentType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && offset + 8 < buffer.length) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + size;
    }
  }
  if (contentType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height };
    }
  }
  return null;
}

export function fallbackCoverTemplateFromSample(canvas: { width: 1080; height: 1080 | 1350 | 1920 } = { width: 1080, height: 1080 }): InferredCoverTemplate {
  const tall = canvas.height > 1080;
  return {
    version: 1,
    width: canvas.width,
    height: canvas.height,
    backgroundColor: '#0f172a',
    layers: [
      {
        id: 'featured-image',
        name: 'تصویر شاخص',
        type: 'featured-image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        visible: true,
        opacity: 100,
        borderRadius: 0,
        objectFit: 'cover',
      },
      {
        id: 'overlay',
        name: 'پوشش تیره پایین',
        type: 'gradient',
        x: 0,
        y: tall ? 48 : 42,
        width: 100,
        height: tall ? 52 : 58,
        visible: true,
        opacity: 100,
        gradientFrom: '#0f172a',
        gradientTo: '#0f172a',
        gradientFromOpacity: 8,
        gradientToOpacity: 92,
        gradientAngle: 180,
      },
      {
        id: 'source',
        name: 'نام منبع',
        type: 'text',
        binding: 'source',
        x: 8,
        y: 6,
        width: 38,
        height: 7,
        visible: true,
        opacity: 100,
        color: '#ffffff',
        backgroundColor: '#2563eb',
        fontSize: 20,
        fontWeight: 700,
        align: 'center',
        borderRadius: 18,
      },
      {
        id: 'title',
        name: 'تیتر مطلب',
        type: 'text',
        binding: 'title',
        x: 8,
        y: tall ? 62 : 52,
        width: 84,
        height: tall ? 20 : 26,
        visible: true,
        opacity: 100,
        color: '#ffffff',
        backgroundColor: 'transparent',
        fontSize: tall ? 42 : 46,
        fontWeight: 800,
        align: 'right',
        borderRadius: 0,
      },
      {
        id: 'lead',
        name: 'لید مطلب',
        type: 'text',
        binding: 'lead',
        x: 8,
        y: tall ? 84 : 80,
        width: 84,
        height: tall ? 10 : 12,
        visible: true,
        opacity: 100,
        color: '#e2e8f0',
        backgroundColor: 'transparent',
        fontSize: 22,
        fontWeight: 400,
        align: 'right',
        borderRadius: 0,
      },
    ],
  };
}

export function normalizeInferredCoverTemplate(raw: unknown, canvas: { width: 1080; height: 1080 | 1350 | 1920 }): InferredCoverTemplate {
  const fallback = fallbackCoverTemplateFromSample(canvas);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const source = raw as Record<string, unknown>;
  const layersInput = Array.isArray(source.layers) ? source.layers : [];
  const layers: InferredCoverLayer[] = [];
  let hasFeatured = false;

  for (const [index, item] of layersInput.slice(0, 20).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    let type = String(row.type || '');
    if (type === 'photo' || type === 'background' || type === 'news-image') type = 'featured-image';
    if (!ALLOWED_TYPES.has(type)) continue;
    const bindingRaw = String(row.binding || (type === 'text' ? 'custom' : ''));
    const binding = ALLOWED_BINDINGS.has(bindingRaw) ? bindingRaw as InferredCoverLayer['binding'] : (type === 'text' ? 'custom' : undefined);
    if (type === 'featured-image') hasFeatured = true;
    layers.push({
      id: String(row.id || `layer-${index + 1}`).slice(0, 80),
      name: String(row.name || `لایه ${index + 1}`).slice(0, 80),
      type: type as InferredCoverLayer['type'],
      ...(type === 'text' ? { binding } : {}),
      content: type === 'text' && binding === 'custom' ? String(row.content || '').slice(0, 200) : undefined,
      x: round(Number(row.x)),
      y: round(Number(row.y)),
      width: round(Number(row.width) || 20),
      height: round(Number(row.height) || 10),
      visible: row.visible !== false,
      opacity: clamp(Number(row.opacity ?? 100), 0, 100),
      color: typeof row.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(row.color) ? row.color : '#ffffff',
      backgroundColor: typeof row.backgroundColor === 'string' ? row.backgroundColor : 'transparent',
      fontSize: clamp(Number(row.fontSize || 24), 8, 96),
      fontWeight: clamp(Number(row.fontWeight || 500), 100, 900),
      align: row.align === 'left' || row.align === 'center' || row.align === 'justify' ? row.align : 'right',
      borderRadius: clamp(Number(row.borderRadius || 0), 0, 100),
      objectFit: row.objectFit === 'contain' ? 'contain' : 'cover',
      gradientFrom: typeof row.gradientFrom === 'string' ? row.gradientFrom : '#0f172a',
      gradientTo: typeof row.gradientTo === 'string' ? row.gradientTo : '#0f172a',
      gradientFromOpacity: clamp(Number(row.gradientFromOpacity ?? 80), 0, 100),
      gradientToOpacity: clamp(Number(row.gradientToOpacity ?? 20), 0, 100),
      gradientAngle: clamp(Number(row.gradientAngle ?? 180), 0, 360),
    });
  }

  if (!layers.length) return fallback;
  if (!hasFeatured) {
    layers.unshift(fallback.layers[0]);
  }

  const backgroundColor = typeof source.backgroundColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(source.backgroundColor)
    ? source.backgroundColor
    : '#0f172a';

  return {
    version: 1,
    width: canvas.width,
    height: canvas.height,
    backgroundColor,
    layers,
  };
}

export const COVER_TEMPLATE_FROM_SAMPLE_PROMPT = `تو طراح گرافیک خبر برای شبکه‌های اجتماعی هستی. تصویر نمونه، یک قالب کاور خبر است.
لایه‌های قابل ویرایش بساز که همان ترکیب‌بندی را بازسازی کنند تا بعداً تصویر شاخص و متن هر خبر روی آن بنشیند.

قواعد:
- ناحیه عکس خبر را featured-image بگذار، نه image ثابت نمونه.
- لوگو یا عنصر ثابت اگر جداست type=image باشد بدون imageUrl.
- تیتر، لید و نام منبع را با bindingهای title، lead و source مشخص کن.
- پوشش تیره یا گرادینت را با type=gradient یا text با backgroundColor بساز.
- مختصات x,y,width,height درصد ۰ تا ۱۰۰ باشد.
- اندازه خروجی فقط یکی از 1080x1080 یا 1080x1350 یا 1080x1920.

فقط JSON معتبر با ساختار {"width":1080,"height":1080,"backgroundColor":"#0f172a","layers":[...]} برگردان.`;
