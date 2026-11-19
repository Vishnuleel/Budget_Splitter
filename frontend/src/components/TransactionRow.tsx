import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { Trash2 } from 'lucide-react';
import type { Transaction } from '../lib/types';
import { categoryMeta, CATEGORY_META, needsReview, suggestionOf } from '../lib/categories';
import { timeLabel } from '../lib/format';
import { Tile } from './ui/primitives';
import { haptic } from './ui/Feedback';
import { money, amt, displayCurrency } from '../lib/money';

export default function TransactionRow({ tx, fresh, hidden, onOpen, onDelete, onAccept, swipeable = true }: {
  tx: Transaction;
  fresh?: boolean;
  hidden?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
  onAccept?: (category: string) => void;
  swipeable?: boolean;
}) {
  const meta = categoryMeta(tx.category);
  const income = tx.category === 'Income';
  const review = needsReview(tx);
  const suggestion = suggestionOf(tx.category);
  const x = useMotionValue(0);
  const bgOpacity = useTransform(x, [-120, -40, 0], [1, 0.6, 0]);
  const iconScale = useTransform(x, [-120, -60], [1.2, 0.8]);

  const label = review ? (suggestion ? CATEGORY_META[suggestion]?.short ?? suggestion : 'Uncategorised') : meta.short;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <div className="tx-wrap">
        {swipeable && onDelete && (
          <motion.div className="tx-delete-bg" style={{ opacity: bgOpacity }} aria-hidden="true">
            <motion.span style={{ scale: iconScale, display: 'flex', alignItems: 'center', gap: 6 }}><Trash2 size={18} /> Delete</motion.span>
          </motion.div>
        )}
        <motion.button
          type="button"
          className="tx-row"
          onTap={onOpen}
          style={{ x }}
          drag={swipeable && onDelete ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0.6, right: 0.05 }}
          dragSnapToOrigin={false}
          onDragEnd={(_, info) => {
            if (info.offset.x < -110 || info.velocity.x < -700) {
              haptic(18);
              animate(x, -500, { duration: 0.22 }).then(() => onDelete?.());
            } else {
              animate(x, 0, { type: 'spring', stiffness: 500, damping: 35 });
            }
          }}
          whileTap={{ scale: 0.985 }}
        >
          {fresh && (
            <motion.span
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, background: 'var(--marigold-soft)', borderRadius: 18 }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 2.6, ease: 'easeOut' }}
            />
          )}
          <Tile icon={meta.icon} color={meta.color} />
          <div className="grow">
            <div className="tx-merchant ellipsis">{tx.merchant}</div>
            <div className="tx-meta ellipsis">{timeLabel(new Date(tx.date))} · {label}</div>
          </div>
          <div className={`num${hidden ? ' blurred' : ''}`} style={{ textAlign: 'right' }}>
            <div className={`tx-amount${income ? ' in' : ''}`}>
              {income ? '+' : '−'}{money(Math.abs(tx.amount), { decimals: true, currency: tx.currency ?? 'INR' })}
            </div>
            {(tx.currency ?? 'INR') !== displayCurrency() && (
              <div className="tx-meta" style={{ marginTop: 1 }}>≈ {money(amt(tx))}</div>
            )}
          </div>
        </motion.button>
      </div>
      {review && onAccept && (
        <motion.div className="review-pill" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <span className="grow">{suggestion ? <>Looks like <b>{CATEGORY_META[suggestion]?.short ?? suggestion}</b></> : 'Needs a category'}</span>
          {suggestion && <button className="yes" onClick={() => onAccept(suggestion)}>Yes</button>}
          <button className="no" onClick={onOpen}>{suggestion ? 'Change' : 'Pick'}</button>
        </motion.div>
      )}
    </motion.div>
  );
}
