// Tests for the admin API (shared/admin.js) — no Supabase needed.  Run: npm run test:admin
import assert from 'node:assert/strict';
import { createAdminHandler, generateTempPassword } from '../shared/admin.js';
import { makeMemoryAdminDeps } from '../shared/admin-memory.js';

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

const base = { disabled: false, createdAt: '2026-11-01T10:00:00Z', lastSignInAt: null, invitePending: false, mustChangePassword: false, smsLinkedAt: null, txCount: 0, lastTxAt: null, lastSmsAt: null };
function setup() {
  const deps = makeMemoryAdminDeps({
    users: [
      { ...base, id: 'u-me', email: 'me@example.com', displayName: 'Me', role: 'admin' },
      { ...base, id: 'u-rahul', email: 'rahul@example.com', displayName: 'Rahul', role: 'member', smsLinkedAt: '2026-11-10T09:00:00Z', txCount: 42 },
    ],
    callerToken: { 'tok-me': 'u-me', 'tok-rahul': 'u-rahul' },
  });
  return { deps, h: createAdminHandler(deps) };
}

function call(handler, body, token = 'tok-me', method = 'POST') {
  return new Promise(resolve => {
    const res = {
      code: 200,
      status(c) { this.code = c; return this; },
      json(payload) { resolve({ status: this.code, body: payload }); return this; },
    };
    handler({ method, body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  });
}

console.log('\nAccess');
await test('needs a signed-in caller', async () => {
  const { h } = setup();
  assert.equal((await call(h, { action: 'list' }, null)).status, 401);
  assert.equal((await call(h, { action: 'list' }, 'tok-expired')).status, 401);
});
await test('members get 403', async () => {
  const { h } = setup();
  assert.equal((await call(h, { action: 'list' }, 'tok-rahul')).status, 403);
});
await test('paused admins get 403', async () => {
  const { h, deps } = setup();
  deps.users.get('u-me').disabled = true;
  assert.equal((await call(h, { action: 'list' })).status, 403);
});
await test('not configured → 503', async () => {
  const { deps } = setup();
  const h = createAdminHandler({ ...deps, configured: false });
  assert.equal((await call(h, { action: 'list' })).status, 503);
});

console.log('\nPeople');
await test('lists you first, without any money data', async () => {
  const { h } = setup();
  const r = await call(h, { action: 'list' });
  assert.equal(r.status, 200);
  assert.equal(r.body.users[0].id, 'u-me');
  assert.equal(r.body.me, 'u-me');
  for (const u of r.body.users) for (const k of Object.keys(u)) assert.ok(!/amount|balance/i.test(k), `leaks ${k}`);
});
await test('creates a member with a generated temporary password', async () => {
  const { h, deps } = setup();
  const r = await call(h, { action: 'create', email: '  Priya@Example.com ', displayName: 'Priya', role: 'member', mode: 'password' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, 'priya@example.com');
  assert.match(r.body.tempPassword, /^([A-Z][a-z]+-){4}\d{3}$/);
  assert.equal(deps.users.size, 3);
});
await test('creates by email invite (no password returned)', async () => {
  const { h } = setup();
  const r = await call(h, { action: 'create', email: 'arjun@example.com', mode: 'invite', redirectTo: 'https://app.pages.dev' });
  assert.equal(r.body.invited, true);
  assert.equal(r.body.tempPassword, undefined);
  assert.equal(r.body.user.invitePending, true);
});
await test('rejects a bad or duplicate email', async () => {
  const { h } = setup();
  assert.equal((await call(h, { action: 'create', email: 'not-an-email' })).status, 400);
  assert.equal((await call(h, { action: 'create', email: 'RAHUL@example.com' })).status, 409);
});
await test('renames, promotes and pauses someone else', async () => {
  const { h, deps } = setup();
  const r = await call(h, { action: 'update', id: 'u-rahul', displayName: 'Rahul K', role: 'admin', disabled: true });
  assert.equal(r.status, 200);
  const u = deps.users.get('u-rahul');
  assert.deepEqual([u.displayName, u.role, u.disabled], ['Rahul K', 'admin', true]);
});
await test("can't demote or pause yourself", async () => {
  const { h } = setup();
  assert.equal((await call(h, { action: 'update', id: 'u-me', role: 'member' })).status, 409);
  assert.equal((await call(h, { action: 'update', id: 'u-me', disabled: true })).status, 409);
  assert.equal((await call(h, { action: 'update', id: 'u-me', displayName: 'Boss' })).status, 200);
});
await test('there is always one active admin', async () => {
  const { h, deps } = setup();
  await call(h, { action: 'update', id: 'u-rahul', role: 'admin' });
  // Rahul (admin) demotes me → fine, Rahul is still admin…
  assert.equal((await call(h, { action: 'update', id: 'u-me', role: 'member' }, 'tok-rahul')).status, 200);
  // …but now nobody may remove Rahul's admin role.
  deps.users.get('u-me').role = 'member';
  assert.equal((await call(h, { action: 'update', id: 'u-rahul', role: 'member' }, 'tok-rahul')).status, 409);
});
await test('resets a password (new temp) or emails a reset link', async () => {
  const { h, deps } = setup();
  const a = await call(h, { action: 'resetPassword', id: 'u-rahul' });
  assert.match(a.body.tempPassword, /^([A-Z][a-z]+-){4}\d{3}$/);
  assert.equal(deps.users.get('u-rahul').mustChangePassword, true);
  const b = await call(h, { action: 'resetPassword', id: 'u-rahul', mode: 'email' });
  assert.equal(b.body.emailed, true);
});
await test("unlinks someone's phone (SMS key)", async () => {
  const { h, deps } = setup();
  assert.equal((await call(h, { action: 'revokeSmsKey', id: 'u-rahul' })).status, 200);
  assert.equal(deps.users.get('u-rahul').smsLinkedAt, null);
});
await test('delete needs the email typed, and never deletes yourself', async () => {
  const { h, deps } = setup();
  assert.equal((await call(h, { action: 'delete', id: 'u-rahul', confirmEmail: 'wrong@example.com' })).status, 400);
  assert.equal((await call(h, { action: 'delete', id: 'u-me', confirmEmail: 'me@example.com' })).status, 409);
  assert.equal((await call(h, { action: 'delete', id: 'u-rahul', confirmEmail: 'RAHUL@example.com' })).status, 200);
  assert.equal(deps.users.has('u-rahul'), false);
});
await test('unknown ids and actions are handled', async () => {
  const { h } = setup();
  assert.equal((await call(h, { action: 'update', id: 'nope' })).status, 404);
  assert.equal((await call(h, { action: 'explode' })).status, 400);
  assert.equal((await call(h, { action: 'list' }, 'tok-me', 'GET')).status, 405);
});
await test('temporary passwords look random', async () => {
  const set = new Set(Array.from({ length: 200 }, generateTempPassword));
  assert.equal(set.size, 200);
});

console.log(failures ? `\n${failures} failed\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
