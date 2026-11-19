// Item-by-item bill splitting ("I don't eat mushrooms"). Pure, shared by the app and tests.
// All maths in öre/paise (integer hundredths) so every person's share adds up EXACTLY to the bill.

const toCents = n => Math.round((Number(n) || 0) * 100);

/** Split `cents` across ids by weight using largest remainders; ties go to `prefer` first. */
export function allocate(cents, weights, prefer) {
  const ids = Object.keys(weights).filter(id => weights[id] > 0);
  const out = Object.fromEntries(ids.map(id => [id, 0]));
  if (!ids.length || !cents) return out;
  const sum = ids.reduce((a, id) => a + weights[id], 0);
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const exact = ids.map(id => ({ id, v: (abs * weights[id]) / sum }));
  let given = 0;
  for (const e of exact) { out[e.id] = Math.floor(e.v); given += out[e.id]; }
  exact
    .sort((a, b) => (b.v % 1) - (a.v % 1) || (a.id === prefer ? -1 : b.id === prefer ? 1 : a.id.localeCompare(b.id)))
    .slice(0, abs - given)
    .forEach(e => { out[e.id] += 1; });
  if (sign < 0) for (const id of ids) out[id] = -out[id];
  return out;
}

/**
 * @param {{ id: string, name: string, price: number, among: string[], shares?: Record<string, number> }[]} items
 *        price = line total after any item discount/pant; among = who shares it; shares = optional weights (2 of 3 packs)
 * @param {{ name: string, amount: number, kind: 'discount' | 'fee' }[]} extras
 *        bill-level lines: discounts (negative) spread by subtotal, fees (bags, delivery) split equally
 * @param {string[]} people  everyone on the bill
 * @param {string} payer     who paid (gets rounding ties)
 */
export function splitBill(items, extras = [], people, payer) {
  const per = Object.fromEntries(people.map(p => [p, { items: [], subtotal: 0, extras: 0, total: 0 }]));
  let itemsTotal = 0;
  const unassigned = [];

  for (const item of items) {
    const cents = toCents(item.price);
    itemsTotal += cents;
    const among = (item.among || []).filter(p => per[p]);
    if (!among.length) { unassigned.push(item.id); continue; }
    const weights = Object.fromEntries(among.map(p => [p, item.shares?.[p] ?? 1]));
    const parts = allocate(cents, weights, payer);
    for (const [p, c] of Object.entries(parts)) {
      if (!c) continue;
      per[p].items.push({ id: item.id, name: item.name, cents: c, of: cents, sharedWith: among.length });
      per[p].subtotal += c;
    }
  }

  let extrasTotal = 0;
  for (const x of extras) {
    const cents = toCents(x.amount);
    extrasTotal += cents;
    // Fees (bags, delivery) are split equally among people who actually bought something.
    const buyers = people.filter(p => per[p].subtotal !== 0);
    const weights = x.kind === 'fee'
      ? Object.fromEntries((buyers.length ? buyers : people).map(p => [p, 1]))
      // Discounts follow what each person actually bought; if nobody has items, split evenly.
      : Object.fromEntries(people.map(p => [p, Math.max(0, per[p].subtotal)]));
    const anyWeight = Object.values(weights).some(w => w > 0);
    const parts = allocate(cents, anyWeight ? weights : Object.fromEntries(people.map(p => [p, 1])), payer);
    for (const [p, c] of Object.entries(parts)) per[p].extras += c;
  }

  for (const p of people) per[p].total = per[p].subtotal + per[p].extras;
  const total = itemsTotal + extrasTotal;

  return {
    per: Object.fromEntries(Object.entries(per).map(([p, v]) => [p, {
      ...v, subtotal: v.subtotal / 100, extras: v.extras / 100, total: v.total / 100,
      items: v.items.map(i => ({ ...i, amount: i.cents / 100, of: i.of / 100 })),
    }])),
    total: total / 100,
    unassigned,
  };
}

/** How much each non-payer owes the payer for this bill. */
export function owedToPayer(result, payer) {
  return Object.fromEntries(Object.entries(result.per).filter(([p]) => p !== payer).map(([p, v]) => [p, v.total]));
}
