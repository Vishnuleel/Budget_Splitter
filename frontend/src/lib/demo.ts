import type { Account, Debt, Deposit, Subscription, Transaction, Vault } from './types';
import { dayKey } from './format';

const DEMO_KEY = 'bs:demo';

export function isDemoMode() {
  try {
    if (new URLSearchParams(location.search).get('demo') === '1') sessionStorage.setItem(DEMO_KEY, '1');
    return sessionStorage.getItem(DEMO_KEY) === '1' || import.meta.env.VITE_DEMO === '1';
  } catch {
    return false;
  }
}

export function setDemoMode(on: boolean) {
  try {
    if (on) sessionStorage.setItem(DEMO_KEY, '1');
    else sessionStorage.removeItem(DEMO_KEY);
  } catch { /* ignore */ }
  const url = new URL(location.href);
  url.searchParams.delete('demo');
  location.replace(url.toString());
}

// Deterministic pseudo-random so the demo looks the same every load.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// Life in Sweden, paid with an Indian bank card (amounts in SEK).
const SPENDS: [string, string, number, number][] = [
  ['ICA Supermarket', 'Groceries', 85, 640],
  ['Willys', 'Groceries', 120, 780],
  ['Lidl', 'Groceries', 60, 420],
  ['Coop', 'Groceries', 45, 380],
  ['Espresso House', 'Food & Dining', 39, 95],
  ['Max Burgers', 'Food & Dining', 89, 180],
  ['Foodora', 'Food & Dining', 159, 340],
  ['Pressbyrån', 'Food & Dining', 25, 70],
  ['SL', 'Transport', 42, 42],
  ['Voi', 'Transport', 25, 60],
  ['Bolt', 'Transport', 110, 290],
  ['H&M', 'Clothing', 149, 699],
  ['IKEA', 'Appliances or tools', 59, 899],
  ['Clas Ohlson', 'Appliances or tools', 49, 349],
  ['Apotek Hjärtat', 'Personal', 45, 260],
  ['Systembolaget', 'Personal', 89, 320],
  ['Filmstaden', 'Entertainment', 145, 290],
  ['Akademibokhandeln', 'Education/Stationery', 79, 450],
];

const sms = (amount: number, merchant: string) =>
  `Txn of SEK ${amount.toFixed(2)} done using HDFC Bank Card x1234 at ${merchant.toUpperCase()} on ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.`;

export function demoData() {
  const r = rng(7);
  const now = new Date();
  const txs: Transaction[] = [];
  let id = 1;

  for (let back = 0; back < 62; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const n = back === 0 ? 2 : Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const [merchant, category, lo, hi] = SPENDS[Math.floor(r() * SPENDS.length)];
      const at = new Date(day);
      at.setHours(8 + Math.floor(r() * 13), Math.floor(r() * 60));
      if (at > now) at.setTime(now.getTime() - (k + 1) * 3_600_000);
      const amount = Math.round(lo + r() * (hi - lo));
      txs.push({ id: id++, date: at.toISOString(), merchant, category, amount, currency: 'SEK', raw_text: sms(amount, merchant) });
    }
  }

  for (let m = 0; m < 3; m++) {
    const at = (d: number, h: number) => new Date(now.getFullYear(), now.getMonth() - m, d, h, 0);
    const push = (t: Omit<Transaction, 'id' | 'date'>, when: Date) => { if (when <= now) txs.push({ id: id++, date: when.toISOString(), ...t }); };
    push({ merchant: 'Stipend · KTH', category: 'Income', amount: 15000, currency: 'SEK' }, at(25, 9));
    push({ merchant: 'From Amma (NEFT)', category: 'Income', amount: 40000, currency: 'INR' }, at(2, 11));
    push({ merchant: 'Rent · Heimstaden (SWIFT)', category: 'Housing', amount: 62000, currency: 'INR', raw_text: 'INR 62,000.00 debited from A/c XX1234 for Outward Remittance SWIFT to HEIMSTADEN AB' }, at(1, 10));
    push({ merchant: 'SWIFT charges', category: 'Bank fees', amount: 590, currency: 'INR' }, at(1, 10));
    push({ merchant: 'Forex markup fee', category: 'Bank fees', amount: 1240, currency: 'INR', raw_text: 'Rs 1,240.00 debited towards Cross Currency Markup fee' }, at(5, 9));
    push({ merchant: 'Telia', category: 'Bills & utilities', amount: 249, currency: 'SEK' }, at(8, 9));
    push({ merchant: 'SL 30-day ticket', category: 'Transport', amount: 1060, currency: 'SEK' }, at(3, 8));
  }

  // A few that need review, like fresh SMS imports.
  txs.push(
    { id: id++, date: new Date(now.getTime() - 40 * 60_000).toISOString(), merchant: 'Hemköp', category: 'Suggested: Groceries', amount: 187, currency: 'SEK', raw_text: sms(187, 'Hemköp') },
    { id: id++, date: new Date(now.getTime() - 5 * 3_600_000).toISOString(), merchant: 'Sumup Kebab Corner', category: 'Uncategorized', amount: 95, currency: 'SEK', raw_text: sms(95, 'SUMUP *KEBAB CORNER') },
  );

  txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const accounts: Account[] = [
    { id: 1, name: 'HDFC Savings', balance: 342500, currency: 'INR' },
    { id: 2, name: 'SBI Salary', balance: 58900, currency: 'INR' },
    { id: 3, name: 'Cash in wallet', balance: 650, currency: 'SEK' },
  ];
  const vaults: Vault[] = [
    { id: 1, name: 'Flight home for Diwali', target_amount: 9000, current_amount: 6200, currency: 'SEK' },
    { id: 2, name: 'Winter jacket', target_amount: 2500, current_amount: 2500, currency: 'SEK' },
    { id: 3, name: 'Emergency fund', target_amount: 200000, current_amount: 86000, currency: 'INR' },
  ];
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const ahead = (days: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  const deposits: Deposit[] = [
    { id: 1, name: 'SBI 1-year FD', amount: 100000, interest_rate: 6.8, maturity_date: ahead(140), created_at: ago(225), currency: 'INR' },
  ];
  const debts: Debt[] = [
    { id: 1, name: 'HDFC Regalia card', amount: 18400, interest_rate: 42, type: 'Credit Card', currency: 'INR' },
    { id: 2, name: 'Education loan (SBI)', amount: 280000, interest_rate: 9.5, type: 'Education Loan', currency: 'INR' },
  ];
  const subscriptions: Subscription[] = [
    { id: 1, name: 'Telia mobil', amount: 249, cycle: 'Monthly', next_due_date: ahead(2), currency: 'SEK' },
    { id: 2, name: 'Spotify', amount: 129, cycle: 'Monthly', next_due_date: ahead(6), currency: 'SEK' },
    { id: 3, name: 'SATS gym', amount: 449, cycle: 'Monthly', next_due_date: ahead(-1), currency: 'SEK' },
    { id: 4, name: 'SL 30-day ticket', amount: 1060, cycle: 'Monthly', next_due_date: ahead(15), currency: 'SEK' },
    { id: 5, name: 'Rent · Heimstaden', amount: 6800, cycle: 'Monthly', next_due_date: ahead(13), currency: 'SEK' },
  ];

  return { transactions: txs, accounts, vaults, deposits, debts, subscriptions };
}
