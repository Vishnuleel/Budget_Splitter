// Tests for item-by-item bill splitting and the Swedish receipt reader.  Run: npm run test:bill
import assert from 'node:assert/strict';
import { splitBill, allocate } from '../shared/billSplit.js';
import { parseReceiptText, normalizeReceipt, SAMPLE_RECEIPT } from '../shared/receipt.js';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); } catch (err) { failures++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}
const sum = obj => Math.round(Object.values(obj).reduce((a, v) => a + (typeof v === 'number' ? v : v.total) * 100, 0)) / 100;
const ALL = ['me', 'rahul', 'arjun'];

console.log('\nSplitting');
await test('Gemini: a busy model falls through to the next; a bad key stops at once', async () => {
  const { askGemini } = await import('../shared/deps.js');
  const tried = [];
  const ai = fails => ({ models: { generateContent: async ({ model }) => {
    tried.push(model);
    if (fails[model]) throw new Error(fails[model]);
    return { text: model };
  } } });
  const env = { GEMINI_MODEL: 'a, b ,c' };
  assert.equal((await askGemini(env, ai({ a: '{"code":503,"status":"UNAVAILABLE"}', b: '429 RESOURCE_EXHAUSTED' }), {})).text, 'c');
  assert.deepEqual(tried, ['a', 'b', 'c']);
  tried.length = 0;
  await assert.rejects(askGemini(env, ai({ a: 'API key not valid' }), {}), /API key/);
  assert.deepEqual(tried, ['a'], 'same key for every model, so no point trying more');
  await assert.rejects(askGemini(env, ai({ a: '503', b: '503', c: 'last one' }), {}), /last one/);
});

await test('mushrooms: Rahul pays nothing for them, others share', () => {
  const r = splitBill([
    { id: 'm', name: 'Champinjoner', price: 24.90, among: ['me', 'arjun'] },
    { id: 'k', name: 'Kyckling', price: 90, among: ALL },
  ], [], ALL, 'me');
  assert.equal(r.per.rahul.total, 30);
  assert.equal(r.per.rahul.items.some(i => i.id === 'm'), false);
  assert.equal(r.per.arjun.total, 42.45);
  assert.equal(r.per.me.total, 42.45);
  assert.equal(sum(r.per), 114.90);
});
await test('"only me" items cost the others nothing', () => {
  const r = splitBill([{ id: 's', name: 'Schampo', price: 39.90, among: ['me'] }], [], ALL, 'me');
  assert.deepEqual([r.per.me.total, r.per.rahul.total, r.per.arjun.total], [39.90, 0, 0]);
});
await test('unequal shares (2 of 3 packs)', () => {
  const r = splitBill([{ id: 'y', name: 'Yoghurt x3', price: 30, among: ['me', 'rahul'], shares: { me: 2, rahul: 1 } }], [], ALL, 'me');
  assert.equal(r.per.me.total, 20);
  assert.equal(r.per.rahul.total, 10);
});
await test('rounding: 10 kr three ways still adds up to 10,00 exactly', () => {
  const r = splitBill([{ id: 'x', name: 'Bröd', price: 10, among: ALL }], [], ALL, 'me');
  assert.equal(sum(r.per), 10);
  assert.deepEqual(Object.values(r.per).map(p => p.total).sort(), [3.33, 3.33, 3.34]);
  assert.equal(r.per.me.total, 3.34, 'payer gets the extra öre');
});
await test('bill discount follows what each person bought; bag fee is equal', () => {
  const r = splitBill([
    { id: 'a', name: 'Mine', price: 75, among: ['me'] },
    { id: 'b', name: 'Rahul', price: 25, among: ['rahul'] },
  ], [{ name: 'Kupong', amount: -10, kind: 'discount' }, { name: 'Bärkasse', amount: 3, kind: 'fee' }], ['me', 'rahul'], 'me');
  assert.equal(r.per.me.total, 75 - 7.5 + 1.5);
  assert.equal(r.per.rahul.total, 25 - 2.5 + 1.5);
  assert.equal(r.total, 93);
});
await test('items nobody is on are reported, not silently dropped', () => {
  const r = splitBill([{ id: 'z', name: 'Mystery', price: 5, among: [] }], [], ALL, 'me');
  assert.deepEqual(r.unassigned, ['z']);
});
await test('allocate handles negatives and zero', () => {
  assert.deepEqual(allocate(-100, { a: 1, b: 1, c: 1 }, 'a'), { a: -34, b: -33, c: -33 });
  assert.deepEqual(allocate(0, { a: 1 }), { a: 0 });
});
await test('fuzz: 500 random bills always add up to the receipt to the öre', () => {
  for (let n = 0; n < 500; n++) {
    const items = Array.from({ length: 1 + (n % 9) }, (_, i) => ({
      id: `i${i}`, name: 'x', price: Math.round(Math.random() * 20000) / 100,
      among: ALL.filter(() => Math.random() > 0.4).concat(i % 3 ? [] : ['me']),
    })).map(i => ({ ...i, among: i.among.length ? [...new Set(i.among)] : ['me'] }));
    const extras = n % 2 ? [{ name: 'Kupong', amount: -(n % 37), kind: 'discount' }] : [];
    const r = splitBill(items, extras, ALL, 'me');
    assert.equal(sum(r.per), r.total, `bill ${n}`);
  }
});

