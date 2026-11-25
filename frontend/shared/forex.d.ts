export type ChargedSource = 'manual' | 'sms' | 'limit';

export declare function smsCardInfo(text: string | null | undefined): { card: string | null; limit: number | null; chargedInr: number | null };

export declare function chargedInrById<T extends {
  id: number; date: string; amount: number | string; currency?: string | null;
  raw_text?: string | null; charged_inr?: number | string | null; category?: string;
}>(txs: T[], fairInr: (tx: T) => number | null): Map<number, { inr: number; source: ChargedSource }>;

export declare function markupOf(chargedInr: number, fairInr: number): { extra: number; pct: number };
