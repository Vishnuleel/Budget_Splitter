import { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Plus, MessageSquareText, Split, Target, Download, ReceiptText,
  Tag, ChevronRight, Bell, type LucideIcon,
} from 'lucide-react';
import BalanceCard from '../components/BalanceCard';
import TransactionRow from '../components/TransactionRow';
import { Ring, SectionHead, rise, stagger } from '../components/ui/primitives';
import { useData } from '../store/DataContext';
import { useUI } from '../store/UIContext';
import { useSetting } from '../lib/settings';
import { isExpense, needsReview } from '../lib/categories';
import { daysInMonth, daysUntil, inMonth } from '../lib/format';
import { exportCsv } from '../lib/csv';
import { balances } from '../lib/splits';
import { useShared } from '../lib/sharedApi';
import { saveMerchantRule } from '../components/sheets/TxSheet';
import { money, moneyCompact, amt } from '../lib/money';

type Action = { label: string; icon: LucideIcon; onClick: () => void };

export default function HomePage({ hidden }: { hidden: boolean }) {
  const { transactions, accounts, deposits, debts, subscriptions, freshIds, update, removeTransactionWithUndo, markSubscriptionPaid } = useData();
  const { openSheet, setTab, setActivityFilter } = useUI();
  const [budget] = useSetting('monthlyBudget');
  const [splits] = useSetting('splits');

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const { spent, income } = useMemo(() => {
    let s = 0, inc = 0;
    for (const t of transactions) {
      if (!inMonth(t.date, y, m)) continue;
      if (t.category === 'Income') inc += amt(t);
      else if (isExpense(t)) s += amt(t);
    }
    return { spent: s, income: inc };
  }, [transactions, y, m]);

  const netWorth =
    accounts.reduce((a, x) => a + amt({ amount: x.balance, currency: x.currency }), 0) +
    deposits.reduce((a, x) => a + amt(x), 0) -
    debts.reduce((a, x) => a + amt(x), 0);

  const reviewCount = transactions.filter(needsReview).length;
  const daysLeft = daysInMonth(y, m) - now.getDate() + 1;
  const remaining = budget - spent;
  const perDay = remaining > 0 ? remaining / daysLeft : 0;
  const used = budget > 0 ? spent / budget : 0;
  const ringColor = used > 1 ? 'var(--rose)' : used > 0.8 ? 'var(--marigold)' : 'var(--jade)';

  const shared = useShared();
  const owedToMe = useMemo(() => {
    let v = 0;
    balances(splits.people, splits.entries).forEach(b => { v += b; });
    shared.balances.forEach(b => { v += b; });
    return v;
  }, [splits, shared.balances]);

  const upcoming = subscriptions.filter(s => s.next_due_date).slice(0, 4);

  // Only actions with no other way in: expenses use the + button, Wealth and Bills are tabs, splitting has its own card.
  const actions: Action[] = [
    { label: 'Add income', icon: Plus, onClick: () => openSheet({ kind: 'add', mode: 'income' }) },
    { label: 'Paste SMS', icon: MessageSquareText, onClick: () => openSheet({ kind: 'sms' }) },
    { label: 'Budgets', icon: Target, onClick: () => openSheet({ kind: 'budgets' }) },
    { label: 'Export', icon: Download, onClick: () => exportCsv(transactions) },
  ];

  return (
    <motion.div className="page" variants={stagger} initial="hidden" animate="show">
      <BalanceCard netWorth={netWorth} spent={spent} income={income} hidden={hidden} onOpenWealth={() => setTab('wealth')} />

      {/* The product's own job, first: split a shop receipt item by item. */}
      <motion.button variants={rise} type="button" className="card row split-cta" onClick={() => openSheet({ kind: 'splits' })} whileTap={{ scale: 0.98 }}>
        <span className="tile split-cta-icon"><ReceiptText size={20} /></span>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>Split a receipt</div>
          <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 500 }}>Scan it, tick who had what, everyone sees their share</div>
        </div>
        <ChevronRight size={20} className="faint" />
      </motion.button>

      <motion.div variants={rise} className="quick-grid" role="list">
        {actions.map(a => (
          <motion.button key={a.label} type="button" role="listitem" className="quick" onClick={a.onClick} whileTap={{ scale: 0.96 }}>
            <span className="quick-icon"><a.icon size={20} strokeWidth={1.75} /></span>
            {a.label}
          </motion.button>
        ))}
      </motion.div>

      {shared.todo.length > 0 && (
        <motion.button variants={rise} type="button" className="card row" style={{ background: 'var(--jade-soft)', textAlign: 'left', width: '100%' }}
          onClick={() => (shared.todo.length === 1 ? openSheet({ kind: 'shared', id: shared.todo[0].bill.id }) : openSheet({ kind: 'splits' }))} whileTap={{ scale: 0.98 }}>
          <span className="tile" style={{ width: 36, height: 36, background: 'var(--jade)', color: 'var(--on-primary)' }}><Bell size={18} /></span>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{shared.todo.length === 1 ? 'A shared bill needs you' : `${shared.todo.length} shared bills need you`}</div>
            <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 500 }}>Review, approve a change, or confirm a payment</div>
          </div>
          <ChevronRight size={20} className="faint" />
        </motion.button>
      )}

      {reviewCount > 0 && (
        <motion.button
          variants={rise}
          type="button"
          className="card row"
          style={{ background: 'var(--marigold-soft)', borderColor: 'transparent', textAlign: 'left', width: '100%' }}
          onClick={() => { setActivityFilter('review'); setTab('activity'); }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="tile" style={{ width: 36, height: 36, background: 'var(--marigold)', color: 'var(--on-brand)' }}>
            <Tag size={18} />
          </span>
          <div className="grow">
            <div style={{ fontWeight: 600, color: 'var(--marigold-ink)' }}>{reviewCount} payment{reviewCount > 1 ? 's' : ''} need a category</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--marigold-ink)', opacity: 0.85 }}>One tap each, and the merchant is remembered</div>
          </div>
          <ChevronRight size={20} color="var(--marigold-ink)" />
        </motion.button>
      )}

      <motion.section variants={rise} className="card row" style={{ gap: 18 }} aria-label="Monthly budget">
        <Ring value={used} size={76} stroke={8} color={ringColor}>
          <div>
            <div className="display num" style={{ fontSize: '1.05rem' }}>{Math.round(used * 100)}%</div>
            <div className="faint" style={{ fontSize: '0.68rem', fontWeight: 500 }}>used</div>
          </div>
        </Ring>
        <div className="grow">
          <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
            {now.toLocaleDateString('en-IN', { month: 'long' })} budget
          </div>
          <div className={`display num${hidden ? ' blurred' : ''}`} style={{ fontSize: '1.15rem', marginTop: 2 }}>
            {money(spent)} <span className="faint" style={{ fontSize: '0.95rem', fontWeight: 600 }}>of {moneyCompact(budget)}</span>
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, marginTop: 6, color: remaining < 0 ? 'var(--rose)' : 'var(--ink-2)' }}>
            {remaining < 0
              ? `Over by ${money(-remaining)} — ease up this week`
              : `${money(perDay)}/day left for ${daysLeft} day${daysLeft > 1 ? 's' : ''}`}
          </div>
        </div>
      </motion.section>

      {Math.abs(owedToMe) > 0.5 && (
        <motion.button variants={rise} type="button" className="card row" style={{ width: '100%', textAlign: 'left' }} onClick={() => openSheet({ kind: 'splits' })} whileTap={{ scale: 0.98 }}>
          <span className="tile" style={{ width: 42, height: 42, background: '#c2417f1f', color: '#c2417f' }}><Split size={20} /></span>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{owedToMe > 0 ? 'Friends owe you' : 'You owe friends'}</div>
            <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 500 }}>Tap to settle up</div>
          </div>
          <div className="display num" style={{ fontSize: '1.15rem', color: owedToMe > 0 ? 'var(--income)' : 'var(--rose)' }}>{money(Math.abs(owedToMe))}</div>
        </motion.button>
      )}

      {upcoming.length > 0 && (
        <motion.section variants={rise}>
          <SectionHead title="Coming up" action={<button className="link-btn" onClick={() => setTab('insights')}>All bills</button>} />
          <div className="scroller">
            {upcoming.map(s => {
              const d = daysUntil(s.next_due_date);
              const tone = d == null ? 'neutral' : d < 0 ? 'bad' : d <= 3 ? 'warn' : 'good';
              return (
                <motion.div key={s.id} className="card card-tight" style={{ width: 150 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }} className="ellipsis">{s.name}</span>
                  </div>
                  <div className="display num" style={{ fontSize: '1.05rem', margin: '4px 0' }}>{money(s.amount, { currency: s.currency ?? 'INR' })}</div>
                  <span className={`badge ${tone}`}>
                    {d == null ? s.cycle : d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : `In ${d} day${d > 1 ? 's' : ''}`}
                  </span>
                  <motion.button type="button" className="btn btn-sm btn-ghost btn-block" style={{ marginTop: 10 }} whileTap={{ scale: 0.95 }}
                    onClick={() => markSubscriptionPaid(s, true)}>
                    Mark paid
                  </motion.button>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      <motion.section variants={rise}>
        <SectionHead title="Recent activity" action={<button className="link-btn" onClick={() => { setActivityFilter('all'); setTab('activity'); }}>See all</button>} />
        {transactions.length === 0 ? (
          <div className="empty">No transactions yet. Tap + to add your first one, or paste a bank SMS.</div>
        ) : (
          <div className="tx-list">
            {transactions.slice(0, 5).map(tx => (
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
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}
