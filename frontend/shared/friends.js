// POST /api/shared — friends (requests by email) and bills sent straight into friends' accounts.
// Every write goes through here so the rules in sharedBill.js (`transition`) are enforced on the server;
// the database itself only lets the service role touch these tables.
// Pure logic + injected storage: runs on Cloudflare/Vercel, in tests, and in the browser (demo mode).
import { sanitizeBill } from './billShare.js';
import { personKey, transition } from './sharedBill.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (s, m) => { throw new HttpError(s, m); };
const MAX_OPEN_REQUESTS = 30;

/** sanitizeBill + uneven-split weights, store and date, which shared bills keep. */
export function sanitizeSharedBill(b) {
  const clean = sanitizeBill(b);
  const byId = new Map((Array.isArray(b?.items) ? b.items : []).map(i => [String(i?.id ?? ''), i]));
  clean.items = clean.items.map(i => {
    const raw = byId.get(i.id)?.shares;
    if (!raw || typeof raw !== 'object') return i;
    const shares = Object.fromEntries(i.among.map(p => [p, Math.max(0, Math.min(20, Number(raw[p]) || 0))]));
    return Object.values(shares).some(w => w > 0) ? { ...i, shares } : i;
  });
  clean.store = typeof b?.store === 'string' ? b.store.slice(0, 60) : null;
  clean.date = typeof b?.date === 'string' && !Number.isNaN(Date.parse(b.date)) ? b.date : new Date().toISOString();
  return clean;
}

/**
 * deps: {
 *   configured,
 *   verifyUser(token) → { id, disabled, name } | null,
 *   findUserByEmail(email) → { id, name, disabled } | null,
 *   names(ids) → { [id]: name },
 *   friendships(me) → [{ id, requester, addressee, status, created_at }],
 *   insertFriendship({ requester, addressee }) → row, setFriendship(id, status), deleteFriendship(id),
 *   bills(me) → [{ id, owner, bill, members, version, created_at }],
 *   getBill(id) → row | null,
 *   insertBill({ owner, bill, members, member_ids }) → row,
 *   saveBill(id, { bill, members }, version) → true if saved (false = someone else changed it first)
 * }
 */
