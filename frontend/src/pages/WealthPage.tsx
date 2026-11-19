import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, PiggyBank, Landmark, CreditCard, Percent, CalendarCheck } from 'lucide-react';
import { AnimatedNumber, Bar, SectionHead, rise, stagger } from '../components/ui/primitives';
import FormSheet, { type FormSpec } from '../components/sheets/FormSheet';
import { useData } from '../store/DataContext';
import { useFeedback } from '../components/ui/Feedback';
import { daysUntil, parseDateOnly, pct } from '../lib/format';
import type { Account, Debt, Deposit, Vault } from '../lib/types';
import { money, moneyCompact, amt, CURRENCY_CODES, displayCurrency } from '../lib/money';
import { getSetting } from '../lib/settings';

const CARD_GRADIENTS = [
  'linear-gradient(135deg, #1e293b, #0f172a)',
  'linear-gradient(135deg, #b45309, #78350f)',
  'linear-gradient(135deg, #1d4ed8, #1e3a8a)',
  'linear-gradient(135deg, #0f766e, #134e4a)',
  'linear-gradient(135deg, #be185d, #831843)',
  'linear-gradient(135deg, #475569, #1e293b)',
];

const cur = (c?: string | null) => c ?? 'INR';
const currencyField = { name: 'currency', label: 'Currency', type: 'select' as const, options: CURRENCY_CODES as string[], half: true };
const defaultCurrency = (c?: string | null) => (c ? c : getSetting('entryCurrency'));

/** Small "≈ 1 234 kr" line under amounts that aren't in the display currency. */
function Approx({ amount, currency }: { amount: number; currency?: string | null }) {
  if (cur(currency) === displayCurrency()) return null;
  return <div style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.75 }}>≈ {money(amt({ amount, currency }))}</div>;
}

function maturityValue(dep: Deposit) {
  if (!dep.maturity_date) return null;
  const start = dep.created_at ? new Date(dep.created_at) : new Date();
  const years = Math.max(0, (parseDateOnly(dep.maturity_date).getTime() - start.getTime()) / (365.25 * 86_400_000));
  // Indian bank FDs typically compound quarterly.
  return Number(dep.amount) * Math.pow(1 + (Number(dep.interest_rate) || 0) / 400, 4 * years);
}

