export const SOURCE_LANGUAGES = ['auto', 'fa', 'en', 'ar', 'fr', 'de', 'tr', 'he', 'zh', 'ja'] as const;
export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number];

export const SOURCE_LANGUAGE_LABELS: Record<SourceLanguage, string> = {
  auto: 'تشخیص خودکار',
  fa: 'فارسی',
  en: 'انگلیسی',
  ar: 'عربی',
  fr: 'فرانسوی',
  de: 'آلمانی',
  tr: 'ترکی',
  he: 'عبری',
  zh: 'چینی',
  ja: 'ژاپنی',
};

export function normalizeSourceLanguage(value: unknown): SourceLanguage {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return (SOURCE_LANGUAGES as readonly string[]).includes(normalized) ? normalized as SourceLanguage : 'auto';
}

/** Heuristic: Persian news text vs foreign-language source. */
export function isLikelyPersianNews(value: string): boolean {
  const normalized = value.normalize('NFKC');
  const arabicScriptCount = normalized.match(/[\u0600-\u06ff]/gu)?.length || 0;
  const latinCount = normalized.match(/[a-z]/giu)?.length || 0;
  if (arabicScriptCount < 8 || arabicScriptCount < latinCount) return false;
  const persianLetterCount = normalized.match(/[پچژگکی]/gu)?.length || 0;
  const commonPersianWords = normalized.match(/(?:^|\s)(?:از|به|در|با|برای|این|آن|که|است|شد|می‌شود|کرد|گفت|خبر)(?=\s|[،؛:.!?؟]|$)/gu)?.length || 0;
  return persianLetterCount > 0 || commonPersianWords >= 2;
}

/** Decide whether content should use Persian rewrite or translation prompts. */
export function shouldUsePersianRewrite(sourceLanguage: string | null | undefined, text: string): boolean {
  const language = normalizeSourceLanguage(sourceLanguage);
  if (language === 'fa') return true;
  if (language === 'en' || language === 'ar' || language === 'fr' || language === 'de' || language === 'tr' || language === 'he' || language === 'zh' || language === 'ja') return false;
  return isLikelyPersianNews(text);
}
