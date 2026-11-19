// Friends + bills sent into friends' accounts: client for POST /api/shared, a small shared store,
// and a demo backend (pretend friends who answer) so the whole flow works without Supabase.
import { useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { isDemoMode } from './demo';
import { convert } from './money';
import { createSharedHandler, makeMemorySharedDeps } from '../../shared/friends.js';
import { personKey, sharedBalances, todo, type Action, type SharedBillDoc, type SharedBillRow, type Todo } from '../../shared/sharedBill.js';

export type Friend = { requestId: string; id: string; name: string; status: 'pending' | 'accepted'; direction: 'in' | 'out' };
type ListRes = { me: { id: string; name: string }; friends: Friend[]; bills: SharedBillRow[]; names: Record<string, string> };
type Res = { status: number; body: Record<string, unknown> };
type Handler = (req: object, res: object) => unknown;

// ── Demo backend ────────────────────────────────────────────
const DEMO_ME = 'demo-you';
const DEMO_USERS = {
  demo: { id: DEMO_ME, name: 'You', email: 'you@example.com' },
  'demo-rahul': { id: 'demo-rahul', name: 'Rahul', email: 'rahul@example.com' },
  'demo-sneha': { id: 'demo-sneha', name: 'Sneha', email: 'sneha@example.com' },
  'demo-arjun': { id: 'demo-arjun', name: 'Arjun', email: 'arjun@example.com' },
};
let demoHandler: Handler | null = null;
let demoDeps: ReturnType<typeof makeMemorySharedDeps> | null = null;
let seeding: Promise<void> | null = null;

async function demoCall(token: string, body: Record<string, unknown>): Promise<Res> {
  if (!demoHandler) {
    demoDeps = makeMemorySharedDeps({ users: DEMO_USERS, persist: localStorage });
    demoHandler = createSharedHandler(demoDeps) as Handler;
    seeding = seedDemo();
  }
  if (seeding) await seeding;
  return rawCall(token, body);
}

function rawCall(token: string, body: Record<string, unknown>): Promise<Res> {
  return new Promise<Res>(resolve => {
    const res = { code: 200, status(c: number) { this.code = c; return this; }, json(b: Record<string, unknown>) { resolve({ status: this.code, body: b }); return this; } };
    demoHandler!({ method: 'POST', body, headers: { authorization: `Bearer ${token}` } }, res);
  });
}

/** First visit: Rahul is a friend, Sneha has asked to connect, and Rahul has sent you a bill to review. */
async function seedDemo() {
  if (localStorage.getItem('bs-demo:friends')) return;
  const as = (t: string, body: Record<string, unknown>) => rawCall(t, body);
  await as('demo-rahul', { action: 'request', email: 'you@example.com' });
  await as('demo-arjun', { action: 'request', email: 'you@example.com' });
  const list = (await as('demo', { action: 'list' })).body as unknown as ListRes;
  for (const f of list.friends) await as('demo', { action: 'respond_friend', id: f.requestId, accept: true });
  await as('demo-sneha', { action: 'request', email: 'you@example.com' });
  // Rahul and Arjun know each other too, so Rahul can send a bill to both of you.
  await as('demo-rahul', { action: 'request', email: 'arjun@example.com' });
  await as('demo-arjun', { action: 'request', email: 'rahul@example.com' });
  const R = personKey('demo-rahul'), Y = personKey(DEMO_ME), A = personKey('demo-arjun');
  const sent = await as('demo-rahul', {
    action: 'send', members: [DEMO_ME, 'demo-arjun'],
    bill: {
      title: 'Willys', store: 'Willys', currency: 'SEK', payer: R, date: new Date(Date.now() - 864e5).toISOString(),
      people: [{ id: R, name: 'Rahul' }, { id: Y, name: 'You' }, { id: A, name: 'Arjun' }],
      items: [
        { id: 'w1', name: 'Pasta Penne', price: 19.9, among: [R, Y, A] },
        { id: 'w2', name: 'Krossade tomater', price: 24.5, among: [R, Y, A] },
        { id: 'w3', name: 'Halloumi', price: 39.9, among: [R, Y] },
        { id: 'w4', name: 'Diskmedel', price: 29.9, among: [R, Y, A] },
        { id: 'w5', name: 'Proteinbar', price: 22, among: [R] },
      ],
      extras: [{ name: 'Bärkasse', amount: 3, kind: 'fee' }],
    },
  });
  if (sent.status >= 400) console.warn('Demo seed failed:', sent.body.error);
  else await as('demo-arjun', { action: 'act', id: sent.body.id, do: 'accept' });
}

/** Demo only: the friend answers a bill you sent, a moment later. Rahul unticks his first item; others accept. */
function simulateReplies(billId: string, members: string[]) {
  window.setTimeout(async () => {
    const row = (demoDeps as unknown as { db: { bills: SharedBillRow[] } }).db.bills.find(b => b.id === billId);
    if (!row) return;
    for (const m of members) {
      const tok = m; // demo tokens are the user ids
      const mine = row.bill.items.filter(i => i.among.includes(personKey(m)));
      if (m === 'demo-rahul' && mine.length > 1) await demoCall(tok, { action: 'act', id: billId, do: 'request_change', args: { removed: [mine[0].id], note: `I didn’t have any ${mine[0].name.toLowerCase()}` } });
      else await demoCall(tok, { action: 'act', id: billId, do: 'accept' });
    }
    await refresh();
  }, 2500);
}

// ── Transport ───────────────────────────────────────────────
async function call<T>(body: Record<string, unknown>): Promise<T> {
  let out: Res;
  if (isDemoMode()) {
    out = await demoCall('demo', body);
    await new Promise(r => setTimeout(r, 150));
  } else {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Sign in first.');
    let res: Response;
    try {
      res = await fetch('/api/shared', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body) });
    } catch { throw new Error('Could not reach the server. Are you online?'); }
    out = { status: res.status, body: await res.json().catch(() => ({ error: `Server error (${res.status}).` })) };
  }
  if (out.status >= 400) throw new Error(String(out.body.error || 'Request failed'));
  return out.body as T;
}

