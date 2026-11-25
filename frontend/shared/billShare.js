// "Pick your items" links: roommates (no account needed) open a link, choose their name, untick what
// they won't share, and submit. The owner then applies the picks to the split.
// Pure logic + injected storage, so it runs on Cloudflare/Vercel, in tests, and in the browser (demo).

const MAX_ITEMS = 200;
const MAX_PEOPLE = 20;
const LINK_DAYS = 30;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (s, m) => { throw new HttpError(s, m); };

export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function newShareToken() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const money = v => Math.round((Number(v) || 0) * 100) / 100;

/** Validate and trim what the owner wants to publish. */
export function sanitizeBill(b) {
  const people = (Array.isArray(b?.people) ? b.people : []).slice(0, MAX_PEOPLE)
    .map(p => ({ id: str(p?.id, 40), name: str(p?.name, 40) || 'Someone' })).filter(p => p.id);
  const ids = new Set(people.map(p => p.id));
  const items = (Array.isArray(b?.items) ? b.items : []).slice(0, MAX_ITEMS)
    .map(i => ({ id: str(i?.id, 40), name: str(i?.name, 60) || 'Item', price: money(i?.price), among: (Array.isArray(i?.among) ? i.among : []).filter(x => ids.has(x)) }))
    .filter(i => i.id);
  const extras = (Array.isArray(b?.extras) ? b.extras : []).slice(0, 20)
    .map(x => ({ name: str(x?.name, 40) || 'Extra', amount: money(x?.amount), kind: x?.kind === 'fee' ? 'fee' : 'discount' }));
  if (people.length < 2) fail(400, 'Add at least one roommate.');
  if (!items.length) fail(400, 'The bill has no items.');
  const payer = ids.has(b?.payer) ? b.payer : people[0].id;
  return { title: str(b?.title, 60) || 'Shopping', currency: /^[A-Z]{3}$/.test(b?.currency) ? b.currency : 'SEK', payer, people, items, extras };
}

/**
 * Turn submitted picks into the split: for everyone who answered, they share exactly the items they
 * ticked; people who haven't answered keep whatever the owner set.
 */
export function applyClaims(items, claims) {
  const answered = Object.keys(claims || {});
  return items.map(item => {
    let among = item.among.filter(p => !answered.includes(p));
    for (const p of answered) if (claims[p].itemIds.includes(item.id)) among.push(p);
    among = [...new Set(among)];
    return { ...item, among, shares: among.length > 1 ? item.shares : undefined };
  });
}

/**
 * deps: {
 *   configured, verifyUser(accessToken) → {id, disabled}|null,
 *   insertShare({ owner_id, token_hash, bill, expires_at }) → { id },
 *   getByHash(hash) → row|null, getMine(ownerId, ids) → rows,
 *   saveClaims(id, claims), deleteShare(id, ownerId)
 * }
 */
export function createBillShareHandler(deps) {
  async function owner(req) {
    const auth = req.headers?.authorization || '';
    const t = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const u = t ? await deps.verifyUser(t) : null;
    if (!u) fail(401, 'Sign in first.');
    if (u.disabled) fail(403, 'This account is paused.');
    return u;
  }

  async function byToken(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 80) fail(404, 'This link isn’t valid.');
    const row = await deps.getByHash(await sha256Hex(token));
    if (!row) fail(404, 'This link isn’t valid or was closed by the sender.');
    if (new Date(row.expires_at).getTime() < Date.now()) fail(410, 'This link has expired. Ask for a new one.');
    return row;
  }

  async function run(req) {
    if (req.method !== 'POST') fail(405, 'Use POST.');
    if (!deps.configured) fail(503, 'Sharing isn’t set up: set SUPABASE_SERVICE_ROLE_KEY.');
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    switch (body.action) {
      // ── Owner (signed in) ──
      case 'create': {
        const me = await owner(req);
        const bill = sanitizeBill(body.bill);
        const token = newShareToken();
        const expires_at = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
        const row = await deps.insertShare({ owner_id: me.id, token_hash: await sha256Hex(token), bill, expires_at });
        return { id: row.id, token, expiresAt: expires_at };
      }
      case 'status': {
        const me = await owner(req);
        const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 50).map(String);
        const rows = await deps.getMine(me.id, ids);
        return { shares: rows.map(r => ({ id: r.id, claims: r.claims || {}, expiresAt: r.expires_at })) };
      }
      case 'close': {
        const me = await owner(req);
        await deps.deleteShare(String(body.id || ''), me.id);
        return { ok: true };
      }

      // ── Roommate (just the link) ──
      case 'view': {
        const row = await byToken(body.token);
        const { title, currency, payer, people, items, extras } = row.bill;
        // Who has answered — but never what they picked or what anyone else owes.
        return { bill: { title, currency, payer, people, items, extras }, answered: Object.keys(row.claims || {}), expiresAt: row.expires_at };
      }
      case 'claim': {
        const row = await byToken(body.token);
        const personId = String(body.personId || '');
        if (!row.bill.people.some(p => p.id === personId)) fail(400, 'Pick your name first.');
        if (personId === row.bill.payer) fail(400, 'The person who paid sets their own items in the app.');
        const valid = new Set(row.bill.items.map(i => i.id));
        const itemIds = [...new Set((Array.isArray(body.itemIds) ? body.itemIds : []).map(String))].filter(id => valid.has(id));
        // First answer for a name gets a key; changing it later needs that key, so others can't overwrite it.
        const prev = row.claims?.[personId];
        if (prev?.keyHash && prev.keyHash !== await sha256Hex(String(body.key || ''))) {
          fail(403, 'Someone already answered for this name. Ask the person who paid to change it.');
        }
        const key = prev?.keyHash ? String(body.key) : newShareToken();
        // shortcut: read-modify-write, two roommates answering in the same instant can lose one; use a jsonb merge RPC if that shows up.
        const claims = { ...(row.claims || {}), [personId]: { itemIds, at: new Date().toISOString(), keyHash: await sha256Hex(key) } };
        await deps.saveClaims(row.id, claims);
        return { ok: true, key };
      }
      default:
        fail(400, 'Unknown action.');
    }
  }

  return async function handler(req, res) {
    try {
      return res.status(200).json(await run(req));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error('Bill share error:', err);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  };
}

/** In-memory storage (tests) — pass `persist` to keep it in localStorage (demo mode across pages). */
export function makeMemoryShareDeps({ users = {}, persist } = {}) {
  let rows = [];
  const load = () => {
    if (!persist) return rows;
    try { return JSON.parse(persist.getItem('bs-demo:shares') || '[]'); } catch { return []; }
  };
  rows = load();
  const save = () => { if (persist) persist.setItem('bs-demo:shares', JSON.stringify(rows)); };
  return {
    configured: true,
    get rows() { return rows; },
    verifyUser: async t => users[t] ?? null,
    insertShare: async r => { rows = load(); const row = { id: `sh_${rows.length + 1}_${Date.now().toString(36)}`, claims: {}, ...r }; rows.push(row); save(); return row; },
    getByHash: async h => (rows = load(), rows.find(r => r.token_hash === h) ?? null),
    getMine: async (owner, ids) => (rows = load(), rows.filter(r => r.owner_id === owner && ids.includes(r.id))),
    saveClaims: async (id, claims) => { rows = load(); const r = rows.find(x => x.id === id); if (r) r.claims = claims; save(); },
    deleteShare: async (id, owner) => { rows = load().filter(r => !(r.id === id && r.owner_id === owner)); save(); },
  };
}