export function createSharedHandler(deps) {
  async function who(req) {
    const auth = req.headers?.authorization || '';
    const t = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const u = t ? await deps.verifyUser(t) : null;
    if (!u) fail(401, 'Sign in first.');
    if (u.disabled) fail(403, 'This account is paused.');
    return u;
  }

  async function friendsOf(me) {
    const rows = await deps.friendships(me.id);
    const other = r => (r.requester === me.id ? r.addressee : r.requester);
    const names = await deps.names([...new Set(rows.map(other))]);
    return rows.map(r => ({
      requestId: r.id,
      id: other(r),
      name: names[other(r)] || 'Someone',
      status: r.status,
      direction: r.requester === me.id ? 'out' : 'in',
    }));
  }

  async function run(req) {
    if (req.method !== 'POST') fail(405, 'Method not allowed');
    if (!deps.configured) fail(503, 'Accounts aren’t set up on the server yet.');
    const me = await who(req);
    const body = typeof req.body === 'object' && req.body ? req.body : {};

    switch (body.action) {
      case 'list': {
        const [friends, bills] = await Promise.all([friendsOf(me), deps.bills(me.id)]);
        const ids = new Set(bills.flatMap(b => [b.owner, ...b.members.map(m => m.user_id)]));
        return { me: { id: me.id, name: me.name }, friends, bills, names: await deps.names([...ids]) };
      }

      case 'request': {
        const email = String(body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter their email address.');
        const them = await deps.findUserByEmail(email);
        // Same answer whether or not the email exists, so nobody can probe who has an account.
        const sent = { ok: true, message: 'If they have an account, they’ll see your request.' };
        if (!them || them.disabled || them.id === me.id) return sent;
        const rows = await deps.friendships(me.id);
        const existing = rows.find(r => (r.requester === them.id && r.addressee === me.id) || (r.requester === me.id && r.addressee === them.id));
        if (existing?.status === 'accepted') return { ok: true, message: 'You’re already connected.' };
        if (existing && existing.requester === them.id && existing.status === 'pending') {
          await deps.setFriendship(existing.id, 'accepted'); // they'd already asked you: connect now
          return { ok: true, message: `Connected with ${them.name}.` };
        }
        if (existing) await deps.deleteFriendship(existing.id); // re-ask after a decline
        if (rows.filter(r => r.requester === me.id && r.status === 'pending').length >= MAX_OPEN_REQUESTS) fail(429, 'Too many open requests.');
        await deps.insertFriendship({ requester: me.id, addressee: them.id });
        return sent;
      }

      case 'respond_friend': {
        const r = (await deps.friendships(me.id)).find(x => x.id === body.id);
        if (!r || r.addressee !== me.id || r.status !== 'pending') fail(404, 'Request not found.');
        if (body.accept) await deps.setFriendship(r.id, 'accepted'); else await deps.deleteFriendship(r.id);
        return { ok: true };
      }

      case 'remove_friend': {
        const r = (await deps.friendships(me.id)).find(x => x.id === body.id);
        if (!r) fail(404, 'Not found.');
        await deps.deleteFriendship(r.id);
        return { ok: true };
      }

      case 'send': {
        const bill = sanitizeSharedBill(body.bill);
        const friends = new Set((await deps.friendships(me.id)).filter(r => r.status === 'accepted').map(r => (r.requester === me.id ? r.addressee : r.requester)));
        const members = [...new Set((Array.isArray(body.members) ? body.members : []).map(String))];
        if (!members.length) fail(400, 'Pick at least one connected friend.');
        for (const id of members) {
          if (!friends.has(id)) fail(403, 'You can only send bills to connected friends.');
          if (!bill.people.some(p => p.id === personKey(id))) fail(400, 'A friend is missing from the bill.');
        }
        if (bill.payer !== personKey(me.id)) fail(400, 'Only the person who paid can send the bill.');
        const row = await deps.insertBill({
          owner: me.id, bill, member_ids: members,
          members: members.map(user_id => ({ user_id, status: 'pending', removed: [], note: null, reply: null, paid: 'none', ack_total: null })),
        });
        return { id: row.id };
      }

      case 'act': {
        for (let attempt = 0; attempt < 3; attempt++) {
          const row = await deps.getBill(String(body.id || ''));
          if (!row || (row.owner !== me.id && !row.members.some(m => m.user_id === me.id))) fail(404, 'Bill not found.');
          let next;
          try { next = transition(row, me.id, String(body.do || ''), body.args || {}); } catch (e) { fail(409, e.message); }
          if (await deps.saveBill(row.id, next, row.version)) return { ok: true, bill: next.bill, members: next.members };
        }
        fail(409, 'The bill just changed. Try again.');
      }
      // falls through only via fail()

      default:
        fail(400, 'Unknown action.');
    }
  }

  return async function handler(req, res) {
    try {
      return res.status(200).json(await run(req));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error('Shared bills error:', err);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  };
}

/**
 * In-memory storage for tests and demo mode. `persist` (localStorage) keeps it across reloads.
 * users: { [token]: { id, name, email, disabled? } }
 */
export function makeMemorySharedDeps({ users = {}, persist } = {}) {
  const KEY = 'bs-demo:friends';
  let db = { friendships: [], bills: [], n: 0 };
  const load = () => {
    if (persist) { try { db = JSON.parse(persist.getItem(KEY) || 'null') || db; } catch { /* keep */ } }
    return db;
  };
  const save = () => { if (persist) persist.setItem(KEY, JSON.stringify(db)); };
  const all = () => Object.values(users);
  const nid = p => `${p}_${++load().n}_${Date.now().toString(36)}`;
  load();
  return {
    configured: true,
    get db() { return load(); },
    verifyUser: async t => users[t] ?? null,
    findUserByEmail: async email => all().find(u => u.email?.toLowerCase() === email) ?? null,
    names: async ids => Object.fromEntries(ids.map(id => [id, all().find(u => u.id === id)?.name ?? 'Someone'])),
    friendships: async me => load().friendships.filter(r => r.requester === me || r.addressee === me),
    insertFriendship: async r => { const row = { id: nid('fr'), status: 'pending', created_at: new Date().toISOString(), ...r }; load().friendships.push(row); save(); return row; },
    setFriendship: async (id, status) => { const r = load().friendships.find(x => x.id === id); if (r) r.status = status; save(); },
    deleteFriendship: async id => { load().friendships = db.friendships.filter(x => x.id !== id); save(); },
    bills: async me => load().bills.filter(b => b.owner === me || b.member_ids.includes(me)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    getBill: async id => structuredClone(load().bills.find(b => b.id === id) ?? null),
    insertBill: async r => { const row = { id: nid('sb'), version: 1, created_at: new Date().toISOString(), ...r }; load().bills.push(row); save(); return row; },
    saveBill: async (id, { bill, members }, version) => {
      const r = load().bills.find(b => b.id === id);
      if (!r || r.version !== version) return false;
      Object.assign(r, { bill, members, version: version + 1 });
      save();
      return true;
    },
  };
}
