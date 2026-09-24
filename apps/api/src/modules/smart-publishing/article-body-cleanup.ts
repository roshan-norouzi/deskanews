/**
 * Removes publisher UI, consent banners, reading-time chips, and related-article
 * teasers from extracted or translated article bodies — without relying on LLM prompts.
 */

const BOILERPLATE_LINE = [
  /^(?:افزودن به فهرست(?:\s*ذخیره)?|in merkenliste speichern|add to (?:reading )?list|save (?:to|for) later)\.?$/iu,
  /^(?:گوش دادن به مقاله|artikel anh(?:ö|o)ren|listen to (?:the )?article)(?:\s*\([\d\s\u06F0-\u06F9]+(?:دقیقه|min(?:ute)?s?)\))?/iu,
  /^(?:گزینه(?:‌|\s)*های بیشتر برای اشتراک(?:‌|\s)*گذاری|mehr teilen-optionen|more sharing options)\.?$/iu,
  /^[\d\u06F0-\u06F9]+\s*(?:دقیقه|minute?s?|min\.?)(?:\s*[\d\u06F0-\u06F9]+\s*(?:دقیقه|minute?s?|min\.?))*\.?$/iu,
  /^(?:نوشته|geschrieben von|written by|by)\s+.+(?:،|,)\s*[\d\u06F0-\u06F9]+\s*(?:دقیقه|min(?:ute)?s?\.?)/iu,
  /^منبع\s*[:：]/iu,
  /^quelle\s*[:：]/iu,
  /^source\s*[:：]/iu,
  /^(?:اشتراک(?:‌|\s)*گذاری|teilen|share|bookmark)\.?$/iu,
  /^(?:به گزارش|nach berichten von|according to)\s+.+،\s*افزودن به فهرست/iu,
  /(?:موافقم|i agree that).*(?:محتوای خارجی|external content)/iu,
  /(?:personal data|daten.*personenbezogen|drittanbieter|third[- ]?part(?:y|ies)).*(?:privacy|datenschutz|حریم خصوصی)/iu,
  /اطلاعات بیشتر در سیاست حفظ حریم خصوصی/iu,
  /more information in our privacy policy/iu,
];

function normalizeParagraph(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitParagraphs(value: string): string[] {
  return value
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map(normalizeParagraph)
    .filter(Boolean);
}

export function isBoilerplateArticleLine(line: string): boolean {
  const text = normalizeParagraph(line);
  if (!text) return true;
  if (text.length <= 2) return true;
  return BOILERPLATE_LINE.some((pattern) => pattern.test(text));
}

function scrubInlineUiFragments(paragraph: string): string {
  let text = normalizeParagraph(paragraph);
  text = text.replace(/(?:،|,)\s*افزودن به فهرست(?:\s*ذخیره)?\.?\s*$/iu, '');
  text = text.replace(/\s*گوش دادن به مقاله\s*\([\d\u06F0-\u06F9]+\s*دقیقه\)\s*[\d\u06F0-\u06F9]+\s*دقیقه\s*/giu, ' ');
  text = text.replace(/\s*گزینه(?:‌|\s)*های بیشتر برای اشتراک(?:‌|\s)*گذاری\s*/giu, ' ');
  return normalizeParagraph(text);
}

function isLikelyPhotoCaption(paragraph: string, nextParagraph?: string): boolean {
  const text = normalizeParagraph(paragraph);
  if (text.length > 140) return false;
  if (/[.!؟?]["»]?\s*$/.test(text)) return false;
  const nextLen = normalizeParagraph(nextParagraph || '').length;
  return nextLen >= 180 && text.length <= 120;
}

function isRelatedTeaserParagraph(paragraph: string): boolean {
  const text = normalizeParagraph(paragraph);
  if (!text) return true;
  if (isBoilerplateArticleLine(text)) return true;
  if (text.length <= 80 && /[\d\u06F0-\u06F9]+\s*(?:دقیقه|min)/iu.test(text)) return true;
  if (text.length <= 160 && /^(?:نوشته|by|geschrieben von)\s+/iu.test(text)) return true;
  if (text.length <= 100 && /^[\d\u06F0-\u06F9]+\s*دقیقه\s*افزودن/u.test(text)) return true;
  return false;
}

function trimLeadingNoise(paragraphs: string[]): string[] {
  let start = 0;
  while (start < paragraphs.length) {
    const current = paragraphs[start];
    const scrubbed = scrubInlineUiFragments(current);
    if (scrubbed && !isBoilerplateArticleLine(scrubbed) && !isLikelyPhotoCaption(scrubbed, paragraphs[start + 1])) {
      paragraphs[start] = scrubbed;
      break;
    }
    start += 1;
  }
  return paragraphs.slice(start).map((paragraph, index, list) => {
    const cleaned = scrubInlineUiFragments(paragraph);
    if (isBoilerplateArticleLine(cleaned)) return '';
    if (isLikelyPhotoCaption(cleaned, list[index + 1])) return '';
    return cleaned;
  }).filter(Boolean);
}

function trimRelatedTail(paragraphs: string[]): string[] {
  let end = paragraphs.length;
  while (end > 0) {
    const windowStart = Math.max(0, end - 4);
    const tail = paragraphs.slice(windowStart, end);
    if (tail.length >= 2 && tail.every(isRelatedTeaserParagraph)) {
      end = windowStart;
      continue;
    }
    if (end > 0 && isRelatedTeaserParagraph(paragraphs[end - 1])) {
      end -= 1;
      continue;
    }
    break;
  }
  return paragraphs.slice(0, end);
}

function dropConsentBlocks(paragraphs: string[]): string[] {
  return paragraphs.filter((paragraph) => {
    const text = normalizeParagraph(paragraph);
    if (text.length > 420) return true;
    if (/موافقم که محتوای خارجی/iu.test(text)) return false;
    if (/i agree that external content/iu.test(text)) return false;
    if (/personal data may be transferred/iu.test(text)) return false;
    if (/daten.*an.*dritte/iu.test(text) && /datenschutz/iu.test(text)) return false;
    return true;
  });
}

/** Clean extracted or translated full article text for storage and publishing. */
export function cleanExtractedArticleText(value: string): string {
  if (!value?.trim()) return '';
  let paragraphs = splitParagraphs(value);
  paragraphs = trimLeadingNoise(paragraphs);
  paragraphs = dropConsentBlocks(paragraphs);
  paragraphs = trimRelatedTail(paragraphs);
  return paragraphs.join('\n\n').trim();
}
