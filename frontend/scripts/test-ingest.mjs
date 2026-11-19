// Tests for the SMS endpoint pipeline — no Supabase needed.  Run: npm run test:sms
import assert from 'node:assert/strict';
import { createIngestHandler, hashSmsKey } from '../shared/ingest.js';
import { parseSms } from '../shared/sms.js';

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

const KEY_RAHUL = 'bs_rahul_personal_key_0123456789';
const KEY_PAUSED = 'bs_paused_personal_key_0123456789';

function fakeDb() {
  const rows = [];
  const people = new Map([
    [hashSmsKey(KEY_RAHUL), { id: 'u-rahul', disabled: false }],
    [hashSmsKey(KEY_PAUSED), { id: 'u-paused', disabled: true }],
  ]);
  return {
    rows,
    configured: true,
    resolveUser: async h => people.get(h) ?? null,
    loadRules: async userId => (userId === 'u-rahul' ? [{ merchant: 'Kebab Corner', category: 'Food & Dining' }] : []),
    findRecentDuplicate: async (userId, text) => rows.find(r => r.user_id === userId && r.raw_text === text) ?? null,
    insert: async row => { const r = { id: rows.length + 1, ...row }; rows.push(r); return { data: [r], error: null }; },
  };
}

function call(handler, { method = 'POST', body, headers = {}, query = {} }) {
  return new Promise(resolve => {
    const res = {
      code: 200,
      status(c) { this.code = c; return this; },
      json(payload) { resolve({ status: this.code, body: payload }); return this; },
    };
    handler({ method, body, headers, query }, res);
  });
}

const CARD = 'Txn of SEK 245.00 done using HDFC Bank Card x1234 at ICA SUPERMARKET ODENPLAN on 17-11-26. Not you? Call 18002586161';

console.log('\nParser');
const cases = [
  [CARD, { amount: 245, currency: 'SEK', merchant: 'ICA Supermarket Odenplan', category: 'Groceries' }],
  ['USD 11.99 spent using ICICI Bank Card XX1234 on 16-Nov-26 on SPOTIFY. Avl Limit: INR 1,23,456.00', { amount: 11.99, currency: 'USD', merchant: 'Spotify', category: 'Entertainment' }],
  ['Spent SEK 89.00 Card no. XX1234 17-11-26 08:12:40 IST ESPRESSO HOUSE Avl Lmt INR 98,765.43', { amount: 89, currency: 'SEK', merchant: 'Espresso House', category: 'Food & Dining' }],
  ['Rs 85.40 debited from your HDFC Bank Card x1234 towards Cross Currency Markup fee on 16-11-26', { amount: 85.4, currency: 'INR', category: 'Bank fees' }],
  ['INR 1,00,000.00 debited from A/c XX1234 on 12-11-26 for Outward Remittance SWIFT Ref ABC123', { amount: 100000, currency: 'INR', category: 'Transfers' }],
  ['Your A/c XX1234 debited by Rs 50000.00 on 12-11-26 NEFT to HEIMSTADEN AB Ref 99', { amount: 50000, currency: 'INR', category: 'Housing' }],
  ['Rs.450.00 debited from A/c XX1234 on 17-11-26 to VPA swiggy@icici. UPI Ref 431122.', { amount: 450, currency: 'INR', merchant: 'Swiggy' }],
  ['Kortköp 1 245,00 kr på WILLYS ODENPLAN', { amount: 1245, currency: 'SEK', merchant: 'Willys Odenplan', category: 'Groceries' }],
];
for (const [sms, want] of cases) {
  await test(sms.slice(0, 58) + '…', () => {
    const got = parseSms(sms);
    for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, `${k}: expected ${v}, got ${got[k]}`);
  });
}

