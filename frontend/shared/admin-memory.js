// In-memory implementation of the admin data layer (same interface as makeAdminDeps in deps.js).
// Used by scripts/test-admin.mjs and by the demo admin portal (/admin?demo=1).

/** @param {{ users: any[], callerToken?: Record<string, string> }} seed */
export function makeMemoryAdminDeps(seed) {
  const users = new Map(seed.users.map(u => [u.id, { ...u }]));
  const tokens = seed.callerToken || {}; // accessToken -> user id
  const log = [];
  let n = 0;

  const clone = u => (u ? { ...u } : null);

  return {
    configured: true,
    log,
    users,

    async verifyCaller(token) {
      const u = users.get(tokens[token]);
      return u ? { id: u.id, email: u.email, role: u.role, disabled: u.disabled } : null;
    },

    async listUsers() { return [...users.values()].map(clone); },
    async getUser(id) { return clone(users.get(id)); },

    async createUser({ email, displayName, role, mode }) {
      const id = `u-new-${++n}`;
      const u = {
        id, email, displayName, role, disabled: false,
        createdAt: new Date().toISOString(), lastSignInAt: null,
        invitePending: mode === 'invite', mustChangePassword: mode === 'password',
        smsLinkedAt: null, txCount: 0, lastTxAt: null, lastSmsAt: null,
      };
      users.set(id, u);
      log.push(['create', email, mode]);
      return clone(u);
    },

    async updateProfile(id, patch) {
      const u = users.get(id);
      Object.assign(u, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      log.push(['update', id, patch]);
      return clone(u);
    },

    async setPassword(id) {
      users.get(id).mustChangePassword = true;
      log.push(['setPassword', id]);
    },

    async sendReset(email) { log.push(['sendReset', email]); },

    async revokeSmsKey(id) {
      users.get(id).smsLinkedAt = null;
      log.push(['revoke', id]);
    },

    async deleteUser(id) {
      users.delete(id);
      log.push(['delete', id]);
    },
  };
}
