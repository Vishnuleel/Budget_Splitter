import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ClipboardPaste, MessageSquareText } from 'lucide-react';
import { parseSms } from '../../lib/parser';
import { findRule } from '../../lib/settings';
import { categoryMeta } from '../../lib/categories';

import { useData } from '../../store/DataContext';
import { useFeedback } from '../ui/Feedback';
import { Sheet, Tile } from '../ui/primitives';
import { money, amt, displayCurrency } from '../../lib/money';

const KIND_LABEL = { card: 'Card payment', transfer: 'Bank transfer', fee: 'Bank fee', upi: 'UPI', other: 'Money out' } as const;

// Real-world shapes of Indian bank SMS for someone living in Sweden.
const SAMPLES = [
  'Txn of SEK 245.00 done using HDFC Bank Card x1234 at ICA SUPERMARKET ODENPLAN on 17-11-26. Not you? Call 18002586161',
  'Spent SEK 89.00 Card no. XX1234 17-11-26 08:12:40 IST ESPRESSO HOUSE Avl Lmt INR 98,765.43',
  'USD 11.99 spent using ICICI Bank Card XX1234 on 16-Nov-26 on SPOTIFY. Avl Limit: INR 1,23,456.00',
  'Rs 8.57 debited from your HDFC Bank Card x1234 towards Cross Currency Markup fee on 17-11-26',
  'INR 75,000.00 debited from A/c XX1234 on 12-11-26 for Outward Remittance SWIFT Ref SE48291',
];
const SAMPLE = SAMPLES[0];

function SmsForm({ onDone }: { onDone: () => void }) {
  const { insert } = useData();
  const { celebrate, toast } = useFeedback();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => (text.trim() ? parseSms(text) : null), [text]);
  const rule = parsed && !parsed.isIncome ? findRule(parsed.merchant) : undefined;
  const category = parsed?.isIncome ? 'Income' : rule?.category ?? parsed?.category ?? 'Uncategorized';
  const meta = categoryMeta(category);

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText(clip);
    } catch {
      toast({ message: 'Clipboard blocked — long-press the box to paste instead.' });
    }
  };

  const save = async () => {
    if (!parsed || parsed.amount <= 0) return;
    setSaving(true);
    const row = await insert('transactions', {
      amount: parsed.amount,
      merchant: parsed.merchant,
      currency: parsed.currency,
      category,
      raw_text: text.trim(),
      date: new Date().toISOString(),
    });
    setSaving(false);
    if (row) {
      onDone();
      celebrate({
        amount: money(parsed.amount, { decimals: true, currency: parsed.currency }),
        title: parsed.isIncome ? `Received from ${parsed.merchant}` : `Paid to ${parsed.merchant}`,
        subtitle: category === 'Uncategorized' ? 'Saved · pick a category in Activity' : `${meta.short} · saved`,
      });
    }
  };

  return (
    <div className="form-stack">
      <p className="muted" style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.5 }}>
        Paste an SMS from your Indian bank: card payments abroad (SEK, EUR…), transfers and forex fees. We’ll read the amount, currency and merchant. Nothing leaves your device until you save.
      </p>
      <div style={{ position: 'relative' }}>
        <textarea className="input" placeholder={SAMPLE} value={text} onChange={e => setText(e.target.value)} aria-label="Bank SMS text" />
      </div>
      <div className="row">
        <motion.button type="button" className="btn btn-ghost btn-sm" whileTap={{ scale: 0.95 }} onClick={paste}>
          <ClipboardPaste size={16} /> Paste from clipboard
        </motion.button>
        <motion.button type="button" className="btn btn-ghost btn-sm" whileTap={{ scale: 0.95 }} onClick={() => setText(SAMPLES[(Math.max(0, SAMPLES.indexOf(text)) + (SAMPLES.includes(text) ? 1 : 0)) % SAMPLES.length])}>
          <MessageSquareText size={16} /> Try a sample
        </motion.button>
      </div>

      <AnimatePresence mode="popLayout">
        {parsed && (
          <motion.div
            key="preview"
            className="card"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            style={{ background: 'var(--surface)' }}
          >
            <div className="field-label" style={{ marginBottom: 10 }}>We found</div>
            <div className="row">
              <Tile icon={meta.icon} color={meta.color} size={42} />
              <div className="grow">
                <div className="tx-merchant ellipsis">{parsed.merchant}</div>
                <div className="tx-meta">{parsed.isIncome ? 'Money in' : KIND_LABEL[parsed.kind]} · {category === 'Uncategorized' ? 'No category yet' : meta.short}{rule ? ' (your rule)' : ''}</div>
              </div>
              <motion.div key={parsed.amount} initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className={`tx-amount num${parsed.isIncome ? ' in' : ''}`} style={{ fontSize: '1.05rem' }}>
                {parsed.amount > 0 ? money(parsed.amount, { decimals: true, currency: parsed.currency }) : '?'}
                {parsed.amount > 0 && parsed.currency !== displayCurrency() && <div className="tx-meta">≈ {money(amt({ amount: parsed.amount, currency: parsed.currency }))}</div>}
              </motion.div>
            </div>
            {parsed.amount <= 0 && <p className="badge warn" style={{ marginTop: 12 }}>No amount found. Check the text has a currency like SEK, INR, Rs or ₹.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button type="button" className="btn btn-primary btn-block" disabled={!parsed || parsed.amount <= 0 || saving} onClick={save} whileTap={{ scale: 0.97 }}>
        {saving ? 'Saving…' : 'Save transaction'}
      </motion.button>
    </div>
  );
}

export default function SmsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Paste bank SMS">
      <SmsForm onDone={onClose} />
    </Sheet>
  );
}
