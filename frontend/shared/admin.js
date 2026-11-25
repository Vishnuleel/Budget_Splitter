// Admin API behind POST /api/admin — used by the admin portal (/admin).
// Pure logic + injected data access, so it runs on Cloudflare, Vercel, in tests, and in the
// browser for the demo portal. Uses Web Crypto only (no node: imports).
//
// Privacy: the admin manages ACCOUNTS (who can sign in, roles, passwords, SMS links).
// The admin never receives anyone's transactions or amounts — only counts and timestamps.

const ROLES = ['admin', 'member'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const WORDS = [
  'amber', 'anchor', 'apple', 'arrow', 'aspen', 'atlas', 'badge', 'bamboo', 'basil', 'beacon', 'birch', 'bison',
  'blaze', 'bloom', 'brook', 'cabin', 'cactus', 'canal', 'candle', 'canyon', 'cedar', 'chalk', 'cherry', 'cider',
  'clover', 'cobalt', 'comet', 'coral', 'cotton', 'crane', 'crown', 'daisy', 'delta', 'dune', 'eagle', 'ember',
  'falcon', 'fern', 'fig', 'fjord', 'flint', 'forest', 'fox', 'frost', 'garnet', 'ginger', 'glacier', 'harbor',
  'hazel', 'heron', 'honey', 'indigo', 'iris', 'island', 'ivory', 'jade', 'jasmine', 'juniper', 'kayak', 'kettle',
  'kite', 'lagoon', 'lantern', 'lemon', 'lilac', 'linen', 'lotus', 'lynx', 'mango', 'maple', 'marble', 'meadow',
  'mint', 'monsoon', 'moss', 'nectar', 'nutmeg', 'oak', 'oasis', 'olive', 'onyx', 'orbit', 'otter', 'palm',
  'pebble', 'pepper', 'pine', 'plum', 'pollen', 'prism', 'quartz', 'quill', 'raven', 'reef', 'river', 'robin',
  'saffron', 'sage', 'salt', 'sapphire', 'shell', 'sierra', 'silk', 'slate', 'sparrow', 'spruce', 'stone', 'storm',
  'summit', 'swan', 'tamarind', 'thistle', 'thunder', 'tiger', 'topaz', 'tulip', 'tundra', 'valley', 'velvet', 'violet',
  'walnut', 'willow', 'winter', 'yarrow', 'zenith', 'zephyr', 'birchwood', 'kestrel',
];

/** Readable but strong enough for a must-change-on-first-sign-in password: 4 words + 3 digits (~38 bits). */
export function generateTempPassword() {
  const r = new Uint32Array(5);
  globalThis.crypto.getRandomValues(r);
  const words = [0, 1, 2, 3].map(i => {
    const w = WORDS[r[i] % WORDS.length];
    return w[0].toUpperCase() + w.slice(1);
  });
  return `${words.join('-')}-${String(r[4] % 1000).padStart(3, '0')}`;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

function bearer(req) {
  const h = req.headers || {};
  const auth = h.authorization || h.Authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

function sortUsers(users, meId) {
  return [...users].sort((a, b) =>
    (b.id === meId) - (a.id === meId)
    || (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1)
    || String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)));
}

/**
 * @param {{
 *   configured: boolean,
 *   verifyCaller: (accessToken: string) => Promise<{ id: string, email: string, role: string, disabled: boolean } | null>,
 *   listUsers: () => Promise<any[]>,
 *   getUser: (id: string) => Promise<any | null>,
 *   createUser: (input: { email: string, displayName: string, role: string, mode: 'password'|'invite', password?: string, redirectTo?: string }) => Promise<any>,
 *   updateProfile: (id: string, patch: { displayName?: string, role?: string, disabled?: boolean }) => Promise<any>,
 *   setPassword: (id: string, password: string) => Promise<void>,
 *   sendReset: (email: string, redirectTo?: string) => Promise<void>,
 *   revokeSmsKey: (id: string) => Promise<void>,
 *   deleteUser: (id: string) => Promise<void>,
 * }} deps
 */
export function createAdminHandler(deps) {
  async function activeAdmins() {
    return (await deps.listUsers()).filter(u => u.role === 'admin' && !u.disabled);
  }

  async function run(req) {
    if (req.method !== 'POST') fail(405, 'Use POST.');
    if (!deps.configured) fail(503, 'Server not configured: set SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL.');

    const token = bearer(req);
    if (!token) fail(401, 'Sign in first.');
    const me = await deps.verifyCaller(token);
    if (!me) fail(401, 'Your session expired. Sign in again.');
    if (me.disabled || me.role !== 'admin') fail(403, 'Only admins can use the admin portal.');

    const body = readBody(req);
    const redirectTo = typeof body.redirectTo === 'string' && /^https?:\/\/[^\s]+$/.test(body.redirectTo) ? body.redirectTo : undefined;

    switch (body.action) {
      case 'list': {
        return { me: me.id, users: sortUsers(await deps.listUsers(), me.id) };
      }

      case 'create': {
        const email = String(body.email || '').trim().toLowerCase();
        const displayName = String(body.displayName || '').trim().slice(0, 60) || email.split('@')[0];
        const role = ROLES.includes(body.role) ? body.role : 'member';
        const mode = body.mode === 'invite' ? 'invite' : 'password';
        if (!EMAIL_RE.test(email)) fail(400, 'Enter a valid email address.');
        const existing = (await deps.listUsers()).find(u => (u.email || '').toLowerCase() === email);
        if (existing) fail(409, `${email} already has an account.`);
        let password;
        if (mode === 'password') {
          password = typeof body.password === 'string' && body.password.trim().length >= 8 ? body.password.trim() : generateTempPassword();
        }
        const user = await deps.createUser({ email, displayName, role, mode, password, redirectTo });
        return { user, tempPassword: password, invited: mode === 'invite' };
      }

      case 'update': {
        const user = await deps.getUser(String(body.id || ''));
        if (!user) fail(404, 'That account no longer exists.');
        const patch = {};
        if (typeof body.displayName === 'string') patch.displayName = body.displayName.trim().slice(0, 60) || user.displayName;
        if (body.role !== undefined) {
          if (!ROLES.includes(body.role)) fail(400, 'Role must be admin or member.');
          patch.role = body.role;
        }
        if (body.disabled !== undefined) patch.disabled = !!body.disabled;

        const losesAdmin = user.role === 'admin' && !user.disabled && (patch.role === 'member' || patch.disabled === true);
        if (user.id === me.id && losesAdmin) fail(409, "You can't remove your own admin role or pause yourself. Make someone else admin first.");
        if (losesAdmin && (await activeAdmins()).length <= 1) fail(409, 'There must always be at least one active admin.');

        return { user: await deps.updateProfile(user.id, patch) };
      }

      case 'resetPassword': {
        const user = await deps.getUser(String(body.id || ''));
        if (!user) fail(404, 'That account no longer exists.');
        if (body.mode === 'email') {
          await deps.sendReset(user.email, redirectTo);
          return { emailed: true };
        }
        const password = generateTempPassword();
        await deps.setPassword(user.id, password);
        return { tempPassword: password };
      }

      case 'revokeSmsKey': {
        const user = await deps.getUser(String(body.id || ''));
        if (!user) fail(404, 'That account no longer exists.');
        await deps.revokeSmsKey(user.id);
        return { ok: true };
      }

      case 'delete': {
        const user = await deps.getUser(String(body.id || ''));
        if (!user) fail(404, 'That account no longer exists.');
        if (user.id === me.id) fail(409, "You can't delete your own account from here.");
        if (String(body.confirmEmail || '').trim().toLowerCase() !== String(user.email).toLowerCase()) {
          fail(400, 'Type their email address to confirm.');
        }
        if (user.role === 'admin' && !user.disabled && (await activeAdmins()).length <= 1) {
          fail(409, 'There must always be at least one active admin.');
        }
        await deps.deleteUser(user.id);
        return { ok: true };
      }

      default:
        fail(400, 'Unknown action.');
    }
  }

  return async function handler(req, res) {
    try {
      const out = await run(req);
      return res.status(200).json(out);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error('Admin API error:', err);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  };
}
