function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function attributionVariant(seed: string): number {
  let hash = 0;
  for (const character of seed) hash = ((hash * 31) + character.codePointAt(0)!) >>> 0;
  return hash % 5;
}

function sourceAnchor(sourceName: string, sourceUrl: string): string {
  if (!/^https?:\/\//iu.test(sourceUrl.trim())) return escapeHtml(sourceName || sourceUrl);
  return `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceName || sourceUrl)}</a>`;
}

/** Plain Persian body → WordPress HTML with auto intro + source footer. */
export function toWordPressHtml(value: string, sourceName: string, sourceUrl: string, seed: string): string {
  const paragraphs = value.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!paragraphs.length) return '';
  const source = sourceAnchor(sourceName, sourceUrl);
  const attributions = [
    `به گزارش ${source}، `,
    `${source} گزارش داده است که `,
    `بر پایه گزارش ${source}، `,
    `طبق گزارش منتشرشده از سوی ${source}، `,
    `آن‌گونه که ${source} گزارش کرده است، `,
  ];
  const body = paragraphs.map((paragraph, index) => {
    const text = escapeHtml(paragraph).replace(/\n/g, '<br>');
    return `<p>${index === 0 ? attributions[attributionVariant(seed)] : ''}${text}</p>`;
  });
  body.push(`<p>منبع: ${source}</p>`);
  return body.join('\n');
}

export function looksLikePublishHtml(value: string): boolean {
  return /<(?:p|h[1-6]|div|br|strong|b|em|i|u|ul|ol|li|a)\b/iu.test(value);
}

const ALLOWED_TAGS = new Set(['p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a']);

/** Keep only safe tags for WordPress body HTML edited in the publish modal. */
export function sanitizePublishHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  // Browser / Node with DOM: prefer real DOM when available.
  if (typeof globalThis.DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(`<div id="deska-root">${trimmed}</div>`, 'text/html');
    const root = document.getElementById('deska-root');
    if (!root) return '';
    const walk = (node: Node): string => {
      if (node.nodeType === 3) return escapeHtml(node.textContent || '');
      if (node.nodeType !== 1) return '';
      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object') return '';
      const children = Array.from(element.childNodes).map(walk).join('');
      if (!ALLOWED_TAGS.has(tag)) return children;
      if (tag === 'br') return '<br>';
      if (tag === 'a') {
        const href = (element.getAttribute('href') || '').trim();
        if (!/^https?:\/\//iu.test(href)) return children;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${children}</a>`;
      }
      return `<${tag}>${children}</${tag}>`;
    };
    return Array.from(root.childNodes).map(walk).join('').trim();
  }

  // Worker / test fallback without DOMParser: strip disallowed tags by regex.
  return trimmed
    .replace(/<(script|style|iframe|object|img|video|audio|svg|math)\b[^>]*>[\s\S]*?<\/\1>/giu, '')
    .replace(/<\/?(script|style|iframe|object|img|video|audio|svg|math)\b[^>]*\/?>/giu, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu, '')
    .replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/giu, (match, tag: string, attrs = '') => {
      const name = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return '';
      if (name === 'br') return '<br>';
      if (match.startsWith('</')) return `</${name}>`;
      if (name === 'a') {
        const hrefMatch = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/iu);
        const href = (hrefMatch?.[2] || hrefMatch?.[3] || hrefMatch?.[4] || '').trim();
        if (!/^https?:\/\//iu.test(href)) return '';
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`;
      }
      return `<${name}>`;
    })
    .trim();
}

/** Prefer editor HTML when present; otherwise wrap plain text with attribution. */
export function resolvePublishHtml(
  value: string,
  sourceName: string,
  sourceUrl: string,
  seed: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (looksLikePublishHtml(trimmed)) return sanitizePublishHtml(trimmed);
  return toWordPressHtml(trimmed, sourceName, sourceUrl, seed);
}
