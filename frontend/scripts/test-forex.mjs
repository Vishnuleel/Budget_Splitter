// Tests for working out what an Indian card really charged abroad.  Run: npm run test:forex
import assert from 'node:assert/strict';
import { smsCardInfo, chargedInrById, markupOf } from '../shared/forex.js';
import { findAmounts } from '../shared/sms.js';
import { parseAmount } from '../src/lib/format.ts'; // Node strips the types
import { parseSms } from '../shared/sms.js';
import { classifyJunk } from '../shared/ingest.js';

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); } catch (err) { failures++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

const idfc = (sek, place, limit, day = 24) =>
  `Happy Shopping! SEK ${sek.toFixed(2)} spent on your IDFC FIRST Bank Credit Card ending XX9269 at ${place} on ${day} NOV 2026 at 09:58 PM Avbl Limit: INR ${limit} If not done by you, call 180010888 for dispute or to block your card SMS CCBLOCK 9269 to 5676732`;

test('IDFC SMS: amount, merchant and category', () => {
  const text = idfc(149, 'BILTEMA SWEDEN KARLSKR', '44714.12');
  assert.equal(classifyJunk(text), null);
  const p = parseSms(text);
  assert.equal(p.amount, 149);
  assert.equal(p.currency, 'SEK');
  assert.equal(p.merchant, 'Biltema Sweden Karlskr');
  assert.equal(p.category, 'Appliances or tools');
});

test('IDFC SMS: card and available limit, no rupee charge printed', () => {
  assert.deepEqual(smsCardInfo(idfc(149, 'BILTEMA SWEDEN KARLSKR', '44714.12')), { card: '9269', limit: 44714.12, chargedInr: null });
});

test('other banks: card and limit formats', () => {
  assert.deepEqual(smsCardInfo('Txn of SEK 245.00 done using HDFC Bank Card x1234 at ICA NARA on 15-11-26. Avl Lmt: Rs 1,23,456.00'),
    { card: '1234', limit: 123456, chargedInr: null });
  assert.equal(smsCardInfo('Available credit limit is INR 50,000 on card **4411').limit, 50000);
});

test('rupee amount printed next to the foreign one is the charge, not the limit', () => {
  const info = smsCardInfo('INR 1,450.20 (SEK 149.00) spent on Card XX9269 at IKEA. Avbl Limit: INR 44,714.12');
  assert.equal(info.chargedInr, 1450.2);
  assert.equal(info.limit, 44714.12);
});

const fair = t => Number(t.amount) * 9.25; // pretend ECB: 1 SEK = ₹9.25
const tx = (id, date, sek, limit, extra = {}) => ({ id, date, amount: sek, currency: 'SEK', category: 'Groceries', raw_text: idfc(sek, 'ICA', limit), ...extra });

test('drop in available limit between two SMS = rupees charged', () => {
  const m = chargedInrById([
    tx(1, '2026-11-20T10:00:00Z', 100, '46200.00'),
    tx(2, '2026-11-24T21:58:00Z', 149, '44776.95'), // 1423.05 for 149 kr: 9.55/kr, 3.2% over ECB
  ], fair);
  assert.equal(m.has(1), false, 'the first SMS has nothing to compare with');
  assert.deepEqual(m.get(2), { inr: 1423.05, source: 'limit' });
});

test('a bill payment in between makes the drop implausible, so it is skipped', () => {
  const m = chargedInrById([
    tx(1, '2026-11-20T10:00:00Z', 100, '20000.00'),
    tx(2, '2026-11-24T21:58:00Z', 149, '44714.12'), // limit went UP: card bill was paid
    tx(3, '2026-11-25T12:00:00Z', 50, '44000.00'), // 714.12 for 50 kr: 54% over, not trusted
  ], fair);
  assert.equal(m.size, 0);
});

test('typed-in rupees win, and SMS order works even when rows arrive unsorted', () => {
  const m = chargedInrById([
    tx(2, '2026-11-24T21:58:00Z', 149, '44776.95', { charged_inr: 1430 }),
    tx(1, '2026-11-20T10:00:00Z', 100, '46200.00'),
  ], fair);
  assert.deepEqual(m.get(2), { inr: 1430, source: 'manual' });
});

test('a rupee figure far from the ECB value (missed credit limit) is not taken as the charge', () => {
  const m = chargedInrById([
    { id: 1, date: '2026-11-20T10:00:00Z', amount: 100, currency: 'SEK', category: 'Groceries', raw_text: 'Txn of SEK 100 on card XX1234. Total Credit Limit Rs 2,00,000' },
  ], fair);
  assert.equal(m.has(1), false);
});

test('typed amounts: decimal comma vs grouping comma', () => {
  for (const [s, n] of [['49,90', 49.9], ['1,200', 1200], ['1,23,456', 123456], ['1,234.50', 1234.5], ['1.234,50', 1234.5], ['0,5', 0.5], ['', 0]]) {
    assert.equal(parseAmount(s), n, s);
  }
});

test('amount formats: kr with dot decimal, comma decimal after a code, "Rs" inside a word', () => {
  const a = t => findAmounts(t).map(x => [x.currency, x.amount]);
  assert.deepEqual(a('Kortköp 245.50 kr på WILLYS'), [['SEK', 245.5]]);
  assert.deepEqual(a('Txn of SEK 245,50 at ICA'), [['SEK', 245.5]]);
  assert.deepEqual(a('1 245,00 kr'), [['SEK', 1245]]);
  assert.deepEqual(a('Rs 1,23,456.00 debited'), [['INR', 123456]]);
  assert.deepEqual(a('SEK 1,245 at X'), [['SEK', 1245]]);
  assert.deepEqual(a('Spent USD 12 to bars 12'), [['USD', 12]]);
});

test('different cards are tracked separately; rupee spends never get a charge', () => {
  const m = chargedInrById([
    tx(1, '2026-11-20T10:00:00Z', 100, '46200.00'),
    { id: 2, date: '2026-11-21T10:00:00Z', amount: 500, currency: 'SEK', category: 'Groceries', raw_text: 'SEK 500.00 spent on Card ending XX1111 at COOP. Avbl Limit: INR 10000.00' },
    { id: 3, date: '2026-11-22T10:00:00Z', amount: 300, currency: 'INR', category: 'Groceries', raw_text: 'INR 300.00 spent on Card ending XX9269 at AMAZON. Avbl Limit: INR 45900.00' },
    tx(4, '2026-11-24T21:58:00Z', 149, '44476.95'),
  ], fair);
  assert.equal(m.has(2), false);
  assert.equal(m.has(3), false);
  assert.deepEqual(m.get(4), { inr: 1423.05, source: 'limit' });
});

test('markup maths', () => {
  const r = markupOf(1423.05, 149 * 9.25);
  assert.equal(r.extra, 44.8);
  assert.ok(Math.abs(r.pct - 3.25) < 0.01);
});

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
