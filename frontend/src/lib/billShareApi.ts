import { supabase } from '../supabaseClient';
import { isDemoMode } from './demo';
import { createBillShareHandler, makeMemoryShareDeps, type Claims, type ShareBill } from '../../shared/billShare.js';

type Res = { status: number; body: Record<string, unknown> };
type Handler = (req: object, res: object) => unknown;

let demoHandler: Handler | null = null;
const demo = () => (demoHandler ??= createBillShareHandler(makeMemoryShareDeps({ users: { demo: { id: 'demo-you' } }, persist: localStorage })) as Handler);

async function call<T>(body: Record<string, unknown>, auth: boolean): Promise<T> {
  if (isDemoMode()) {
    const out = await new Promise<Res>(resolve => {
      const res = { code: 200, status(c: number) { this.code = c; return this; }, json(b: Record<string, unknown>) { resolve({ status: this.code, body: b }); return this; } };
      demo()({ method: 'POST', body, headers: { authorization: 'Bearer demo' } }, res);
    });
    await new Promise(r => setTimeout(r, 200));
    if (out.status >= 400) throw new Error(String(out.body.error || 'Request failed'));
    return out.body as T;
  }
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Sign in first.');
    headers.authorization = `Bearer ${data.session.access_token}`;
  }
  let res: Response;
  try { res = await fetch('/api/bill', { method: 'POST', headers, body: JSON.stringify(body) }); } catch { throw new Error('Could not reach the server. Are you online?'); }
  const json = await res.json().catch(() => ({ error: `Server error (${res.status}).` }));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

export const shareUrl = (token: string) => `${location.origin}/b/${token}${isDemoMode() ? '?demo=1' : ''}`;

export const createShare = (bill: ShareBill) => call<{ id: string; token: string; expiresAt: string }>({ action: 'create', bill }, true);
export const shareStatus = (ids: string[]) => call<{ shares: { id: string; claims: Claims; expiresAt: string }[] }>({ action: 'status', ids }, true);
export const closeShare = (id: string) => call<{ ok: true }>({ action: 'close', id }, true);
export const viewShare = (token: string) => call<{ bill: ShareBill; answered: string[]; expiresAt: string }>({ action: 'view', token }, false);
export const submitClaim = (token: string, personId: string, itemIds: string[]) => call<{ ok: true }>({ action: 'claim', token, personId, itemIds }, false);
