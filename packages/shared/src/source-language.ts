export const SOURCE_LANGUAGE_CODE_PATTERN = /^(auto|[a-z]{2})$/;

export const SOURCE_LANGUAGE_KNOWLEDGE = {
  fa: 'فارسی',
  en: 'انگلیسی',
  ar: 'عربی',
  fr: 'فرانسوی',
  de: 'آلمانی',
  tr: 'ترکی',
  he: 'عبری',
  zh: 'چینی',
  ja: 'ژاپنی',
  ru: 'روسی',
  es: 'اسپانیایی',
  it: 'ایتالیایی',
  pt: 'پرتغالی',
  ko: 'کره‌ای',
  uk: 'اوکراینی',
  ur: 'اردو',
  nl: 'هلندی',
  pl: 'لهستانی',
  hi: 'هندی',
  az: 'آذربایجانی',
  ku: 'کردی',
  hy: 'ارمنی',
  sw: 'سواحیلی',
} as const;

export const SOURCE_LANGUAGES = ['auto', ...Object.keys(SOURCE_LANGUAGE_KNOWLEDGE)] as const;
export type SourceLanguage = string;
export type DetectedSourceLanguage = Exclude<SourceLanguage, 'auto'>;

export const SOURCE_LANGUAGE_LABELS: Record<string, string> = {
  auto: 'تشخیص خودکار',
  ...SOURCE_LANGUAGE_KNOWLEDGE,
};

export function isSourceLanguageCode(value: unknown): value is string {
  return SOURCE_LANGUAGE_CODE_PATTERN.test(String(value || '').trim().toLowerCase());
}

export function normalizeSourceLanguage(value: unknown): SourceLanguage {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return isSourceLanguageCode(normalized) ? normalized : 'auto';
}

export function sourceLanguageLabel(code: string | null | undefined): string {
  const normalized = normalizeSourceLanguage(code);
  if (SOURCE_LANGUAGE_LABELS[normalized]) return SOURCE_LANGUAGE_LABELS[normalized];
  try {
    const name = new Intl.DisplayNames(['fa'], { type: 'language' }).of(normalized);
    if (name && name !== normalized) return name;
  } catch {
    /* Intl may not know the code */
  }
  return `زبان ${normalized}`;
}

export function mergeSourceLanguageCatalog(extra: Array<string | null | undefined> = []): string[] {
  const codes = new Set<string>(SOURCE_LANGUAGES);
  for (const item of extra) {
    const code = normalizeSourceLanguage(item);
    if (code !== 'auto') codes.add(code);
  }
  const rest = [...codes]
    .filter((code) => code !== 'auto')
    .sort((left, right) => sourceLanguageLabel(left).localeCompare(sourceLanguageLabel(right), 'fa'));
  return ['auto', ...rest];
}

/** Heuristic: Persian news text vs foreign-language source. */
export function isLikelyPersianNews(value: string): boolean {
  const normalized = value.normalize('NFKC');
  const arabicScriptCount = normalized.match(/[\u0600-\u06ff]/gu)?.length || 0;
  const latinCount = normalized.match(/[a-z]/giu)?.length || 0;
  if (arabicScriptCount < 8 || arabicScriptCount < latinCount) return false;
  if (countMatches(normalized, /[ےھٹڈ]/gu) >= 1 || countMatches(normalized, /(?:^|\s)(?:نے|کے|ہے|اور)(?=\s|[،؛:.!?؟]|$)/gu) >= 2) {
    return false;
  }
  const persianLetterCount = normalized.match(/[پچژگکی]/gu)?.length || 0;
  const commonPersianWords = normalized.match(/(?:^|\s)(?:از|به|در|با|برای|این|آن|که|است|شد|می‌شود|کرد|گفت|خبر)(?=\s|[،؛:.!?؟]|$)/gu)?.length || 0;
  return persianLetterCount > 0 || commonPersianWords >= 2;
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length || 0;
}

function pickWinner(candidates: Array<{ language: string; score: number }>, fallback: string, minimum = 2): string {
  const ranked = [...candidates].sort((left, right) => right.score - left.score);
  const winner = ranked[0];
  if (!winner || winner.score < minimum) return fallback;
  return winner.language;
}

/**
 * Infer a concrete catalog language from sampled titles/summaries.
 * Returns `auto` when the sample is too short or mixed to be confident.
 */