console.log('\nReceipts');
await test('ICA: item discount, pant on the cola, bag fee, coupon, total matches', () => {
  const r = parseReceiptText(SAMPLE_RECEIPT);
  assert.equal(r.store, 'ICA Supermarket');
  const by = Object.fromEntries(r.items.map(i => [i.name, i.price]));
  assert.equal(by['Kycklingfilé 900g'], 74.90);
  assert.equal(by['Coca-cola 1,5l'], 26.90);
  assert.equal(by['Champinjoner 250g'], 24.90);
  assert.equal(r.items.length, 8);
  assert.deepEqual(r.extras.map(x => x.kind), ['fee', 'discount']);
  const parsed = Math.round((r.items.reduce((a, i) => a + i.price, 0) + r.extras.reduce((a, x) => a + x.amount, 0)) * 100) / 100;
  assert.equal(parsed, r.total);
  assert.equal(r.total, 257.40);
});
await test('Willys: quantity lines (2 st x 12,95)', () => {
  const r = parseReceiptText(`WILLYS Hemma Sveavägen
2 st x 12,95 YOGHURT NATURELL
YOGHURT NATURELL 2st x 12,95   25,90
BANANER 0,812 kg x 24,90       20,22
Summa                          46,12`);
  assert.equal(r.store, 'Willys Hemma');
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.price]), [['Yoghurt Naturell', 2, 25.90], ['Bananer', 0.812, 20.22]]);
  assert.equal(r.total, 46.12);
});
await test('Lidl: VAT letters after prices, pant line, "Att betala"', () => {
  const r = parseReceiptText(`Lidl Sverige KB
Mineralvatten 1,5l        9,90 B
Pant                      2,00 A
Kassler skivad           29,90 B
Tidning                  45,00 C
Att betala               86,80`);
  assert.deepEqual(r.items.map(i => [i.name, i.price]), [['Mineralvatten 1,5l', 11.90], ['Kassler skivad', 29.90], ['Tidning', 45.00]]);
  assert.equal(r.total, 86.80);
});
await test('Coop: member discount is bill-level, card/moms lines ignored', () => {
  const r = parseReceiptText(`Stora Coop Västberga
Havregryn                 21,95
Ägg 12-p                  39,95
Medlemsrabatt            -6,19
Totalt                    55,71
Bankkort                  55,71
Varav moms                 5,97`);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.extras, [{ name: 'Medlemsrabatt', amount: -6.19, kind: 'discount' }]);
  assert.equal(r.total, 55.71);
});
await test('photo-reader output is cleaned up (bad rows dropped, discounts applied)', () => {
  const r = normalizeReceipt({ store: 'ICA', currency: 'SEK', total: '50', items: [
    { name: 'GURKA', price: 15, discount: 5 },
    { name: '', price: 3 },
    { name: 'Läsk', price: 20, pant: 2 },
    { name: 'Ignore me', price: 'abc' },
  ], extras: [{ name: 'Påse', amount: 2, kind: 'fee' }] });
  assert.deepEqual(r.items.map(i => [i.name, i.price]), [['Gurka', 10], ['Läsk', 22]]);
  assert.equal(r.total, 50);
  assert.equal(r.extras[0].kind, 'fee');
});

console.log('\nPhoto endpoint');
const { createReceiptHandler } = await import('../shared/receiptAi.js');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
function callReceipt(deps, body, token = 'tok') {
  return new Promise(resolve => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); return this; } };
    createReceiptHandler(deps)({ method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  });
}
const okDeps = {
  configured: true,
  verifyUser: async t => (t === 'tok' ? { id: 'u1', disabled: false } : t === 'paused' ? { id: 'u2', disabled: true } : null),
  readReceipt: async () => ({ store: 'ICA', total: 34.8, items: [{ name: 'CHAMPINJONER', price: 24.9 }, { name: 'LÖK', price: 9.9 }] }),
};
await test('needs a signed-in, active person', async () => {
  assert.equal((await callReceipt(okDeps, { image: PNG }, null)).status, 401);
  assert.equal((await callReceipt(okDeps, { image: PNG }, 'paused')).status, 403);
  assert.equal((await callReceipt({ ...okDeps, configured: false }, { image: PNG })).status, 503);
});
await test('rejects non-images', async () => {
  assert.equal((await callReceipt(okDeps, { image: 'data:text/html;base64,PGgxPg==' })).status, 400);
});
await test('returns cleaned items; reader failures are a friendly 502', async () => {
  const r = await callReceipt(okDeps, { image: PNG });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.receipt.items.map(i => i.name), ['Champinjoner', 'Lök']);
  const bad = await callReceipt({ ...okDeps, readReceipt: async () => { throw new Error('boom'); } }, { image: PNG });
  assert.equal(bad.status, 502);
  assert.match(bad.body.error, /\(boom\)/);
  const quota = await callReceipt({ ...okDeps, readReceipt: async () => { throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'); } }, { image: PNG });
  assert.match(quota.body.error, /quota exceeded/);
  const leak = await callReceipt({ ...okDeps, readReceipt: async () => { throw new Error('bad key AQ.Ab12cd-34ef'); } }, { image: PNG });
  assert.doesNotMatch(leak.body.error, /AQ\.Ab12/);
});

console.log(failures ? `\n${failures} failed\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
