// What an Indian card really charged for a foreign spend, and how much of that was markup.
// Shared by the app and the tests. Types live in forex.d.ts.
import { findAmounts } from './sms.js';

const INR_AMOUNT = '(?:INR|Rs\\.?|₹)\\s*(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d{1,2})?(?!\\d)|\\d+(?:\\.\\d{1,2})?)';
// "Avbl Limit: INR 44714.12", "Avl Lmt: Rs 1,23,456.00", "Available credit limit is INR 50,000", "Avl Bal INR 9,120.50"
const LIMIT = new RegExp(`\\b(?:avl|avbl|available)\\.?\\s*(?:credit\\s+)?(?:limit|lmt|bal(?:ance)?)\\s*(?:is\\s*)?:?\\s*${INR_AMOUNT}`, 'i');
// "ending XX9269", "ending in 9269", "Card x1234", "A/c XX1234", "card **9269"
const CARD = /(?:\bending(?:\s+(?:in|with))?\s*[x*]*|(?:^|[\s(])[x*]{1,4})\s*(\d{4})\b/i;

const toNum = s => parseFloat(String(s).replace(/,/g, '')) || 0;
const round2 = n => Math.round(n * 100) / 100;

/** Card, available limit and any rupee amount stated in a bank SMS. */
export function smsCardInfo(text) {
  if (!text) return { card: null, limit: null, chargedInr: null };
  const card = text.match(CARD)?.[1] ?? null;
  const lm = text.match(LIMIT);
  const limit = lm ? toNum(lm[1]) : null;
  const limitAt = lm ? lm.index : -1;
  const limitEnd = lm ? lm.index + lm[0].length : -1;

  // A rupee amount that isn't the limit, on an SMS that also has a foreign amount, is what was debited.
  let chargedInr = null;
  const amounts = findAmounts(text);
  if (amounts.some(a => a.currency !== 'INR')) {
    const inr = amounts.find(a => a.currency === 'INR' && !(a.index >= limitAt && a.index < limitEnd));
    if (inr) chargedInr = inr.amount;
  }
  return { card, limit, chargedInr };
}

/**
 * Rupees debited for each foreign spend we can work out, by id.
 * 1. `charged_inr` typed in by the person,
 * 2. a rupee amount printed in the SMS,
 * 3. the drop in available limit since the previous SMS for the same card.
 *    Only trusted when the implied rate is within 15% of the ECB rate, because a bill payment,
 *    refund or an SMS that never reached the app between the two would make the drop wrong.
 * @param {{id:number, date:string, amount:number|string, currency?:string|null, raw_text?:string|null, charged_inr?:number|string|null, category?:string}[]} txs
 * @param {(tx:object) => number | null} fairInr ECB value of the spend in rupees
 */
export function chargedInrById(txs, fairInr) {
  const out = new Map();
  const byCard = new Map();
  for (const t of [...txs].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    const foreign = (t.currency ?? 'INR') !== 'INR' && t.category !== 'Income';
    const manual = Number(t.charged_inr);
    if (foreign && manual > 0) out.set(t.id, { inr: manual, source: 'manual' });
    const info = smsCardInfo(t.raw_text);
    if (foreign && !out.has(t.id) && info.chargedInr) {
      // A rupee figure far from the ECB value is a limit/balance the LIMIT pattern missed, not the charge.
      const fair = fairInr(t);
      if (!fair || Math.abs(info.chargedInr / fair - 1) <= 0.15) out.set(t.id, { inr: info.chargedInr, source: 'sms' });
    }
    if (!info.card || info.limit == null) continue;
    const prev = byCard.get(info.card);
    byCard.set(info.card, info.limit);
    if (!foreign || out.has(t.id) || prev == null) continue;
    const drop = round2(prev - info.limit);
    const fair = fairInr(t);
    if (drop > 0 && fair && Math.abs(drop / fair - 1) <= 0.15) out.set(t.id, { inr: drop, source: 'limit' });
  }
  return out;
}

/** Markup on one spend: what was charged vs the ECB value, both in rupees. */
export function markupOf(chargedInr, fairInr) {
  const extra = round2(chargedInr - fairInr);
  return { extra, pct: fairInr > 0 ? (extra / fairInr) * 100 : 0 };
}
