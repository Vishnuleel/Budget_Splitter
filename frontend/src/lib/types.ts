// `currency` is an ISO code (SEK, INR, …). Rows saved before multi-currency support have none → INR.
export type Transaction = {
  id: number;
  date: string;
  amount: number;
  merchant: string;
  category: string;
  currency?: string | null;
  raw_text?: string | null;
  account_id?: number | null;
  /** Rupees the card was actually debited for a foreign spend, typed in by the person. */
  charged_inr?: number | null;
};

export type Account = { id: number; name: string; balance: number; currency?: string | null; created_at?: string };
export type Vault = { id: number; name: string; target_amount: number; current_amount: number; currency?: string | null; created_at?: string };
export type Deposit = { id: number; name: string; amount: number; interest_rate: number; maturity_date: string | null; currency?: string | null; created_at?: string };
export type Debt = { id: number; name: string; amount: number; interest_rate: number; type: string; currency?: string | null; created_at?: string };
export type Subscription = { id: number; name: string; amount: number; cycle: string; next_due_date: string | null; currency?: string | null; created_at?: string };

export type TabType = 'home' | 'activity' | 'insights' | 'wealth';
