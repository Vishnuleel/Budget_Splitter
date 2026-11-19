// Tests for friends + bills sent into friends' accounts, receipt merging, and the bag-fee rule.  Run: npm run test:friends
import assert from 'node:assert/strict';
import { splitBill } from '../shared/billSplit.js';
import { mergeReceipts, parseReceiptText, SAMPLE_RECEIPT } from '../shared/receipt.js';
import { personKey, sharedBalances, todo, changePreview, transition } from '../shared/sharedBill.js';
import { createSharedHandler, makeMemorySharedDeps } from '../shared/friends.js';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); } catch (err) { failures++; console.log(`  ✗ ${name}\n    ${err.stack.split('\n').slice(0, 2).join('\n    ')}`); }
}

const users = {
  tv: { id: 'viedu', name: 'Viedu', email: 'viedu@example.com' },
  tr: { id: 'rahul', name: 'Rahul', email: 'rahul@example.com' },
  ta: { id: 'arjun', name: 'Arjun', email: 'arjun@example.com' },
  tx: { id: 'stranger', name: 'Stranger', email: 'x@example.com' },
};
const deps = makeMemorySharedDeps({ users });
const handler = createSharedHandler(deps);
async function call(token, body) {
  return new Promise(resolve => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); return this; } };
    handler({ method: 'POST', body, headers: { authorization: `Bearer ${token}` } }, res);
  });
}
const ok = async (token, body) => { const r = await call(token, body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

const V = personKey('viedu'), R = personKey('rahul'), A = personKey('arjun');
const BILL = {
  title: 'ICA', store: 'ICA', currency: 'SEK', payer: V,
  people: [{ id: V, name: 'You' }, { id: R, name: 'Rahul' }, { id: A, name: 'Arjun' }],
  items: [
    { id: 'm', name: 'Champinjoner', price: 24.9, among: [V, R, A] },
    { id: 'k', name: 'Kyckling', price: 90, among: [V, R, A] },
  ],
  extras: [{ name: 'Bärkasse', amount: 3, kind: 'fee' }],
};

console.log('\nBag fee');
await test('someone with no items pays none of the bag fee', () => {
  const r = splitBill([{ id: 'a', name: 'Mjölk', price: 20, among: ['me', 'rahul'] }], [{ name: 'Bärkasse', amount: 3, kind: 'fee' }], ['me', 'rahul', 'sneha'], 'me');
  assert.equal(r.per.sneha.total, 0);
  assert.equal(r.per.me.total + r.per.rahul.total, 23);
});

console.log('\nSeveral receipts');
await test('merge: items from both, fees labelled per store, total is the sum', () => {
  const a = parseReceiptText(SAMPLE_RECEIPT);
  const b = { store: 'Lidl', currency: 'SEK', items: [{ id: 'x', name: 'Bröd', qty: 1, price: 25 }], extras: [{ name: 'Påse', amount: 2, kind: 'fee' }], total: 27 };
  const m = mergeReceipts([a, b]);
  assert.equal(m.store, 'ICA Supermarket Odenplan · Lidl'.replace('ICA Supermarket Odenplan', a.store));
  assert.equal(m.items.length, a.items.length + 1);
  assert.equal(new Set(m.items.map(i => i.id)).size, m.items.length, 'ids unique');
  assert.ok(m.extras.some(x => x.name === 'Påse (Lidl)'));
  assert.equal(m.total, Math.round((a.total + 27) * 100) / 100);
});
await test('merge: unknown total if any receipt lacks one', () => {
  const m = mergeReceipts([{ store: 'A', currency: 'SEK', items: [{ id: '1', name: 'x', qty: 1, price: 1 }], extras: [], total: null }, { store: 'B', currency: 'SEK', items: [{ id: '1', name: 'y', qty: 1, price: 2 }], extras: [], total: 2 }]);
  assert.equal(m.total, null);
});

console.log('\nFriends');
await test('request by email → they accept → connected both ways', async () => {
  await ok('tv', { action: 'request', email: 'RAHUL@example.com' });
  let r = await ok('tr', { action: 'list' });
  const req = r.friends.find(f => f.id === 'viedu');
  assert.equal(req.status, 'pending'); assert.equal(req.direction, 'in');
  await ok('tr', { action: 'respond_friend', id: req.requestId, accept: true });
  r = await ok('tv', { action: 'list' });
  assert.equal(r.friends.find(f => f.id === 'rahul').status, 'accepted');
});
await test('unknown email gets the same answer (no account probing)', async () => {
  const a = await ok('tv', { action: 'request', email: 'nobody@example.com' });
  assert.match(a.message, /If they have an account/);
});
await test('asking someone who already asked you connects straight away', async () => {
  await ok('ta', { action: 'request', email: 'viedu@example.com' });
  const a = await ok('tv', { action: 'request', email: 'arjun@example.com' });
  assert.match(a.message, /Connected/);
});
await test('can only send bills to connected friends', async () => {
  const r = await call('tv', { action: 'send', bill: { ...BILL, people: [...BILL.people, { id: personKey('stranger'), name: 'S' }] }, members: ['rahul', 'stranger'] });
  assert.equal(r.status, 403);
});
await test('only the payer can send the bill', async () => {
  const r = await call('tr', { action: 'send', bill: BILL, members: ['viedu'] });
  assert.notEqual(r.status, 200);
});

console.log('\nShared bills');
let billId;
const rowFor = async t => (await ok(t, { action: 'list' })).bills.find(b => b.id === billId);
await test('send → shows as "review" for each friend; balances stay 0 until accepted', async () => {
  billId = (await ok('tv', { action: 'send', bill: BILL, members: ['rahul', 'arjun'] })).id;
  const rows = (await ok('tr', { action: 'list' })).bills;
  assert.equal(todo(rows, 'rahul')[0].kind, 'review');
  assert.equal(sharedBalances(rows, 'viedu').size, 0);
});
await test('friend accepts → both balances show it', async () => {
  await ok('ta', { action: 'act', id: billId, do: 'accept' });
  const rows = (await ok('tv', { action: 'list' })).bills;
  assert.equal(sharedBalances(rows, 'viedu').get(A), 39.3); // 24,90/3 + 90/3 + 3/3 = 8,30 + 30 + 1
  assert.equal(sharedBalances(rows, 'arjun').get(V), -39.3);
});
await test('untick → payer sees who it affects → approve re-splits among the rest', async () => {
  await ok('tr', { action: 'act', id: billId, do: 'request_change', args: { removed: ['m'], note: 'No mushrooms' } });
  let rows = (await ok('tv', { action: 'list' })).bills;
  const t = todo(rows, 'viedu').find(x => x.kind === 'approve');
  assert.equal(t.member.user_id, 'rahul');
  const prev = changePreview(t.bill.bill, R, t.member.removed);
  assert.equal(prev.find(p => p.id === R).delta, -8.3);
  assert.equal(prev.find(p => p.id === A).delta, 4.15);
  await ok('tv', { action: 'act', id: billId, do: 'approve_change', args: { member: 'rahul' } });
  rows = (await ok('ta', { action: 'list' })).bills;
  const row = rows.find(b => b.id === billId);
  assert.deepEqual(row.bill.items.find(i => i.id === 'm').among, [V, A]);
  assert.equal(row.members.find(m => m.user_id === 'rahul').status, 'accepted');
  // Arjun already accepted, so he's told his part changed.
  const ch = todo(rows, 'arjun').find(x => x.kind === 'changed');
  assert.equal(Math.round((ch.to - ch.from) * 100) / 100, 4.15);
  await ok('ta', { action: 'act', id: billId, do: 'ack' });
  assert.equal(todo((await ok('ta', { action: 'list' })).bills, 'arjun').length, 0);
});
await test('payer can keep them on it → friend sees the reply and must accept or decline', async () => {
  await ok('tr', { action: 'act', id: billId, do: 'request_change', args: { removed: ['k'] } });
  await ok('tv', { action: 'act', id: billId, do: 'keep', args: { member: 'rahul', reply: 'You ate half of it!' } });
  const row = await rowFor('tr');
  const m = row.members.find(x => x.user_id === 'rahul');
  assert.equal(m.status, 'pending'); assert.equal(m.reply, 'You ate half of it!');
  assert.deepEqual(row.bill.items.find(i => i.id === 'k').among, [V, R, A]);
  await ok('tr', { action: 'act', id: billId, do: 'accept' });
});
await test('a friend can’t approve their own change or edit the bill', async () => {
  await ok('tr', { action: 'act', id: billId, do: 'request_change', args: { removed: ['k'] } });
  const r = await call('tr', { action: 'act', id: billId, do: 'approve_change', args: { member: 'rahul' } });
  assert.equal(r.status, 409);
  await ok('tv', { action: 'act', id: billId, do: 'keep', args: { member: 'rahul' } });
  await ok('tr', { action: 'act', id: billId, do: 'accept' });
});
await test('paid only when the payer confirms', async () => {
  await ok('tr', { action: 'act', id: billId, do: 'claim_paid' });
  let rows = (await ok('tv', { action: 'list' })).bills;
  assert.ok(sharedBalances(rows, 'viedu').get(R) > 0, 'still owed while only claimed');
  assert.equal(todo(rows, 'viedu').find(x => x.kind === 'confirm').member.user_id, 'rahul');
  await ok('tv', { action: 'act', id: billId, do: 'confirm_paid', args: { member: 'rahul' } });
  rows = (await ok('tr', { action: 'list' })).bills;
  assert.equal(sharedBalances(rows, 'rahul').get(V) ?? 0, 0);
});
await test('payer can record cash received without a claim', async () => {
  await ok('tv', { action: 'act', id: billId, do: 'confirm_paid', args: { member: 'arjun' } });
  assert.equal(sharedBalances((await ok('tv', { action: 'list' })).bills, 'viedu').get(A) ?? 0, 0);
});
await test('strangers can’t see or touch the bill', async () => {
  assert.equal((await ok('tx', { action: 'list' })).bills.length, 0);
  assert.equal((await call('tx', { action: 'act', id: billId, do: 'accept' })).status, 404);
});
await test('concurrent edits: stale version is retried, not lost', async () => {
  const row = deps.db.bills.find(b => b.id === billId);
  const stale = structuredClone(row);
  assert.equal(await deps.saveBill(billId, { bill: row.bill, members: row.members }, row.version), true);
  assert.equal(await deps.saveBill(billId, { bill: stale.bill, members: stale.members }, stale.version), false);
});
await test('transition rejects declining after paying', () => {
  const row = { owner: 'v', bill: { ...BILL, payer: personKey('v') }, members: [{ user_id: 'r', status: 'accepted', paid: 'claimed', removed: [] }] };
  assert.throws(() => transition(row, 'r', 'decline'));
});

console.log(failures ? `\n${failures} failed\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
