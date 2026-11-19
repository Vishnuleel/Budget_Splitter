import { useDeferredValue, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X, ArrowDownUp, Download } from 'lucide-react';
import TransactionRow from '../components/TransactionRow';
import { Chip } from '../components/ui/primitives';
import { saveMerchantRule } from '../components/sheets/TxSheet';
import { useData } from '../store/DataContext';
import { useUI } from '../store/UIContext';
import { CATEGORIES, CATEGORY_META, effectiveCategory, isExpense, needsReview } from '../lib/categories';
import { dayKey, dayLabel } from '../lib/format';
import { exportCsv } from '../lib/csv';
import type { Transaction } from '../lib/types';
import { money, amt } from '../lib/money';

type Sort = 'date' | 'high' | 'low';

export default function ActivityPage({ hidden }: { hidden: boolean }) {
  const { transactions, freshIds, update, removeTransactionWithUndo } = useData();
  const { openSheet, activityFilter: filter, setActivityFilter: setFilter } = useUI();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const q = useDeferredValue(query.trim().toLowerCase());

  const reviewCount = transactions.filter(needsReview).length;

  const filtered = useMemo(() => {
    let list = transactions.filter(t => {
      if (filter === 'review' && !needsReview(t)) return false;
      if (filter === 'expense' && !isExpense(t)) return false;
      if (filter === 'income' && t.category !== 'Income') return false;
      if (!['all', 'review', 'expense', 'income'].includes(filter) && effectiveCategory(t) !== filter) return false;
      if (q && !(`${t.merchant} ${t.category} ${t.amount}`.toLowerCase().includes(q))) return false;
      return true;
    });
    if (sort === 'high') list = [...list].sort((a, b) => b.amount - a.amount);
    if (sort === 'low') list = [...list].sort((a, b) => a.amount - b.amount);
    return list;
  }, [transactions, filter, q, sort]);

  const groups = useMemo(() => {
    if (sort !== 'date') return [{ key: 'sorted', label: sort === 'high' ? 'Biggest first' : 'Smallest first', items: filtered, net: 0 }];
    const map = new Map<string, { key: string; label: string; items: Transaction[]; net: number }>();
    for (const t of filtered) {
      const d = new Date(t.date);
      const k = dayKey(d);
      if (!map.has(k)) map.set(k, { key: k, label: dayLabel(d), items: [], net: 0 });
      const g = map.get(k)!;
      g.items.push(t);
      if (t.category === 'Income') g.net += amt(t);
      else if (isExpense(t)) g.net -= amt(t);
    }
    return [...map.values()];
  }, [filtered, sort]);

  const totalOut = filtered.filter(isExpense).reduce((a, t) => a + amt(t), 0);

  const chips: { id: string; label: string }[] = [
    { id: 'all', label: 'All' },
    ...(reviewCount ? [{ id: 'review', label: `To review · ${reviewCount}` }] : []),
    { id: 'expense', label: 'Spent' },
    { id: 'income', label: 'Received' },
    ...CATEGORIES.map(c => ({ id: c, label: CATEGORY_META[c].short })),
  ];

  const nextSort: Record<Sort, Sort> = { date: 'high', high: 'low', low: 'date' };

  return (
    <div className="page" style={{ gap: 8 }}>
      <div className="sticky-tools">
        <div className="row">
          <label className="search grow">
            <Search size={18} className="faint" />
            <span className="sr-only">Search transactions</span>
            <input placeholder="Search payments" value={query} onChange={e => setQuery(e.target.value)} />
            <AnimatePresence>
              {query && (
                <motion.button type="button" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => setQuery('')} aria-label="Clear search" className="faint" style={{ display: 'flex' }}>
                  <X size={18} />
                </motion.button>
              )}
            </AnimatePresence>
          </label>
          <motion.button type="button" className="icon-btn" style={{ width: 48, height: 48, borderRadius: 16 }} whileTap={{ scale: 0.9 }}
            onClick={() => setSort(s => nextSort[s])} aria-label={`Sort: ${sort === 'date' ? 'newest' : sort === 'high' ? 'highest amount' : 'lowest amount'}`}>
            <motion.span key={sort} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} style={{ display: 'flex', color: sort === 'date' ? undefined : 'var(--jade)' }}>
              <ArrowDownUp size={19} />
            </motion.span>
          </motion.button>
          <motion.button type="button" className="icon-btn" style={{ width: 48, height: 48, borderRadius: 16 }} whileTap={{ scale: 0.9 }}
            onClick={() => exportCsv(filtered)} aria-label="Export these transactions as CSV">
            <Download size={19} />
          </motion.button>
        </div>
        <div className="scroller" style={{ paddingBottom: 2 }}>
          {chips.map(c => (
            <Chip key={c.id} group="activity" active={filter === c.id} onClick={() => setFilter(c.id)}>{c.label}</Chip>
          ))}
        </div>
      </div>

      <motion.div key={`${filter}-${sort}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="row" style={{ justifyContent: 'space-between', padding: '0 4px', fontSize: '0.82rem', fontWeight: 700 }}>
        <span className="faint">{filtered.length} transaction{filtered.length === 1 ? '' : 's'}</span>
        {totalOut > 0 && <span className={`muted num${hidden ? ' blurred' : ''}`}>{money(totalOut)} spent</span>}
      </motion.div>

      {filtered.length === 0 ? (
        <motion.div className="empty" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          {filter === 'review' ? 'All caught up — nothing left to review.' : q ? `Nothing matches “${query}”.` : 'No transactions here yet.'}
        </motion.div>
      ) : (
        groups.map(g => (
          <section key={g.key} aria-label={g.label}>
            <div className="day-head">
              <span>{g.label}</span>
              {sort === 'date' && g.net !== 0 && (
                <span className={`num${hidden ? ' blurred' : ''}`} style={{ color: g.net > 0 ? 'var(--income)' : 'var(--ink-3)' }}>{money(g.net, { sign: true })}</span>
              )}
            </div>
            <div className="tx-list">
              <AnimatePresence initial={false}>
                {g.items.map(tx => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    fresh={freshIds.has(tx.id)}
                    hidden={hidden}
                    onOpen={() => openSheet({ kind: 'tx', id: tx.id })}
                    onDelete={() => removeTransactionWithUndo(tx)}
                    onAccept={c => { update('transactions', tx.id, { category: c }); saveMerchantRule(tx.merchant, c); }}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        ))
      )}
      {filtered.length > 0 && <p className="faint" style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, marginTop: 12 }}>Swipe a row left to delete · tap to edit</p>}
    </div>
  );
}
