import { useSyncExternalStore } from 'react';
import { supabase } from '../supabaseClient';
import { isDemoMode } from './demo';

const DEMO = isDemoMode();

/**
 * Small settings store.
 * Values live in localStorage (per signed-in person, so two people on one device never mix),
 * and are mirrored to the Supabase `app_settings` table (one row per person + key). That is
 * what lets the SMS endpoint read your merchant rules. Device-only settings never leave the device.
 */

export type SplitPerson = { id: string; name: string };
export type SplitEntry = {
  id: string;
  title: string;
  amount: number;
  date: string;
  paidBy: string; // 'me' or a person id
  among: string[]; // ids incl. 'me' when you share the cost
  settled: string[]; // debtor ids that have paid back
  currency?: string; // entries from before multi-currency are INR
  /** Itemised bills: who shares each line. Without items, `amount` is split equally across `among`. */
  items?: { id: string; name: string; price: number; qty?: number; among: string[]; shares?: Record<string, number> }[];
  extras?: { name: string; amount: number; kind: 'discount' | 'fee' }[];
  store?: string | null;
  /** "Pick your items" link sent to roommates (see /api/bill). */
  shareId?: string;
  shareToken?: string;
  /** Sent into linked friends' accounts (POST /api/shared): their balances come from that shared bill. */
  sharedId?: string;
  /** People whose picks have already been applied to `items`. */
  picksApplied?: string[];
  picksAppliedAt?: string;
};
export type MerchantRule = { merchant: string; category: string };

type Currency = 'SEK' | 'INR' | 'EUR' | 'USD' | 'GBP' | 'NOK' | 'DKK';

export type Settings = {
  theme: 'system' | 'light' | 'dark';
  hideBalances: boolean;
  /** Totals, budgets and charts are shown in this currency. */
  displayCurrency: Currency;
  /** Pre-selected currency when adding something by hand. */
  entryCurrency: Currency;
  /** Your Indian card's foreign-currency markup, in % (typically 2–3.5% + GST). */
  forexMarkup: number;
  /** Budgets are stored in the display currency. */
  monthlyBudget: number;
  categoryBudgets: Record<string, number>;
  merchant_rules: MerchantRule[];
  splits: { people: SplitPerson[]; entries: SplitEntry[] };
  /** Optional per-device app lock: SHA-256 of user id + PIN. Never synced. */
  appLockHash: string | null;
};

const DEFAULTS: Settings = {
  theme: 'system',
  hideBalances: false,
  displayCurrency: 'SEK',
  entryCurrency: 'SEK',
  forexMarkup: 3.5,
  monthlyBudget: 15000,
  categoryBudgets: {},
  merchant_rules: [],
  splits: { people: [], entries: [] },
  appLockHash: null,
};

// Settings that only make sense on this device never go to the cloud.
const LOCAL_ONLY: (keyof Settings)[] = ['theme', 'hideBalances', 'entryCurrency', 'appLockHash'];

let currentUser: string | null = null;

// Theme is per device; everything else is per person (demo mode keeps its own copy).
const storageKey = (key: keyof Settings) => {
  if (key === 'theme') return 'bs:theme';
  if (DEMO) return `bs-demo:${key}`;
  return `bs:${currentUser ?? 'anon'}:${key}`;
};
const values = new Map<keyof Settings, unknown>();
const listeners = new Set<() => void>();
let cloudState: 'unknown' | 'ok' | 'missing' = 'unknown';
// Postgres "undefined table" / PostgREST "table not in schema cache": schema.sql hasn't been run.
const tableMissing = (e: { code?: string }) => e.code === '42P01' || e.code === 'PGRST205';

function readLocal<K extends keyof Settings>(key: K): Settings[K] {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (raw != null) return JSON.parse(raw);
  } catch { /* storage blocked */ }
  return DEFAULTS[key];
}

function writeLocal(key: keyof Settings, value: unknown) {
  try { localStorage.setItem(storageKey(key), JSON.stringify(value)); } catch { /* ignore */ }
}

function emit() { listeners.forEach(l => l()); }

/** Call when someone signs in or out so their settings (not the previous person's) are used. */
export function setSettingsUser(userId: string | null) {
  if (userId === currentUser) return;
  currentUser = userId;
  for (const k of [...values.keys()]) if (k !== 'theme') values.delete(k);
  cloudState = 'unknown';
  emit();
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  if (!values.has(key)) values.set(key, readLocal(key));
  return values.get(key) as Settings[K];
}

export function setSetting<K extends keyof Settings>(key: K, next: Settings[K] | ((prev: Settings[K]) => Settings[K])) {
  const prev = getSetting(key);
  const value = typeof next === 'function' ? (next as (p: Settings[K]) => Settings[K])(prev) : next;
  values.set(key, value);
  writeLocal(key, value);
  emit();
  if (!DEMO && currentUser && !LOCAL_ONLY.includes(key) && cloudState !== 'missing') {
    supabase.from('app_settings')
      .upsert({ user_id: currentUser, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' })
      .then(({ error }) => {
        // Only a missing table stops syncing; a network blip shouldn't switch it off for the session.
        if (!error) cloudState = 'ok';
        else if (tableMissing(error)) cloudState = 'missing';
        emit();
      });
  }
}

/** Pull cloud copies once after sign-in. Cloud wins over local when present. */
export async function syncSettingsFromCloud() {
  if (DEMO || !currentUser) return;
  const { data, error } = await supabase.from('app_settings').select('key, value').eq('user_id', currentUser);
  if (error) {
    if (tableMissing(error)) cloudState = 'missing';
    emit();
    return;
  }
  cloudState = 'ok';
  for (const row of data ?? []) {
    const key = row.key as keyof Settings;
    if (key in DEFAULTS && !LOCAL_ONLY.includes(key)) {
      values.set(key, row.value);
      writeLocal(key, row.value);
    }
  }
  emit();
}

export function cloudSyncState() { return cloudState; }

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSetting<K extends keyof Settings>(key: K): [Settings[K], (v: Settings[K] | ((p: Settings[K]) => Settings[K])) => void] {
  const value = useSyncExternalStore(subscribe, () => getSetting(key));
  return [value, (v) => setSetting(key, v)];
}

export function useCloudState() {
  return useSyncExternalStore(subscribe, () => cloudState);
}

export function findRule(merchant: string): MerchantRule | undefined {
  const m = merchant.toLowerCase();
  return getSetting('merchant_rules').find(r => r.merchant && m.includes(r.merchant.toLowerCase()));
}

export function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // Keep the phone's status bar in step with a forced choice (Auto leaves the media-matched tags alone).
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => {
    if (!m.dataset.auto) m.dataset.auto = m.content;
    m.content = theme === 'system' ? m.dataset.auto : theme === 'dark' ? '#242933' : '#eef2f7';
  });
}
