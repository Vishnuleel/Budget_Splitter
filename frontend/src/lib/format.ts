const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrFmt2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Typed or pasted money → number. "49,90" = 49.9 · "1,200" / "1,23,456" = grouping ·
 * "1,234.50" / "1.234,50" = the last separator is the decimal.
 */
export function parseAmount(s: string): number {
  let t = s.replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (/^\d{1,3}(,\d{2,3})*,\d{3}$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  return Math.round((parseFloat(t) || 0) * 100) / 100;
}

/** ₹1,23,456 — Indian digit grouping. */
export function inr(n: number, opts: { decimals?: boolean; sign?: boolean } = {}) {
  const v = Number(n) || 0;
  const body = (opts.decimals && v % 1 !== 0 ? inrFmt2 : inrFmt).format(Math.abs(v));
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${sign}₹${body}`;
}

/** ₹12.5K · ₹3.4L · ₹1.2Cr */
export function inrCompact(n: number) {
  const v = Math.abs(Number(n) || 0);
  const sign = n < 0 ? '−' : '';
  const trim = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '');
  if (v >= 1e7) return `${sign}₹${trim(v / 1e7)}Cr`;
  if (v >= 1e5) return `${sign}₹${trim(v / 1e5)}L`;
  if (v >= 1e3) return `${sign}₹${trim(v / 1e3)}K`;
  return `${sign}₹${Math.round(v)}`;
}

/** Parse "YYYY-MM-DD" as a LOCAL date (new Date("2026-11-20") would be UTC midnight). */
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const due = parseDateOnly(dateStr);
  const today = startOfDay(new Date());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabel(d: Date) {
  const today = startOfDay(new Date());
  const diff = Math.round((today.getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function timeLabel(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function monthLabel(y: number, m: number) {
  return new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function inMonth(dateIso: string, y: number, m: number) {
  const d = new Date(dateIso);
  return d.getFullYear() === y && d.getMonth() === m;
}

export function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Roll a due date forward by one billing cycle, then keep rolling until it is in the future. */
export function nextCycleDate(dateStr: string, cycle: string) {
  const d = parseDateOnly(dateStr);
  const step = (x: Date) => {
    const day = d.getDate();
    const n = new Date(x.getFullYear() + (cycle === 'Yearly' ? 1 : 0), x.getMonth() + (cycle === 'Yearly' ? 0 : 1), 1);
    n.setDate(Math.min(day, daysInMonth(n.getFullYear(), n.getMonth())));
    return n;
  };
  let next = step(d);
  const today = startOfDay(new Date());
  while (next < today) next = step(next);
  return dayKey(next);
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function pct(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}
