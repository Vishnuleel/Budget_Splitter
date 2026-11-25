import { useEffect, useMemo } from 'react';
import { chargedInrById, markupOf, type ChargedSource } from '../../shared/forex.js';
import { convertOn, loadRatesBetween, useRates } from './money';
import type { Transaction } from './types';

/** What a foreign card spend really cost in rupees, and how far above the ECB rate that was. */
export type CardCharge = { inr: number; source: ChargedSource; fair: number; extra: number; pct: number };

const dayOf = (iso: string) => iso.slice(0, 10);
const shiftDay = (day: string, days: number) => new Date(Date.parse(day) + days * 86_400_000).toISOString().slice(0, 10);

export const isForeignSpend = (t: Transaction) => (t.currency ?? 'INR') !== 'INR' && t.category !== 'Income';

/** The spend at the ECB rate of its day, in rupees. */
export const fairInrOf = (t: Pick<Transaction, 'amount' | 'currency' | 'date'>) =>
  convertOn(Number(t.amount) || 0, t.currency, 'INR', dayOf(t.date));

/** Rupees charged for each foreign spend we can work out (typed in, printed in the SMS, or from the limit drop). */
export function useCardCharges(transactions: Transaction[]) {
  const rates = useRates(); // re-run when daily ECB rates arrive
  const days = useMemo(() => transactions.filter(isForeignSpend).map(t => dayOf(t.date)).sort(), [transactions]);
  const first = days[0];
  const last = days[days.length - 1];

  useEffect(() => {
    if (!first || !last) return;
    const floor = shiftDay(new Date().toISOString().slice(0, 10), -400);
    // Start a few days early so a weekend spend still has the Friday fix.
    loadRatesBetween(shiftDay(first < floor ? floor : first, -5), last);
  }, [first, last]);

  return useMemo(() => {
    const byId = new Map(transactions.map(t => [t.id, t]));
    const out = new Map<number, CardCharge>();
    for (const [id, c] of chargedInrById(transactions, fairInrOf)) {
      const fair = fairInrOf(byId.get(id)!);
      out.set(id, { ...c, fair, ...markupOf(c.inr, fair) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, rates]);
}