// ── Store ───────────────────────────────────────────────────
export type SharedState = {
  ready: boolean;
  error: string | null;
  me: { id: string; name: string } | null;
  friends: Friend[];
  bills: SharedBillRow[];
  names: Record<string, string>;
  todo: Todo[];
  /** Net per linked friend (key = personKey(user id)), positive = they owe you, in the display currency. */
  balances: Map<string, number>;
};
const EMPTY: SharedState = { ready: false, error: null, me: null, friends: [], bills: [], names: {}, todo: [], balances: new Map() };
let state = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const sharedEnabled = () => isDemoMode() || isSupabaseConfigured;

export async function refresh() {
  if (!sharedEnabled()) return;
  try {
    const r = await call<ListRes>({ action: 'list' });
    state = {
      ready: true, error: null, me: r.me, friends: r.friends, bills: r.bills, names: r.names,
      todo: todo(r.bills, r.me.id),
      balances: sharedBalances(r.bills, r.me.id, (n, c) => convert(n, c)),
    };
  } catch (e) {
    state = { ...state, ready: true, error: (e as Error).message };
  }
  emit();
}

let timer: number | undefined;
function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1) {
    void refresh();
    timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
    window.addEventListener('focus', onFocus);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size) { window.clearInterval(timer); window.removeEventListener('focus', onFocus); }
  };
}
const onFocus = () => void refresh();

export function useShared() {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** Connected friends as bill people: id = personKey(user id). */
export const linkedPeople = (s: SharedState) =>
  s.friends.filter(f => f.status === 'accepted').map(f => ({ id: personKey(f.id), name: f.name, userId: f.id }));

export const isLinkedId = (id: string) => id.startsWith('u_');

// ── Actions ─────────────────────────────────────────────────
export async function requestFriend(email: string) {
  const r = await call<{ message: string }>({ action: 'request', email });
  await refresh();
  return r.message;
}
export async function respondFriend(id: string, accept: boolean) { await call({ action: 'respond_friend', id, accept }); await refresh(); }
export async function removeFriend(id: string) { await call({ action: 'remove_friend', id }); await refresh(); }

export async function sendBill(bill: SharedBillDoc, members: string[]) {
  const r = await call<{ id: string }>({ action: 'send', bill, members });
  if (isDemoMode()) simulateReplies(r.id, members);
  await refresh();
  return r.id;
}

export async function act(id: string, action: Action, args?: Record<string, unknown>) {
  const r = await call<{ bill: SharedBillDoc; members: SharedBillRow['members'] }>({ action: 'act', id, do: action, args });
  await refresh();
  return r;
}
