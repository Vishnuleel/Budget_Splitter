import { useSyncExternalStore } from 'react';
import { getSetting } from './settings';

/**
 * Multi-currency money helpers.
 * - Every DB row carries its own `currency` (rows from before this existed are INR).
 * - Totals, budgets and charts are shown in the display currency from Settings (SEK by default).
 * - Rates are ECB reference rates from frankfurter.dev, cached for 12 hours.
 */

export type CurrencyCode = 'SEK' | 'INR' | 'EUR' | 'USD' | 'GBP' | 'NOK' | 'DKK';

export const CURRENCIES: Record<CurrencyCode, { name: string; locale: string; short: string }> = {
  SEK: { name: 'Swedish krona', locale: 'sv-SE', short: 'kr' },
  INR: { name: 'Indian rupee', locale: 'en-IN', short: '₹' },
  EUR: { name: 'Euro', locale: 'en-IE', short: '€' },
  USD: { name: 'US dollar', locale: 'en-US', short: '$' },
  GBP: { name: 'British pound', locale: 'en-GB', short: '£' },
  NOK: { name: 'Norwegian krone', locale: 'nb-NO', short: 'kr' },
  DKK: { name: 'Danish krone', locale: 'da-DK', short: 'kr' },
};
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

// Units per 1 EUR. Used until live rates load (offline / first run). From ECB, 17 Nov 2026.
const FALLBACK: Record<string, number> = { EUR: 1, SEK: 11.11, INR: 102.72, USD: 1.0989, GBP: 0.83305, NOK: 10.5755, DKK: 7.4749 };

type RateState = { rates: Record<string, number>; date: string; live: boolean };
const CACHE_KEY = 'bs:fx';
const MAX_AGE = 12 * 3_600_000;

let state: RateState = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as RateState & { fetchedAt: number };
      return { rates: { ...FALLBACK, ...c.rates, EUR: 1 }, date: c.date, live: Date.now() - c.fetchedAt < MAX_AGE };
    }
  } catch { /* ignore */ }
  return { rates: FALLBACK, date: '2026-11-17', live: false };
})();
const listeners = new Set<() => void>();

export async function loadRates(force = false) {
  if (state.live && !force) return;
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR');
    if (!res.ok) return;
    const data = (await res.json()) as { date: string; rates: Record<string, number> };
    state = { rates: { ...FALLBACK, ...data.rates, EUR: 1 }, date: data.date, live: true };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...state, fetchedAt: Date.now() })); } catch { /* ignore */ }
    listeners.forEach(l => l());
  } catch { /* offline: keep cached/fallback */ }
}

export function useRates() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

export const displayCurrency = (): CurrencyCode => getSetting('displayCurrency');

export function convert(n: number, from: string | null | undefined, to: string = displayCurrency()) {
  const f = (from || 'INR').toUpperCase();
  if (f === to) return n;
  const rf = state.rates[f];
  const rt = state.rates[to];
  if (!rf || !rt) return n;
  return (n / rf) * rt;
}

/** A row's amount in the display currency. Rows without a currency are legacy INR. */
export function amt(row: { amount: number | string; currency?: string | null }) {
  return convert(Number(row.amount) || 0, row.currency);
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(cur: string, decimals: boolean) {
  const key = `${cur}:${decimals}`;
  let f = fmtCache.get(key);
  if (!f) {
    const meta = CURRENCIES[cur as CurrencyCode];
    f = new Intl.NumberFormat(meta?.locale ?? 'en-US', {
      style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0,
    });
    fmtCache.set(key, f);
  }
  return f;
}

/** 1 245 kr · ₹1,23,456 · €12.50. Defaults to the display currency. */
export function money(n: number, opts: { currency?: string | null; decimals?: boolean; sign?: boolean } = {}) {
  const cur = (opts.currency || displayCurrency()).toUpperCase();
  const v = Number(n) || 0;
  const showDec = !!opts.decimals && Math.abs(v % 1) > 0.004;
  const body = nf(cur, showDec).format(Math.abs(v));
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${sign}${body}`;
}

/** 12,5 tkr · 1,2 mkr · ₹3.4L · €12.5k */
export function moneyCompact(n: number, currency?: string | null) {
  const cur = (currency || displayCurrency()).toUpperCase();
  const v = Math.abs(Number(n) || 0);
  const sign = n < 0 ? '−' : '';
  const one = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '');
  if (cur === 'INR') {
    if (v >= 1e7) return `${sign}₹${one(v / 1e7)}Cr`;
    if (v >= 1e5) return `${sign}₹${one(v / 1e5)}L`;
    if (v >= 1e3) return `${sign}₹${one(v / 1e3)}K`;
    return `${sign}₹${Math.round(v)}`;
  }
  if (cur === 'SEK' || cur === 'NOK' || cur === 'DKK') {
    const sw = (x: number) => one(x).replace('.', ',');
    if (v >= 1e6) return `${sign}${sw(v / 1e6)} mkr`;
    if (v >= 1e4) return `${sign}${sw(v / 1e3)} tkr`;
    return `${sign}${money(v, { currency: cur })}`;
  }
  const sym = CURRENCIES[cur as CurrencyCode]?.short ?? cur;
  if (v >= 1e6) return `${sign}${sym}${one(v / 1e6)}M`;
  if (v >= 1e3) return `${sign}${sym}${one(v / 1e3)}k`;
  return `${sign}${sym}${Math.round(v)}`;
}

/** Symbol shown next to amount inputs. */
export const symbolOf = (cur: string) => CURRENCIES[cur as CurrencyCode]?.short ?? cur;
