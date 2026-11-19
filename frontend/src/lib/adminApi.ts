import { supabase } from '../supabaseClient';
import { isDemoMode } from './demo';
import { createAdminHandler } from '../../shared/admin.js';
import { makeMemoryAdminDeps } from '../../shared/admin-memory.js';

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  disabled: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  invitePending: boolean;
  mustChangePassword: boolean;
  smsLinkedAt: string | null;
  txCount: number;
  lastTxAt: string | null;
  lastSmsAt: string | null;
};

type Res = { status: number; body: Record<string, unknown> };
type Handler = (req: object, res: object) => unknown;

// Demo portal: the REAL admin rules (shared/admin.js) running against an in-memory store.
let demoHandler: Handler | null = null;
function demo(): Handler {
  if (demoHandler) return demoHandler;
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const base = { disabled: false, invitePending: false, mustChangePassword: false, smsLinkedAt: null, txCount: 0, lastTxAt: null, lastSmsAt: null, lastSignInAt: null };
  demoHandler = createAdminHandler(makeMemoryAdminDeps({
    users: [
      { ...base, id: 'demo-you', email: 'you@example.com', displayName: 'You', role: 'admin', createdAt: ago(24 * 60), lastSignInAt: ago(0.2), smsLinkedAt: ago(24 * 20), txCount: 92, lastTxAt: ago(0.7), lastSmsAt: ago(0.7) },
      { ...base, id: 'demo-rahul', email: 'rahul.k@example.com', displayName: 'Rahul', role: 'member', createdAt: ago(24 * 30), lastSignInAt: ago(26), smsLinkedAt: ago(24 * 28), txCount: 57, lastTxAt: ago(3), lastSmsAt: ago(3) },
      { ...base, id: 'demo-priya', email: 'priya.s@example.com', displayName: 'Priya', role: 'member', createdAt: ago(30), invitePending: true },
      { ...base, id: 'demo-arjun', email: 'arjun@example.com', displayName: 'Arjun', role: 'member', disabled: true, createdAt: ago(24 * 45), lastSignInAt: ago(24 * 12), txCount: 14, lastTxAt: ago(24 * 12) },
    ],
    callerToken: { demo: 'demo-you' },
  })) as Handler;
  return demoHandler;
}

export async function adminCall<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const body = { action, redirectTo: location.origin, ...payload };

  if (isDemoMode()) {
    const out = await new Promise<Res>(resolve => {
      const res = { code: 200, status(c: number) { this.code = c; return this; }, json(b: Record<string, unknown>) { resolve({ status: this.code, body: b }); return this; } };
      demo()({ method: 'POST', body, headers: { authorization: 'Bearer demo' } }, res);
    });
    await new Promise(r => setTimeout(r, 250)); // feel like a network call
    if (out.status >= 400) throw new Error(String(out.body.error || 'Request failed'));
    return out.body as T;
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  let res: Response;
  try {
    res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the server. Are you online?');
  }
  const json = await res.json().catch(() => ({ error: `Server error (${res.status}). Is /api/admin deployed?` }));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}
