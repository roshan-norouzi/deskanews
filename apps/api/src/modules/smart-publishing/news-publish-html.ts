function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function attributionVariant(seed: string): number {
  let hash = 0;
  for (const character of seed) hash = ((hash * 31) + character.codePointAt(0)!) >>> 0;
  return hash % 5;
}

function sourceAnchor(sourceName: string, sourceUrl: string): string {
  return `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceName || sourceUrl)}</a>`;
}

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