console.log('\nEndpoint');
const ok = { secret: KEY_RAHUL };
await test('refuses everything when the server is not configured', async () => {
  const r = await call(createIngestHandler({ ...fakeDb(), configured: false }), { body: { text: CARD, ...ok } });
  assert.equal(r.status, 503);
});
await test('rejects a missing or malformed key', async () => {
  const h = createIngestHandler(fakeDb());
  assert.equal((await call(h, { body: { text: CARD } })).status, 401);
  assert.equal((await call(h, { body: { text: CARD, secret: 'not-a-key' } })).status, 401);
});
await test('rejects an unknown (e.g. replaced) key', async () => {
  const r = await call(createIngestHandler(fakeDb()), { body: { text: CARD, secret: 'bs_unknown_key_00000000000' } });
  assert.equal(r.status, 401);
});
await test('refuses a paused account', async () => {
  const db = fakeDb();
  const r = await call(createIngestHandler(db), { body: { text: CARD, secret: KEY_PAUSED } });
  assert.equal(r.status, 403);
  assert.equal(db.rows.length, 0);
});
await test("saves to the key owner's account with a phone-friendly message", async () => {
  const db = fakeDb();
  const r = await call(createIngestHandler(db), { body: { text: CARD, ...ok } });
  assert.equal(r.status, 200);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].user_id, 'u-rahul');
  assert.equal(db.rows[0].currency, 'SEK');
  assert.match(r.body.message, /^Saved 245\skr · ICA Supermarket Odenplan · Groceries$/);
});
await test('does not save the same SMS twice', async () => {
  const db = fakeDb();
  const h = createIngestHandler(db);
  await call(h, { body: { text: CARD, ...ok } });
  const r = await call(h, { body: { text: CARD, ...ok } });
  assert.equal(r.body.duplicate, true);
  assert.equal(db.rows.length, 1);
});
for (const [label, sms, reason] of [
  ['OTP', 'Your OTP for transaction of SEK 245.00 on HDFC Card x1234 is 482913. Do not share it with anyone.', 'otp'],
  ['offer', 'Congratulations! You are pre-approved for a Personal Loan of Rs 5,00,000. Apply now', 'promo'],
  ['statement', 'Your HDFC Card statement: Total amount due Rs 18,400, minimum amount due Rs 920, due date 05-12-26', 'statement'],
  ['declined', 'Txn of SEK 899.00 on HDFC Card x1234 at IKEA was declined due to insufficient limit', 'declined'],
  ['no amount', 'Dear customer, your card ending 1234 has been activated for international use.', 'no-amount'],
]) {
  await test(`ignores ${label}`, async () => {
    const db = fakeDb();
    const r = await call(createIngestHandler(db), { body: { text: sms, ...ok } });
    assert.equal(r.status, 200);
    assert.equal(r.body.ignored, true);
    assert.equal(r.body.reason, reason);
    assert.equal(db.rows.length, 0);
  });
}
await test("applies the key owner's merchant rules", async () => {
  const db = fakeDb();
  await call(createIngestHandler(db), { body: { text: 'Txn of SEK 95.00 done using HDFC Bank Card x1234 at KEBAB CORNER on 17-11-26.', ...ok } });
  assert.equal(db.rows[0].category, 'Food & Dining');
});
await test('accepts plain text body + x-api-secret header (MacroDroid style)', async () => {
  const db = fakeDb();
  const r = await call(createIngestHandler(db), { body: CARD, headers: { 'x-api-secret': KEY_RAHUL } });
  assert.equal(r.status, 200);
  assert.equal(db.rows.length, 1);
});
await test('accepts a JSON string body (Shortcuts sometimes sends text/plain JSON)', async () => {
  const db = fakeDb();
  const r = await call(createIngestHandler(db), { body: JSON.stringify({ text: CARD, ...ok }) });
  assert.equal(r.status, 200);
  assert.equal(db.rows.length, 1);
});
await test('accepts a Bearer token', async () => {
  const r = await call(createIngestHandler(fakeDb()), { body: { text: CARD }, headers: { authorization: `Bearer ${KEY_RAHUL}` } });
  assert.equal(r.status, 200);
});
await test('GET returns a usage hint (handy to test the URL from a phone browser)', async () => {
  const r = await call(createIngestHandler(fakeDb()), { method: 'GET' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

console.log(failures ? `\n${failures} failed\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
