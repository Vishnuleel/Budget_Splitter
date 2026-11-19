import type { SplitEntry, SplitPerson } from './settings';
import { convert } from './money';
import { splitBill } from '../../shared/billSplit.js';

export const AVATAR_COLORS = ['#b45309', '#0f766e', '#be185d', '#1d4ed8', '#4d7c0f', '#c2410c', '#0e7490', '#475569'];

export function avatarColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** What each person in an entry owes (in the entry's own currency). */
export function entryShares(e: SplitEntry): Record<string, number> {
  if (e.items?.length) {
    const r = splitBill(e.items, e.extras ?? [], e.among, e.paidBy);
    return Object.fromEntries(Object.entries(r.per).map(([p, v]) => [p, v.total]));
  }
  const share = e.among.length ? e.amount / e.among.length : 0;
  return Object.fromEntries(e.among.map(p => [p, share]));
}

/** Positive = they owe you. Negative = you owe them. In the display currency. */
export function balances(people: SplitPerson[], entries: SplitEntry[]) {
  const map = new Map<string, number>(people.map(p => [p.id, 0]));
  for (const e of entries) {
    if (!e.among.length) continue;
    const shares = entryShares(e);
    // Old entries without a currency were INR.
    const c = (n: number) => convert(n, e.currency ?? 'INR');
    if (e.paidBy === 'me') {
      // Linked friends (u_…) are counted from the shared bill they accepted, not from this local copy.
      for (const p of e.among) if (p !== 'me' && !p.startsWith('u_') && !e.settled.includes(p)) map.set(p, (map.get(p) ?? 0) + c(shares[p] ?? 0));
    } else if (e.among.includes('me') && !e.settled.includes('me')) {
      map.set(e.paidBy, (map.get(e.paidBy) ?? 0) - c(shares.me ?? 0));
    }
  }
  return map;
}

export function settleWith(personId: string, entries: SplitEntry[]): SplitEntry[] {
  return entries.map(e => {
    if (e.paidBy === 'me' && e.among.includes(personId) && !e.settled.includes(personId)) return { ...e, settled: [...e.settled, personId] };
    if (e.paidBy === personId && e.among.includes('me') && !e.settled.includes('me')) return { ...e, settled: [...e.settled, 'me'] };
    return e;
  });
}

export const uid = () => Math.random().toString(36).slice(2, 10);
