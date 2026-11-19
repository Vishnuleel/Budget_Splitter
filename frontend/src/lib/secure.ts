import { supabase } from '../supabaseClient';
import { getSetting, setSetting } from './settings';

/** SHA-256 hex using Web Crypto. */
export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create (or replace) your personal SMS key. Only its SHA-256 hash is stored in your profile;
 * the key itself is shown once so you can paste it into your phone automation.
 */
export async function createSmsKey(userId: string, demo = false): Promise<string> {
  const key = `bs_${base64url(crypto.getRandomValues(new Uint8Array(24)))}`;
  if (demo) return key;
  const { error } = await supabase
    .from('profiles')
    .update({ sms_token_hash: await sha256Hex(key), sms_token_created_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
  return key;
}

// ── Per-device app lock ──────────────────────────────────────
export async function setAppLockPin(userId: string, pin: string | null) {
  setSetting('appLockHash', pin ? await sha256Hex(`${userId}:${pin}`) : null);
}

export async function checkAppLockPin(userId: string, pin: string) {
  const hash = getSetting('appLockHash');
  return !!hash && hash === (await sha256Hex(`${userId}:${pin}`));
}
