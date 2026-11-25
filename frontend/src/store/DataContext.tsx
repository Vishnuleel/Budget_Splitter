import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import type { Account, Debt, Deposit, Subscription, Transaction, Vault } from '../lib/types';
import { needsReview } from '../lib/categories';
import { findRule, syncSettingsFromCloud } from '../lib/settings';
import { useFeedback } from '../components/ui/Feedback';
import { dayKey, nextCycleDate, parseDateOnly } from '../lib/format';
import { demoData, isDemoMode, setDemoMode } from '../lib/demo';
import { money } from '../lib/money';
import { hintCategory } from '../lib/parser';

const DEMO = isDemoMode();

/**
 * Databases created before multi-currency support have no `currency` column. Rather than failing
 * every save, retry without it once (amounts are then treated as INR) — run supabase/schema.sql to fix.
 */
let currencyColumnMissing = false;
async function withCurrencyFallback<R extends { error: { message: string } | null }>(
  row: object, run: (row: object) => PromiseLike<R>,
): Promise<R> {
  const strip = (r: object) => { const { currency: _c, ...rest } = r as Record<string, unknown>; void _c; return rest; };
  if (currencyColumnMissing) return run(strip(row));
  const res = await run(row);
  if (res.error && /currency/i.test(res.error.message) && 'currency' in row) {
    currencyColumnMissing = true;
    console.warn('No currency column yet — run supabase/schema.sql. Saving without it.');
    return run(strip(row));
  }
  return res;
}
let demoId = 100_000;

type Db = {
  transactions: Transaction[];
  accounts: Account[];
  vaults: Vault[];
  deposits: Deposit[];
  debts: Debt[];
  subscriptions: Subscription[];
};
type Table = keyof Db;
type Row<T extends Table> = Db[T][number];

const EMPTY: Db = { transactions: [], accounts: [], vaults: [], deposits: [], debts: [], subscriptions: [] };

