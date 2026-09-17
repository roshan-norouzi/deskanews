export function normalizeDigits(value: string): string {
  return value
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '');
}

/** Display digits with Western thousand separators. */
export function formatGroupedDigits(value: string | number): string {
  const digits = normalizeDigits(String(value));
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function parseGroupedDigits(value: string): string {
  return normalizeDigits(value);
}
