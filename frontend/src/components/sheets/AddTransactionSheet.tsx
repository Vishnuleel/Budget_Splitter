import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CATEGORIES, CATEGORY_META } from '../../lib/categories';
import { dayKey, parseAmount } from '../../lib/format';
import { findRule, getSetting, setSetting } from '../../lib/settings';
import { hintCategory } from '../../lib/parser';
import { useData } from '../../store/DataContext';
import { useFeedback } from '../ui/Feedback';
import { Field, Segmented, Sheet } from '../ui/primitives';
import { money, amt, displayCurrency, symbolOf } from '../../lib/money';

const QUICK_CURRENCIES = ['SEK', 'INR', 'EUR', 'USD'];

export function CategoryGrid({ value, onChange, includeSavings = false }: { value: string; onChange: (c: string) => void; includeSavings?: boolean }) {
  const list = includeSavings ? [...CATEGORIES, 'Savings'] : [...CATEGORIES];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 6 }}>
      {list.map(c => {
        const meta = CATEGORY_META[c];
        const Icon = meta.icon;
        const active = value === c;
        return (
          <motion.button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c)}
            whileTap={{ scale: 0.93 }}
            style={{
              position: 'relative', padding: '8px 4px 7px', borderRadius: 13,
              background: active ? `${meta.color}1f` : 'var(--surface)',
              border: `1.5px solid ${active ? meta.color : 'var(--line)'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              fontSize: '0.68rem', fontWeight: 800, color: active ? 'var(--ink)' : 'var(--ink-2)',
              transition: 'background 0.2s, border-color 0.2s',
            }}
          >
            <motion.span animate={{ scale: active ? 1.15 : 1, rotate: active ? [0, -10, 8, 0] : 0 }} style={{ color: meta.color, display: 'flex' }}>
              <Icon size={18} strokeWidth={2.1} />
            </motion.span>
            {meta.short}
          </motion.button>
        );
      })}
    </div>
  );
}

function AddForm({ initialMode, onDone }: { initialMode: 'expense' | 'income'; onDone: () => void }) {
  const { insert, transactions, accounts } = useData();
  const { celebrate } = useFeedback();
  const [mode, setMode] = useState(initialMode);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(dayKey(new Date()));
  const [accountId, setAccountId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [currency, setCurrencyState] = useState<string>(() => getSetting('entryCurrency'));
  const setCurrency = (c: string) => {
    setCurrencyState(c);
    setSetting('entryCurrency', c as ReturnType<typeof getSetting<'entryCurrency'>>);
  };
  const sym = symbolOf(currency);
  const symbolFirst = money(1, { currency }).startsWith(sym);

  const recentMerchants = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; category: string }[] = [];
    for (const t of transactions) {
      const isInc = t.category === 'Income';
      if ((mode === 'income') !== isInc || !t.merchant || t.merchant === 'Unknown') continue;
      const k = t.merchant.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name: t.merchant, category: t.category });
      if (out.length >= 6) break;
    }
    return out;
  }, [transactions, mode]);

  const value = parseAmount(amount);
  const valid = value > 0 && merchant.trim() && (mode === 'income' || category);

  const pickMerchant = (name: string, cat?: string) => {
    setMerchant(name);
    if (mode === 'expense') {
      const rule = findRule(name);
      const c = rule?.category || (cat && CATEGORY_META[cat] && cat !== 'Income' ? cat : '') || hintCategory(name) || '';
      if (c) setCategory(c);
    }
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const now = new Date();
    const [y, m, d] = date.split('-').map(Number);
    const when = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
    const row = await insert('transactions', {
      amount: value,
      merchant: merchant.trim(),
      category: mode === 'income' ? 'Income' : category,
      date: when.toISOString(),
      account_id: accountId ? Number(accountId) : null,
      currency,
    });
    setSaving(false);
    if (row) {
      onDone();
      celebrate({
        amount: money(value, { decimals: true, currency }),
        title: mode === 'income' ? `Received from ${merchant.trim()}` : `Paid to ${merchant.trim()}`,
        subtitle: mode === 'income' ? 'Income logged' : `${CATEGORY_META[category]?.short ?? category} · logged`,
        tone: mode,
      });
    }
  };

  return (
    <div className="form-stack">
      <Segmented
        id="add-mode"
        value={mode}
        onChange={m => { setMode(m); setCategory(''); }}
        options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
      />

      <label className="amount-input num" aria-label={`Amount in ${currency}`}>
        {symbolFirst && <span className="rupee">{sym}</span>}
        <input
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={amount}
          style={{ width: `${Math.max(1, amount.length || 1)}ch` }}
          onChange={e => {
            // Keep what was typed ("49,90", "1,200"); parseAmount decides which separator is the decimal.
            const v = e.target.value.replace(/[^\d.,]/g, '');
            if (v.length <= 14) setAmount(v);
          }}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
        />
        {!symbolFirst && <span className="rupee" style={{ marginLeft: 10, fontSize: '0.55em' }}>{sym}</span>}
      </label>
      <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: -8, flexWrap: 'wrap' }}>
        {QUICK_CURRENCIES.map(c => (
          <motion.button key={c} type="button" className="chip" aria-pressed={currency === c} whileTap={{ scale: 0.92 }}
            onClick={() => setCurrency(c)} style={{ padding: '5px 12px', fontSize: '0.75rem' }}>
            {currency === c && <motion.div layoutId="add-cur" className="chip-bg" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            <span>{c}</span>
          </motion.button>
        ))}
      </div>
      {value > 0 && currency !== displayCurrency() && (
        <div className="faint num" style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', marginTop: -6 }}>
          ≈ {money(amt({ amount: value, currency }))}
        </div>
      )}

      <Field label={mode === 'income' ? 'Received from' : 'Paid to'}>
        <input className="input" placeholder={mode === 'income' ? 'e.g. Stipend, Salary, Rahul' : 'e.g. ICA, SL, Espresso House'} value={merchant}
          onChange={e => setMerchant(e.target.value)} onBlur={() => merchant && pickMerchant(merchant)} />
      </Field>
      {recentMerchants.length > 0 && (
        <div className="scroller" style={{ marginTop: -6 }}>
          {recentMerchants.map(r => (
            <motion.button key={r.name} type="button" className="chip" whileTap={{ scale: 0.94 }} onClick={() => pickMerchant(r.name, r.category)}>
              <span>{r.name}</span>
            </motion.button>
          ))}
        </div>
      )}

      {mode === 'expense' && (
        <div className="field">
          <span className="field-label">Category</span>
          <CategoryGrid value={category} onChange={setCategory} />
        </div>
      )}

      <div className="form-grid">
        <Field label="Date">
          <input className="input" type="date" value={date} max={dayKey(new Date())} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Account">
          <select className="input" value={accountId} onChange={e => {
            setAccountId(e.target.value);
            const acc = accounts.find(a => String(a.id) === e.target.value);
            if (acc) setCurrency(acc.currency ?? 'INR');
          }}>
            <option value="">None</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>

      <motion.button
        type="button"
        className={`btn btn-block ${mode === 'income' ? 'btn-jade' : 'btn-primary'}`}
        disabled={!valid || saving}
        onClick={save}
        whileTap={{ scale: 0.97 }}
        
      >
        {saving ? 'Saving…' : value > 0 ? `${mode === 'income' ? 'Add income' : 'Save expense'} · ${money(value, { decimals: true, currency })}` : 'Enter an amount'}
      </motion.button>
    </div>
  );
}

export default function AddTransactionSheet({ open, mode, onClose }: { open: boolean; mode: 'expense' | 'income'; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="New transaction">
      <AddForm initialMode={mode} onDone={onClose} />
    </Sheet>
  );
}
