import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Split, Trash2, ChevronDown } from 'lucide-react';
import type { Transaction } from '../../lib/types';
import { categoryMeta, CATEGORY_META, suggestionOf } from '../../lib/categories';
import { dayLabel, timeLabel } from '../../lib/format';
import { setSetting } from '../../lib/settings';
import { useData } from '../../store/DataContext';
import { useUI } from '../../store/UIContext';
import { useFeedback } from '../ui/Feedback';
import { Field, Segmented, Sheet, Switch, Tile } from '../ui/primitives';
import { CategoryGrid } from './AddTransactionSheet';
import { money } from '../../lib/money';

export function saveMerchantRule(merchant: string, category: string) {
  if (!merchant || merchant === 'Unknown' || category === 'Income') return;
  const key = merchant.trim();
  setSetting('merchant_rules', rules => [
    ...rules.filter(r => r.merchant.toLowerCase() !== key.toLowerCase()),
    { merchant: key, category },
  ]);
}

function TxDetail({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { update, removeTransactionWithUndo, accounts } = useData();
  const { openSheet } = useUI();
  const { toast } = useFeedback();
  const suggested = suggestionOf(tx.category);
  const isInc = tx.category === 'Income';
  const [kind, setKind] = useState<'expense' | 'income'>(isInc ? 'income' : 'expense');
  const [merchant, setMerchant] = useState(tx.merchant);
  const [amount, setAmount] = useState(String(tx.amount));
  const [category, setCategory] = useState(isInc ? '' : suggested ?? (tx.category === 'Uncategorized' ? '' : tx.category));
  const [remember, setRemember] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  const meta = categoryMeta(kind === 'income' ? 'Income' : category || tx.category);
  const account = accounts.find(a => a.id === tx.account_id);

  const finalCategory = kind === 'income' ? 'Income' : category;
  const dirty = merchant !== tx.merchant || Number(amount) !== tx.amount || finalCategory !== tx.category;
  const valid = merchant.trim() && Number(amount) > 0 && finalCategory;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const ok = await update('transactions', tx.id, { merchant: merchant.trim(), amount: Number(amount), category: finalCategory });
    setSaving(false);
    if (!ok) return;
    if (remember && kind === 'expense' && finalCategory !== tx.category) {
      saveMerchantRule(merchant, finalCategory);
      toast({ message: `Saved. Future ${merchant.trim()} payments → ${CATEGORY_META[finalCategory]?.short ?? finalCategory}` });
    }
    onClose();
  };

  return (
    <div className="form-stack">
      <motion.div className="row" style={{ flexDirection: 'column', textAlign: 'center', gap: 8, padding: '4px 0 8px' }}
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <motion.div key={meta.color} initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
          <Tile icon={meta.icon} color={meta.color} size={54} radius={18} />
        </motion.div>
        <div className="display num" style={{ fontSize: '1.8rem', color: kind === 'income' ? 'var(--income)' : 'var(--ink)' }}>
          {kind === 'income' ? '+' : '−'}{money(Number(amount) || 0, { decimals: true, currency: tx.currency ?? 'INR' })}
        </div>
        <div className="faint" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
          {dayLabel(new Date(tx.date))} · {timeLabel(new Date(tx.date))}{account ? ` · ${account.name}` : ''}
        </div>
      </motion.div>

      <Segmented id="tx-kind" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Money out' }, { value: 'income', label: 'Money in' }]} />

      <div className="form-grid">
        <Field label={kind === 'income' ? 'From' : 'Paid to'}>
          <input className="input" value={merchant} onChange={e => setMerchant(e.target.value)} />
        </Field>
        <Field label={`Amount (${tx.currency ?? 'INR'})`}>
          <input className="input num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
        </Field>
      </div>

      <AnimatePresence initial={false}>
        {kind === 'expense' && (
          <motion.div key="cats" className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <span className="field-label">Category {suggested && category === suggested && <span className="badge warn" style={{ marginLeft: 6 }}>AI suggestion</span>}</span>
            <CategoryGrid value={category} onChange={setCategory} includeSavings />
            {merchant.trim() && merchant !== 'Unknown' && (
              <div className="row" style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--line)' }}>
                <span className="grow" style={{ fontSize: '0.85rem', fontWeight: 700 }}>Always use this for “{merchant.trim()}”</span>
                <Switch checked={remember} onChange={setRemember} label="Remember category for this merchant" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {tx.raw_text && (
        <div>
          <button type="button" className="link-btn row" style={{ gap: 4 }} onClick={() => setShowRaw(s => !s)} aria-expanded={showRaw}>
            Original message <motion.span animate={{ rotate: showRaw ? 180 : 0 }} style={{ display: 'flex' }}><ChevronDown size={16} /></motion.span>
          </button>
          <AnimatePresence>
            {showRaw && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden', fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--surface-2)', borderRadius: 14, padding: 12, marginTop: 6, fontFamily: 'ui-monospace, monospace' }}>
                {tx.raw_text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      <motion.button type="button" className="btn btn-primary btn-block" disabled={!valid || (!dirty) || saving} onClick={save} whileTap={{ scale: 0.97 }}>
        {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
      </motion.button>
      <div className="form-grid">
        <motion.button type="button" className="btn" whileTap={{ scale: 0.96 }}
          onClick={() => openSheet({ kind: 'bill', prefill: { store: tx.merchant, total: Number(tx.amount), currency: tx.currency ?? 'INR' } })}>
          <Split size={18} /> Split
        </motion.button>
        <motion.button type="button" className="btn btn-danger" whileTap={{ scale: 0.96 }} onClick={() => { onClose(); removeTransactionWithUndo(tx); }}>
          <Trash2 size={18} /> Delete
        </motion.button>
      </div>
    </div>
  );
}

export default function TxSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { transactions } = useData();
  const tx = id != null ? transactions.find(t => t.id === id) : undefined;
  return (
    <Sheet open={!!tx} onClose={onClose} title="Transaction">
      {tx && <TxDetail tx={tx} onClose={onClose} />}
    </Sheet>
  );
}