const sortTx = (list: Transaction[]) => [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const sortSubs = (list: Subscription[]) =>
  [...list].sort((a, b) => (a.next_due_date ?? '9999').localeCompare(b.next_due_date ?? '9999'));

function upsertInto<T extends { id: number }>(list: T[], row: T): T[] {
  const i = list.findIndex(r => r.id === row.id);
  if (i === -1) return [...list, row];
  const copy = list.slice();
  copy[i] = { ...copy[i], ...row };
  return copy;
}

function normalize<T extends Table>(table: T, list: Db[T]): Db[T] {
  if (table === 'transactions') return sortTx(list as Transaction[]) as Db[T];
  if (table === 'subscriptions') return sortSubs(list as Subscription[]) as Db[T];
  return list;
}

type Ctx = Db & {
  demo: boolean;
  loading: boolean;
  freshIds: Set<number>;
  refresh: () => Promise<void>;
  insert: <T extends Table>(table: T, row: Partial<Row<T>>) => Promise<Row<T> | null>;
  update: <T extends Table>(table: T, id: number, patch: Partial<Row<T>>) => Promise<boolean>;
  remove: <T extends Table>(table: T, id: number) => Promise<boolean>;
  removeTransactionWithUndo: (tx: Transaction) => void;
  markSubscriptionPaid: (sub: Subscription, logExpense: boolean) => Promise<void>;
};

const DataContext = createContext<Ctx | null>(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside provider');
  return ctx;
}

export function DataProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [db, setDb] = useState<Db>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const { toast } = useFeedback();
  // id -> timer + the delete to run (flushed immediately if the app unmounts mid-undo window)
  const pendingDeletes = useRef(new Map<number, { timer: number; run: () => void }>());
  const txIds = useRef(new Set<number>());
  const payingSubs = useRef(new Set<number>());
  useEffect(() => { txIds.current = new Set(db.transactions.map(t => t.id)); }, [db.transactions]);

  const setTable = useCallback(<T extends Table>(table: T, fn: (list: Db[T]) => Db[T]) => {
    setDb(d => ({ ...d, [table]: normalize(table, fn(d[table])) }));
  }, []);

  const refresh = useCallback(async () => {
    if (DEMO) {
      const d = demoData();
      setDb({ ...d, transactions: sortTx(d.transactions), subscriptions: sortSubs(d.subscriptions) });
      setLoading(false);
      return;
    }
    const tables: Table[] = ['transactions', 'accounts', 'vaults', 'deposits', 'debts', 'subscriptions'];
    const results = await Promise.all(tables.map(t => supabase.from(t).select('*')));
    const loaded: Partial<Db> = {};
    let failed = 0;
    results.forEach((res, i) => {
      const t = tables[i];
      if (res.error) { failed++; console.error(`Failed to load ${t}`, res.error); return; }
      (loaded[t] as unknown[]) = normalize(t, (res.data ?? []) as Db[typeof t]);
    });
    setDb(prev => {
      // A table that failed keeps what we had, instead of showing up empty.
      const next = { ...prev, ...loaded };
      // Keep rows that are mid "undo" window out of the list.
      next.transactions = next.transactions.filter(tx => !pendingDeletes.current.has(tx.id));
      return next;
    });
    if (failed === tables.length) {
      toast({ message: 'Could not reach Supabase.', actionLabel: 'Try demo data', duration: 12000, onAction: () => setDemoMode(true) });
    } else if (failed) {
      toast({ message: 'Some of your data didn’t load. Reopen the app to try again.' });
    }
    setLoading(false);
  }, [toast]);

  const update = useCallback<Ctx['update']>(async (table, id, patch) => {
    const { error } = DEMO ? { error: null } : await withCurrencyFallback(patch, p => supabase.from(table).update(p as never).eq('id', id));
    if (error) {
      toast({ message: /charged_inr/.test(error.message)
        ? 'Couldn’t save the rupee amount yet: run the charged_inr line from supabase/schema.sql in Supabase.'
        : `Couldn't save: ${error.message}` });
      return false;
    }
    setTable(table, list => (list as { id: number }[]).map(r => (r.id === id ? { ...r, ...patch } : r)) as Db[typeof table]);
    return true;
  }, [setTable, toast]);

  // Auto-apply saved merchant rules to anything that arrives needing review.
  const applyRule = useCallback((tx: Transaction) => {
    if (!needsReview(tx)) return;
    const rule = findRule(tx.merchant);
    if (rule) update('transactions', tx.id, { category: rule.category });
  }, [update]);

  const markFresh = useCallback((id: number) => {
    setFreshIds(s => new Set(s).add(id));
    window.setTimeout(() => setFreshIds(s => { const n = new Set(s); n.delete(id); return n; }), 4000);
  }, []);

  useEffect(() => {
    refresh();
    const pending = pendingDeletes.current;
    const flush = () => pending.forEach(p => { window.clearTimeout(p.timer); p.run(); });
    if (DEMO) return () => pending.forEach(p => window.clearTimeout(p.timer));
    syncSettingsFromCloud();

    // Row Level Security already limits realtime to your rows; the filter keeps the stream small.
    const channel = supabase
      .channel(`tx-changes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, payload => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: number }).id;
          if (id != null) setTable('transactions', l => l.filter(t => t.id !== id));
          return;
        }
        const row = payload.new as Transaction;
        const isNew = !txIds.current.has(row.id);
        txIds.current.add(row.id);
        setTable('transactions', l => upsertInto(l, row));
        // Rows with raw_text came from the SMS pipeline (not typed in this app) — announce them.
        if (payload.eventType === 'INSERT' && isNew && row.raw_text) {
          markFresh(row.id);
          toast({ message: `New: ${money(row.amount, { currency: row.currency ?? 'INR' })} · ${row.merchant}` });
          applyRule(row);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      flush();
    };
    // Mount-only: subscribe once; the handlers read fresh state through refs/setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insert = useCallback<Ctx['insert']>(async (table, row) => {
    const { data, error } = DEMO
      ? { data: { id: ++demoId, date: new Date().toISOString(), created_at: new Date().toISOString(), ...row } as unknown as Row<typeof table>, error: null }
      : await withCurrencyFallback(row, r => supabase.from(table).insert([r] as never).select().single());
    if (error) {
      toast({ message: `Couldn't save: ${error.message}` });
      return null;
    }
    setTable(table, list => upsertInto(list as { id: number }[], data) as Db[typeof table]);
    if (table === 'transactions') markFresh((data as Transaction).id);
    return data;
  }, [setTable, toast, markFresh]);

  const remove = useCallback<Ctx['remove']>(async (table, id) => {
    const { error } = DEMO ? { error: null } : await supabase.from(table).delete().eq('id', id);
    if (error) {
      toast({ message: `Couldn't delete: ${error.message}` });
      return false;
    }
    setTable(table, list => (list as { id: number }[]).filter(r => r.id !== id) as Db[typeof table]);
    return true;
  }, [setTable, toast]);

  const removeTransactionWithUndo = useCallback((tx: Transaction) => {
    setTable('transactions', l => l.filter(t => t.id !== tx.id));
    const run = async () => {
      pendingDeletes.current.delete(tx.id);
      if (DEMO) return;
      const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
      if (error) {
        setTable('transactions', l => upsertInto(l, tx));
        toast({ message: `Couldn't delete: ${error.message}` });
      }
    };
    const timer = window.setTimeout(run, 4500);
    pendingDeletes.current.set(tx.id, { timer, run });
    toast({
      message: `Deleted ${tx.merchant}`,
      actionLabel: 'Undo',
      duration: 4400,
      onAction: () => {
        window.clearTimeout(timer);
        pendingDeletes.current.delete(tx.id);
        setTable('transactions', l => upsertInto(l, tx));
      },
    });
  }, [setTable, toast]);

  const markSubscriptionPaid = useCallback(async (sub: Subscription, logExpense: boolean) => {
    // A double tap would log the expense twice (both taps see the same due date).
    if (payingSubs.current.has(sub.id)) return;
    payingSubs.current.add(sub.id);
    const next = nextCycleDate(sub.next_due_date ?? dayKey(new Date()), sub.cycle);
    const ok = await update('subscriptions', sub.id, { next_due_date: next });
    if (!ok) { payingSubs.current.delete(sub.id); return; }
    // Released after a short delay so a tap that lands after `update` (stale `sub`) is still ignored.
    window.setTimeout(() => payingSubs.current.delete(sub.id), 1500);
    if (logExpense) {
      await insert('transactions', {
        amount: Number(sub.amount),
        currency: sub.currency ?? 'INR',
        merchant: sub.name,
        category: findRule(sub.name)?.category ?? hintCategory(sub.name) ?? 'Bills & utilities',
        date: new Date().toISOString(),
      });
    }
    toast({ message: `${sub.name} paid · next due ${parseDateOnly(next).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` });
  }, [update, insert, toast]);

  const value = useMemo<Ctx>(() => ({
    ...db, demo: DEMO, loading, freshIds, refresh, insert, update, remove, removeTransactionWithUndo, markSubscriptionPaid,
  }), [db, loading, freshIds, refresh, insert, update, remove, removeTransactionWithUndo, markSubscriptionPaid]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
