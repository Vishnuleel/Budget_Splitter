// Bills sent straight into friends' accounts. Pure rules shared by the app, the demo backend and tests.
//
// A shared bill = { id, owner, bill, members: Member[] }
//   bill   = { title, store, currency, date, payer, people: [{ id, name }], items, extras }
//            person ids are 'u_<user id>' for linked accounts (payer included), or local ids for name-only people.
//   Member = { user_id, status, removed, note, reply, paid, ack_total }
//     status: 'pending'          → waiting for the friend to look at it
//             'change_requested' → friend unticked items (`removed`); waiting for the payer to approve or keep
//             'accepted'         → counts in both people's balances
//             'declined'         → doesn't count
//     paid:   'none' | 'claimed' (friend says they paid) | 'confirmed' (payer confirmed → settled for both)
import { splitBill } from './billSplit.js';

export const personKey = userId => `u_${userId}`;

export function computeShares(bill) {
  return splitBill(bill.items, bill.extras || [], bill.people.map(p => p.id), bill.payer);
}

/** What one person owes on this bill (in the bill's currency). */
export function shareOf(bill, key) {
  return computeShares(bill).per[key]?.total ?? 0;
}

/**
 * The bill after taking `key` off `itemIds`. The item's cost is split again among whoever is still on it;
 * if nobody is left, it goes back to the payer.
 */
export function applyRemoval(bill, key, itemIds) {
  const drop = new Set(itemIds);
  return {
    ...bill,
    items: bill.items.map(i => {
      if (!drop.has(i.id) || !i.among.includes(key)) return i;
      const among = i.among.filter(p => p !== key);
      const shares = i.shares ? Object.fromEntries(Object.entries(i.shares).filter(([p]) => p !== key)) : undefined;
      return { ...i, among: among.length ? among : [bill.payer], shares: among.length ? shares : undefined };
    }),
  };
}

/** Before → after for everyone, so the payer sees exactly who a change affects. */
export function changePreview(bill, key, itemIds) {
  const before = computeShares(bill).per;
  const after = computeShares(applyRemoval(bill, key, itemIds)).per;
  return bill.people.map(p => ({
    id: p.id, name: p.name,
    before: before[p.id]?.total ?? 0,
    after: after[p.id]?.total ?? 0,
    delta: Math.round(((after[p.id]?.total ?? 0) - (before[p.id]?.total ?? 0)) * 100) / 100,
  }));
}

/** Does this member's row still count toward balances? */
export const counts = m => m.status === 'accepted' && m.paid !== 'confirmed';

/**
 * Net balance per linked friend from shared bills, from `me`'s point of view.
 * Positive = they owe me. Keys are personKey(friend user id). Amounts in each bill's currency,
 * passed through `convert(amount, currency)` so they add up in the display currency.
 */
export function sharedBalances(rows, me, convert = n => n) {
  const out = new Map();
  const add = (k, v) => out.set(k, Math.round(((out.get(k) ?? 0) + v) * 100) / 100);
  for (const r of rows) {
    const shares = computeShares(r.bill).per;
    const cur = r.bill.currency;
    if (r.owner === me) {
      for (const m of r.members) if (counts(m)) add(personKey(m.user_id), convert(shares[personKey(m.user_id)]?.total ?? 0, cur));
    } else {
      const mine = r.members.find(m => m.user_id === me);
      if (mine && counts(mine)) add(personKey(r.owner), -convert(shares[personKey(me)]?.total ?? 0, cur));
    }
  }
  return out;
}

/** What needs `me`'s attention: bills to review, changes to approve, payments to confirm, changed totals. */
export function todo(rows, me) {
  const items = [];
  for (const r of rows) {
    const shares = computeShares(r.bill).per;
    if (r.owner === me) {
      for (const m of r.members) {
        if (m.status === 'change_requested') items.push({ kind: 'approve', bill: r, member: m });
        if (m.status === 'accepted' && m.paid === 'claimed') items.push({ kind: 'confirm', bill: r, member: m });
      }
    } else {
      const m = r.members.find(x => x.user_id === me);
      if (!m) continue;
      const now = shares[personKey(me)]?.total ?? 0;
      if (m.status === 'pending') items.push({ kind: 'review', bill: r, member: m });
      else if (m.status === 'accepted' && m.ack_total != null && Math.abs(now - m.ack_total) >= 0.01 && m.paid !== 'confirmed')
        items.push({ kind: 'changed', bill: r, member: m, from: m.ack_total, to: now });
    }
  }
  return items;
}

/**
 * Legal moves, enforced again in the database. Returns the new member row (and bill) or throws.
 * actor = user id doing it; action = one of the keys below.
 */
export function transition(row, actor, action, args = {}) {
  const isOwner = row.owner === actor;
  const member = row.members.find(m => m.user_id === (isOwner ? args.member : actor));
  if (!member) throw new Error('You’re not on this bill.');
  const shares = () => computeShares(row.bill).per;
  // Notes come straight from the request body: keep them short strings (an object would crash the UI).
  const text = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);
  const key = personKey(member.user_id);
  const set = (patch, bill = row.bill) => ({
    bill,
    members: row.members.map(m => (m.user_id === member.user_id ? { ...m, ...patch } : m)),
  });
  switch (action) {
    case 'accept':
      if (isOwner || !['pending', 'change_requested'].includes(member.status)) throw new Error('Nothing to accept.');
      return set({ status: 'accepted', removed: [], ack_total: shares()[key]?.total ?? 0 });
    case 'decline':
      if (isOwner || member.status === 'declined' || member.paid !== 'none') throw new Error('Can’t decline now.');
      return set({ status: 'declined', note: text(args.note) ?? member.note ?? null });
    case 'request_change': {
      if (isOwner || !['pending', 'accepted'].includes(member.status) || member.paid !== 'none') throw new Error('Can’t change this bill now.');
      const mine = new Set(row.bill.items.filter(i => i.among.includes(key)).map(i => i.id));
      const removed = (args.removed || []).filter(id => mine.has(id));
      if (!removed.length) throw new Error('Untick at least one item.');
      return set({ status: 'change_requested', removed, note: text(args.note), reply: null });
    }
    case 'approve_change': {
      if (!isOwner || member.status !== 'change_requested') throw new Error('No change to approve.');
      const bill = applyRemoval(row.bill, key, member.removed || []);
      const next = computeShares(bill).per;
      return {
        bill,
        members: row.members.map(m => (m.user_id === member.user_id
          ? { ...m, status: 'accepted', removed: [], reply: null, ack_total: next[key]?.total ?? 0 }
          : m)),
      };
    }
    case 'keep':
      if (!isOwner || member.status !== 'change_requested') throw new Error('No change to answer.');
      return set({ status: 'pending', removed: [], reply: text(args.reply) || 'Kept you on those items.' });
    case 'ack':
      if (isOwner || member.status !== 'accepted') throw new Error('Nothing to acknowledge.');
      return set({ ack_total: shares()[key]?.total ?? 0 });
    case 'claim_paid':
      if (isOwner || member.status !== 'accepted' || member.paid !== 'none') throw new Error('Can’t mark this paid.');
      return set({ paid: 'claimed' });
    case 'confirm_paid':
      // The payer can confirm a claimed payment, or record one they received directly (cash).
      if (!isOwner || member.status !== 'accepted' || member.paid === 'confirmed') throw new Error('Nothing to confirm.');
      return set({ paid: 'confirmed' });
    default:
      throw new Error('Unknown action.');
  }
}