export default function WealthPage({ hidden }: { hidden: boolean }) {
  const { accounts, vaults, deposits, debts, insert, update, remove } = useData();
  const { celebrate } = useFeedback();
  const [form, setForm] = useState<FormSpec | null>(null);

  const cash = accounts.reduce((a, x) => a + amt({ amount: x.balance, currency: x.currency }), 0);
  const fds = deposits.reduce((a, x) => a + amt(x), 0);
  const owed = debts.reduce((a, x) => a + amt(x), 0);
  const saved = vaults.reduce((a, x) => a + amt({ amount: x.current_amount, currency: x.currency }), 0);
  const assets = cash + fds;
  const net = assets - owed;
  const h = hidden ? ' blurred' : '';

  const accountForm = (a?: Account): FormSpec => ({
    title: a ? a.name : 'Add account',
    note: a ? 'Update the balance whenever you check your bank app.' : 'Your Indian bank account (INR), a Swedish account or card (SEK), cash…',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'HDFC Savings, Revolut, Cash', required: true },
      { name: 'balance', label: 'Current balance', type: 'number', required: true, half: true },
      currencyField,
    ],
    initial: { name: a?.name ?? '', balance: a ? String(a.balance) : '', currency: a ? cur(a.currency) : defaultCurrency() },
    onSubmit: async v => {
      const row = { name: v.name.trim(), balance: Number(v.balance) || 0, currency: v.currency };
      return a ? update('accounts', a.id, row) : !!(await insert('accounts', row));
    },
    onDelete: a ? () => remove('accounts', a.id) : undefined,
  });

  const vaultForm = (v?: Vault): FormSpec => ({
    title: v ? v.name : 'New savings goal',
    fields: [
      { name: 'name', label: 'Goal', placeholder: 'Flight home, Winter jacket, Emergency fund', required: true },
      { name: 'target_amount', label: 'Target', type: 'number', required: true, half: true },
      currencyField,
      { name: 'current_amount', label: 'Saved so far', type: 'number' },
    ],
    initial: { name: v?.name ?? '', target_amount: v ? String(v.target_amount) : '', current_amount: v ? String(v.current_amount) : '', currency: v ? cur(v.currency) : defaultCurrency() },
    onSubmit: async x => {
      const row = { name: x.name.trim(), target_amount: Number(x.target_amount) || 0, current_amount: Number(x.current_amount) || 0, currency: x.currency };
      return v ? update('vaults', v.id, row) : !!(await insert('vaults', row));
    },
    onDelete: v ? () => remove('vaults', v.id) : undefined,
  });

  const topUpForm = (v: Vault): FormSpec => ({
    title: `Add to ${v.name}`,
    fields: [{ name: 'amount', label: `Amount (${cur(v.currency)})`, type: 'number', required: true }],
    submitLabel: 'Add money',
    onSubmit: async x => {
      const add = Number(x.amount) || 0;
      const next = Number(v.current_amount) + add;
      const ok = await update('vaults', v.id, { current_amount: next });
      if (ok && next >= Number(v.target_amount) && Number(v.current_amount) < Number(v.target_amount)) {
        celebrate({ amount: money(next, { currency: cur(v.currency) }), title: `${v.name} is fully funded!`, subtitle: 'Goal reached' });
      }
      return ok;
    },
  });

  const depositForm = (d?: Deposit): FormSpec => ({
    title: d ? d.name : 'Add deposit',
    note: d ? undefined : 'FDs in India, or a Swedish sparkonto with a fixed rate.',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'SBI 1-year FD', required: true },
      { name: 'amount', label: 'Principal', type: 'number', required: true, half: true },
      currencyField,
      { name: 'interest_rate', label: 'Rate (% p.a.)', type: 'number', half: true },
      { name: 'maturity_date', label: 'Maturity date', type: 'date', half: true },
    ],
    initial: { name: d?.name ?? '', amount: d ? String(d.amount) : '', interest_rate: d ? String(d.interest_rate ?? '') : '', maturity_date: d?.maturity_date ?? '', currency: d ? cur(d.currency) : 'INR' },
    onSubmit: async x => {
      const row = { name: x.name.trim(), amount: Number(x.amount) || 0, interest_rate: Number(x.interest_rate) || 0, maturity_date: x.maturity_date || null, currency: x.currency };
      return d ? update('deposits', d.id, row) : !!(await insert('deposits', row));
    },
    onDelete: d ? () => remove('deposits', d.id) : undefined,
  });

  const debtForm = (d?: Debt): FormSpec => ({
    title: d ? d.name : 'Add debt',
    note: d ? 'Paid some off? Lower the outstanding amount.' : undefined,
    fields: [
      { name: 'name', label: 'Name', placeholder: 'HDFC credit card', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['Credit Card', 'Education Loan', 'CSN student loan', 'Personal Loan', 'Vehicle Loan', 'Mortgage', 'Other'] },
      { name: 'amount', label: 'Outstanding', type: 'number', required: true, half: true },
      currencyField,
      { name: 'interest_rate', label: 'APR (%)', type: 'number' },
    ],
    initial: { name: d?.name ?? '', type: d?.type ?? 'Credit Card', amount: d ? String(d.amount) : '', interest_rate: d ? String(d.interest_rate ?? '') : '', currency: d ? cur(d.currency) : 'INR' },
    onSubmit: async x => {
      const row = { name: x.name.trim(), type: x.type, amount: Number(x.amount) || 0, interest_rate: Number(x.interest_rate) || 0, currency: x.currency };
      return d ? update('debts', d.id, row) : !!(await insert('debts', row));
    },
    onDelete: d ? () => remove('debts', d.id) : undefined,
  });

  return (
    <motion.div className="page" variants={stagger} initial="hidden" animate="show">
      <motion.section variants={rise} className="card">
        <div className="faint" style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.06em' }}>NET WORTH</div>
        <div className={`display num${h}`} style={{ fontSize: '1.8rem', margin: '2px 0 12px' }}>
          <AnimatedNumber value={net} format={n => money(n)} />
        </div>
        <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', gap: 3, background: 'var(--surface-2)' }} aria-hidden="true">
          {[
            { v: cash, c: 'var(--jade)' },
            { v: fds, c: 'var(--marigold)' },
            { v: owed, c: 'var(--rose)' },
          ].map((s, i) => (
            <motion.div key={i} style={{ background: s.c, borderRadius: 999 }} initial={{ flexGrow: 0 }} animate={{ flexGrow: s.v }} transition={{ duration: 1, delay: 0.2 + i * 0.1, ease: [0.22, 1, 0.36, 1] }} />
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, fontSize: '0.8rem', fontWeight: 700, flexWrap: 'wrap', rowGap: 6 }}>
          {[
            { k: 'Accounts', v: cash, c: 'var(--jade)' },
            { k: 'Deposits', v: fds, c: 'var(--marigold)' },
            { k: 'Debts', v: owed, c: 'var(--rose)' },
          ].map(s => (
            <span key={s.k} className="row" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: s.c }} />
              <span className="faint">{s.k}</span>
              <span className={`num${h}`}>{moneyCompact(s.v)}</span>
            </span>
          ))}
        </div>
      </motion.section>

      <motion.section variants={rise}>
        <SectionHead title="Accounts" />
        <div className="scroller">
          {accounts.map((a, i) => (
            <motion.button
              key={a.id}
              type="button"
              className="wallet-card"
              style={{ background: CARD_GRADIENTS[i % CARD_GRADIENTS.length] }}
              onClick={() => setForm(accountForm(a))}
              initial={{ opacity: 0, x: 40, rotate: 3 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 24 }}
              whileHover={{ y: -4, rotate: -1 }}
              whileTap={{ scale: 0.96 }}
            >
              <svg className="pattern" width="180" height="180" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M11.27 36.73A18 18 0 0 1 36.73 11.27Z" fill="#fff" />
                <path d="M38 13A18 18 0 0 1 13 38Z" fill="#fff" opacity="0.6" />
              </svg>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="name ellipsis">{a.name}</span>
                <Landmark size={18} opacity={0.8} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', opacity: 0.75, fontWeight: 700 }}>Balance</div>
                <div className={`bal num${h}`}>{money(a.balance, { currency: cur(a.currency) })}</div>
                <div className={h}><Approx amount={a.balance} currency={a.currency} /></div>
              </div>
            </motion.button>
          ))}
          <motion.button type="button" className="wallet-add" whileTap={{ scale: 0.95 }} whileHover={{ y: -3 }} onClick={() => setForm(accountForm())}>
            <Plus size={22} /> Add
          </motion.button>
        </div>
      </motion.section>

      <motion.section variants={rise}>
        <SectionHead title="Savings goals" action={<button className="link-btn" onClick={() => setForm(vaultForm())}>+ New goal</button>} />
        {vaults.length === 0 ? (
          <div className="empty">Name a goal, set a target, and watch it fill up.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vaults.map((v, i) => {
              const p = pct(Number(v.current_amount), Number(v.target_amount));
              const done = p >= 100;
              return (
                <div key={v.id} className="card">
                  <div className="row">
                    <button type="button" className="row grow" style={{ textAlign: 'left' }} onClick={() => setForm(vaultForm(v))}>
                      <span className="tile" style={{ width: 42, height: 42, background: done ? 'var(--income-soft)' : 'var(--marigold-soft)', color: done ? 'var(--income)' : 'var(--marigold-ink)' }}>
                        <PiggyBank size={20} />
                      </span>
                      <div className="grow">
                        <div style={{ fontWeight: 800 }} className="ellipsis">{v.name}</div>
                        <div className={`faint num${h}`} style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                          {money(v.current_amount, { currency: cur(v.currency) })} of {money(v.target_amount, { currency: cur(v.currency) })}
                        </div>
                      </div>
                    </button>
                    <motion.button type="button" className="btn btn-sm btn-jade" whileTap={{ scale: 0.92 }} onClick={() => setForm(topUpForm(v))} aria-label={`Add money to ${v.name}`}>
                      <Plus size={15} /> Add
                    </motion.button>
                  </div>
                  <div className="row" style={{ marginTop: 12, gap: 10 }}>
                    <div className="grow"><Bar value={p} color={done ? 'var(--income)' : 'var(--marigold)'} delay={0.15 + i * 0.08} /></div>
                    <span className="num" style={{ fontWeight: 800, fontSize: '0.85rem', minWidth: 40, textAlign: 'right' }}>{Math.min(100, Math.round(p))}%</span>
                  </div>
                </div>
              );
            })}
            <p className="faint" style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0 4px' }}>
              Goals track money set aside in your accounts ({moneyCompact(saved)} so far), so they aren’t added to net worth twice.
            </p>
          </div>
        )}
      </motion.section>

      <motion.section variants={rise}>
        <SectionHead title="Deposits" action={<button className="link-btn" onClick={() => setForm(depositForm())}>+ Add</button>} />
        {deposits.length === 0 ? (
          <div className="empty">No FDs yet.</div>
        ) : (
          <div className="card" style={{ padding: '4px 16px' }}>
            {deposits.map(d => {
              const left = daysUntil(d.maturity_date);
              const mv = maturityValue(d);
              return (
                <button key={d.id} type="button" className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setForm(depositForm(d))}>
                  <span className="tile" style={{ width: 40, height: 40, background: 'var(--marigold-soft)', color: 'var(--marigold-ink)' }}><Percent size={18} /></span>
                  <div className="grow">
                    <div style={{ fontWeight: 800 }} className="ellipsis">{d.name}</div>
                    <div className="row" style={{ gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      <span className="badge warn">{d.interest_rate}% p.a.</span>
                      {left != null && (
                        <span className="faint row" style={{ fontSize: '0.75rem', fontWeight: 700, gap: 4 }}>
                          <CalendarCheck size={12} />{left <= 0 ? 'Matured' : `${left} days left`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={`num${h}`} style={{ fontWeight: 800 }}>{money(d.amount, { currency: cur(d.currency) })}</div>
                    {mv && <div className={`num${h}`} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--income)' }}>→ {moneyCompact(mv, cur(d.currency))}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </motion.section>

      <motion.section variants={rise}>
        <SectionHead title="Debts" action={<button className="link-btn" onClick={() => setForm(debtForm())}>+ Add</button>} />
        {debts.length === 0 ? (
          <div className="empty">Debt-free. Keep it that way.</div>
        ) : (
          <div className="card" style={{ padding: '4px 16px' }}>
            {[...debts].sort((a, b) => (Number(b.interest_rate) || 0) - (Number(a.interest_rate) || 0)).map((d, i) => (
              <button key={d.id} type="button" className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setForm(debtForm(d))}>
                <span className="tile" style={{ width: 40, height: 40, background: 'var(--rose-soft)', color: 'var(--rose)' }}><CreditCard size={18} /></span>
                <div className="grow">
                  <div style={{ fontWeight: 800 }} className="ellipsis">{d.name}</div>
                  <div className="row" style={{ gap: 6, marginTop: 3 }}>
                    <span className="badge bad">{d.type}</span>
                    {Number(d.interest_rate) > 0 && <span className="faint" style={{ fontSize: '0.75rem', fontWeight: 700 }}>{d.interest_rate}% APR</span>}
                    {i === 0 && debts.length > 1 && Number(d.interest_rate) > 0 && <span className="badge warn">Pay first</span>}
                  </div>
                </div>
                <div className={`num${h}`} style={{ fontWeight: 800, color: 'var(--rose)', textAlign: 'right' }}>{money(-d.amount, { currency: cur(d.currency) })}<Approx amount={d.amount} currency={d.currency} /></div>
              </button>
            ))}
          </div>
        )}
      </motion.section>

      <FormSheet spec={form} onClose={() => setForm(null)} />
    </motion.div>
  );
}
