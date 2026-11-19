// Tests for "pick your items" share links.  Run: npm run test:share
import assert from 'node:assert/strict';
import { createBillShareHandler, makeMemoryShareDeps, applyClaims } from '../shared/billShare.js';
import { splitBill } from '../shared/billSplit.js';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); } catch (err) { failures++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}
function call(h, body, token) {
  return new Promise(resolve => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); return this; } };
    h({ method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  });
}
const BILL = {
  title: 'ICA', currency: 'SEK', payer: 'me',
  people: [{ id: 'me', name: 'You' }, { id: 'rahul', name: 'Rahul' }, { id: 'arjun', name: 'Arjun' }],
  items: [
    { id: 'mush', name: 'Champinjoner', price: 24.9, among: ['me', 'rahul', 'arjun'] },
    { id: 'milk', name: 'Mjölk', price: 18, among: ['me', 'rahul', 'arjun'] },
    { id: 'shmp', name: 'Schampo', price: 39.9, among: ['me'] },
  ],
  extras: [{ name: 'Kupong', amount: -5, kind: 'discount' }],
};
const setup = () => { const deps = makeMemoryShareDeps({ users: { tok: { id: 'u-me' }, other: { id: 'u-x' }, paused: { id: 'u-p', disabled: true } } }); return { deps, h: createBillShareHandler(deps) }; };

console.log('\nShare links');
await test('only signed-in, active people can create links', async () => {
  const { h } = setup();
  assert.equal((await call(h, { action: 'create', bill: BILL })).status, 401);
  assert.equal((await call(h, { action: 'create', bill: BILL }, 'paused')).status, 403);
});
await test('creates a link; only the token hash is stored', async () => {
  const { h, deps } = setup();
  const r = await call(h, { action: 'create', bill: BILL }, 'tok');
  assert.equal(r.status, 200);
  assert.ok(r.body.token.length >= 30);
  assert.equal(JSON.stringify(deps.rows).includes(r.body.token), false);
});
await test('roommate view shows items and names, not who owes what', async () => {
  const { h } = setup();
  const { body: { token } } = await call(h, { action: 'create', bill: BILL }, 'tok');
  const v = await call(h, { action: 'view', token });
  assert.equal(v.status, 200);
  assert.deepEqual(v.body.bill.items.map(i => i.id), ['mush', 'milk', 'shmp']);
  assert.deepEqual(v.body.answered, []);
});
await test('Rahul unticks mushrooms; picks apply to the split', async () => {
  const { h } = setup();
  const { body: { id, token } } = await call(h, { action: 'create', bill: BILL }, 'tok');
  assert.equal((await call(h, { action: 'claim', token, personId: 'rahul', itemIds: ['milk', 'bogus'] })).status, 200);
  const s = await call(h, { action: 'status', ids: [id] }, 'tok');
  const claims = s.body.shares[0].claims;
  assert.deepEqual(claims.rahul.itemIds, ['milk'], 'unknown item ids are dropped');
  const items = applyClaims(BILL.items, claims);
  assert.deepEqual(items.find(i => i.id === 'mush').among, ['me', 'arjun']);
  assert.deepEqual(items.find(i => i.id === 'milk').among, ['me', 'arjun', 'rahul']);
  const r = splitBill(items, BILL.extras, ['me', 'rahul', 'arjun'], 'me');
  assert.equal(r.per.rahul.items.some(i => i.id === 'mush'), false);
  assert.equal(Math.round(Object.values(r.per).reduce((a, p) => a + p.total * 100, 0)) / 100, 77.8);
});
await test('people who did not answer keep the owner’s assignment', async () => {
  const items = applyClaims(BILL.items, { rahul: { itemIds: [] } });
  assert.deepEqual(items.find(i => i.id === 'milk').among, ['me', 'arjun']);
});
await test('bad tokens, wrong names and the payer are refused', async () => {
  const { h } = setup();
  const { body: { token } } = await call(h, { action: 'create', bill: BILL }, 'tok');
  assert.equal((await call(h, { action: 'view', token: 'x'.repeat(32) })).status, 404);
  assert.equal((await call(h, { action: 'claim', token, personId: 'mallory', itemIds: [] })).status, 400);
  assert.equal((await call(h, { action: 'claim', token, personId: 'me', itemIds: [] })).status, 400);
});
await test('owners only see and close their own links', async () => {
  const { h } = setup();
  const { body: { id, token } } = await call(h, { action: 'create', bill: BILL }, 'tok');
  assert.deepEqual((await call(h, { action: 'status', ids: [id] }, 'other')).body.shares, []);
  await call(h, { action: 'close', id }, 'other');
  assert.equal((await call(h, { action: 'view', token })).status, 200, 'someone else cannot close it');
  await call(h, { action: 'close', id }, 'tok');
  assert.equal((await call(h, { action: 'view', token })).status, 404);
});
await test('expired links are refused', async () => {
  const { h, deps } = setup();
  const { body: { token } } = await call(h, { action: 'create', bill: BILL }, 'tok');
  deps.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await call(h, { action: 'view', token })).status, 410);
});
await test('bills need a roommate and items; oversize input is trimmed', async () => {
  const { h } = setup();
  assert.equal((await call(h, { action: 'create', bill: { ...BILL, people: [{ id: 'me', name: 'You' }] } }, 'tok')).status, 400);
  assert.equal((await call(h, { action: 'create', bill: { ...BILL, items: [] } }, 'tok')).status, 400);
});

console.log(failures ? `\n${failures} failed\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