export function detectSourceLanguage(value: string): SourceLanguage {
  const text = String(value || '').normalize('NFKC').trim();
  if (text.replace(/\s+/gu, '').length < 24) return 'auto';

  const latin = countMatches(text, /[A-Za-zÀ-ÖØ-öø-ÿ]/gu);
  const arabic = countMatches(text, /[\u0600-\u06ff]/gu);
  const hebrew = countMatches(text, /[\u0590-\u05ff]/gu);
  const cjk = countMatches(text, /[\u3040-\u30ff\u3400-\u9fff]/gu);
  const hangul = countMatches(text, /[\uac00-\ud7af]/gu);
  const cyrillic = countMatches(text, /[\u0400-\u04ff]/gu);
  const devanagari = countMatches(text, /[\u0900-\u097f]/gu);
  const hiraganaKatakana = countMatches(text, /[\u3040-\u30ff]/gu);
  const strongest = Math.max(latin, arabic, hebrew, cjk, hangul, cyrillic, devanagari);

  if (strongest < 12) return 'auto';

  if (hangul === strongest) return 'ko';
  if (devanagari === strongest) return 'hi';
  if (cyrillic === strongest) {
    const ukrainianLetters = countMatches(text, /[іїєґІЇЄҐ]/gu);
    const ukrainianWords = countMatches(text, /(?:^|\s)(?:та|для|після|про|що|як|це)(?=\s|[.,:;!?]|$)/giu);
    return ukrainianLetters >= 2 || ukrainianWords >= 2 ? 'uk' : 'ru';
  }
  if (cjk === strongest) {
    return hiraganaKatakana >= 4 ? 'ja' : 'zh';
  }
  if (hebrew === strongest) return 'he';
  if (arabic === strongest) {
    const urduMarks = countMatches(text, /[ےھٹڈ]/gu);
    const urduWords = countMatches(text, /(?:^|\s)(?:نے|کے|ہے|اور|کا|کی)(?=\s|[،؛:.!?؟]|$)/gu);
    if (urduMarks >= 1 || urduWords >= 2) return 'ur';
    return isLikelyPersianNews(text) ? 'fa' : 'ar';
  }

  const turkish = countMatches(text, /[çğıöşüÇĞİÖŞÜ]/gu)
    + countMatches(text, /(?:^|\s)(?:ve|bir|için|olan|daha|haber|son|ile|bu|da|de)(?=\s|[.,:;!?]|$)/giu);
  const german = countMatches(text, /[äöüßÄÖÜ]/gu)
    + countMatches(text, /(?:^|\s)(?:der|die|das|und|den|dem|ein|eine|nach|mit|für|ist|im)(?=\s|[.,:;!?]|$)/giu);
  const french = countMatches(text, /[àâçéèêëïîôùûüœÀÂÇÉÈÊËÏÎÔÙÛÜŒ]/gu)
    + countMatches(text, /(?:^|\s)(?:les|des|une|dans|pour|avec|sur|est|sont|du|au)(?=\s|[.,:;!?]|$)/giu);
  const spanish = countMatches(text, /[ñ¿¡]/gu)
    + countMatches(text, /(?:^|\s)(?:el|los|las|una|para|con|por|del|que|es|un|la)(?=\s|[.,:;!?]|$)/giu);
  const italian = countMatches(text, /[àèéìòù]/gu)
    + countMatches(text, /(?:^|\s)(?:il|lo|gli|che|per|della|sono|un|una|del|nel|dopo)(?=\s|[.,:;!?]|$)/giu);
  const portuguese = countMatches(text, /[ãõáâêô]/giu)
    + countMatches(text, /(?:^|\s)(?:um|uma|não|estão|para|os|as|depois|da|do|com)(?=\s|[.,:;!?]|$)/giu);
  const english = countMatches(text, /(?:^|\s)(?:the|and|for|from|with|after|that|this|has|have|said|new)(?=\s|[.,:;!?]|$)/giu);

  return pickWinner([
    { language: 'tr', score: turkish },
    { language: 'de', score: german },
    { language: 'fr', score: french },
    { language: 'es', score: spanish },
    { language: 'it', score: italian },
    { language: 'pt', score: portuguese },
    { language: 'en', score: english + 1 },
  ], 'en');
}

export function detectSourceLanguageFromItems(
  items: Array<{ title?: string | null; summary?: string | null; content?: string | null }>,
): SourceLanguage {
  return detectSourceLanguage(
    items.map((item) => [item.title, item.summary, item.content].filter(Boolean).join('\n')).join('\n'),
  );
}

/** Decide whether content should use Persian rewrite or translation prompts. */
export function shouldUsePersianRewrite(sourceLanguage: string | null | undefined, text: string): boolean {
  const language = normalizeSourceLanguage(sourceLanguage);
  if (language === 'fa') return true;
  if (language !== 'auto') return false;
  return isLikelyPersianNews(text);
}
