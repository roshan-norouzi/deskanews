import type { PublishingSettings } from './dto/publishing-settings.dto';

export function settingEnabled(value: string | undefined, fallback = false): boolean {
  return value === 'true' || (value === undefined && fallback);
}

export function sourceBoolean(value: boolean | null | undefined, fallback: boolean): boolean {
  return value === null || value === undefined ? fallback : value;
}

export function sourceInterval(value: number | null | undefined, fallback: number): number {
  return Number.isInteger(value) && value! >= 5 && value! <= 1440 ? value! : fallback;
}

export function automaticCoverTemplateId(settings: PublishingSettings): string {
  const requested = settings.social_auto_image_template_id?.trim();
  try {
    const library = JSON.parse(settings.social_image_templates || '') as {
      defaultTemplateId?: unknown;
      templates?: Array<{ id?: unknown }>;
    };
    const ids = new Set((Array.isArray(library.templates) ? library.templates : [])
      .map((template) => typeof template.id === 'string' ? template.id : '')
      .filter(Boolean));
    if (requested && ids.has(requested)) return requested;
    if (typeof library.defaultTemplateId === 'string' && ids.has(library.defaultTemplateId)) return library.defaultTemplateId;
    const first = ids.values().next().value;
    if (typeof first === 'string') return first;
  } catch { /* use the legacy template below */ }
  return requested || 'default';
}
