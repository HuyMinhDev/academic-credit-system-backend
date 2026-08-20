
export function formatVietnamTime(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  const shifted = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = shifted.getUTCFullYear();

  return `${dd}/${mm}/${yyyy}`;
}