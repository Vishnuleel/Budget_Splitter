import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';

type Toast = { id: number; message: string; actionLabel?: string; onAction?: () => void; duration?: number };
type Celebration = { title: string; amount: string; subtitle?: string; tone?: 'expense' | 'income' };

type Ctx = {
  toast: (t: Omit<Toast, 'id'>) => void;
  celebrate: (c: Celebration) => void;
};

const FeedbackContext = createContext<Ctx | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback outside provider');
  return ctx;
}

export function haptic(pattern: number | number[] = 8) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [party, setParty] = useState<Celebration | null>(null);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts(ts => ts.filter(t => t.id !== id)), []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++idRef.current;
    setToasts(ts => [...ts.slice(-2), { ...t, id }]);
    window.setTimeout(() => dismiss(id), t.duration ?? 3800);
  }, [dismiss]);

  const celebrate = useCallback((c: Celebration) => {
    haptic([12, 40, 18]);
    setParty(c);
  }, []);

  useEffect(() => {
    if (!party) return;
    const t = window.setTimeout(() => setParty(null), 2100);
    return () => window.clearTimeout(t);
  }, [party]);

  const value = useMemo(() => ({ toast, celebrate }), [toast, celebrate]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="toast-stack" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              className="toast"
              layout
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <span className="grow">{t.message}</span>
              {t.actionLabel && (
                <button onClick={() => { t.onAction?.(); dismiss(t.id); }}>{t.actionLabel}</button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {party && <CelebrationOverlay key="party" c={party} onDone={() => setParty(null)} />}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
}

const BURST = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 110 + (i % 3) * 26;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, c: i % 2 ? '#f59e0b' : '#4ade80', s: 6 + (i % 3) * 3 };
});

function CelebrationOverlay({ c, onDone }: { c: Celebration; onDone: () => void }) {
  return (
    <motion.div
      className="celebrate"
      role="status"
      onClick={onDone}
      initial={{ clipPath: 'circle(0% at 50% 92%)' }}
      animate={{ clipPath: 'circle(150% at 50% 92%)' }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(245,158,11,0.5)' }}
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 1.4, delay: 0.35 + i * 0.22, ease: 'easeOut' }}
          />
        ))}
        {BURST.map((b, i) => (
          <motion.span
            key={`b${i}`}
            style={{ position: 'absolute', left: 60 - b.s / 2, top: 60 - b.s / 2, width: b.s, height: b.s, borderRadius: i % 3 ? '50%' : 3, background: b.c }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: b.x, y: b.y, opacity: [0, 1, 0], scale: 1, rotate: 160 }}
            transition={{ duration: 1.1, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
        <motion.div
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--brand)', display: 'grid', placeItems: 'center' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.25 }}
        >
          <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.5, ease: 'easeOut' }}
            />
          </svg>
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <div className="celebrate-amount num">{c.amount}</div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginTop: 6 }}>{c.title}</div>
        {c.subtitle && <div style={{ color: 'var(--hero-ink-2)', marginTop: 4, fontWeight: 600 }}>{c.subtitle}</div>}
      </motion.div>
      <span className="sr-only"><Check /> Saved</span>
    </motion.div>
  );
}
