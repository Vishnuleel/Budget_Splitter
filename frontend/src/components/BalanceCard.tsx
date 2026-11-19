import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Eye, EyeOff, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { AnimatedNumber } from './ui/primitives';
import { money, displayCurrency, symbolOf } from '../lib/money';


/** Kolam-inspired dot-and-loop texture used on the night card. */
export function Kolam({ id }: { id: string }) {
  return (
    <svg className="hero-kolam" width="100%" height="100%" aria-hidden="true">
      <defs>
        <pattern id={id} width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="15" cy="15" r="1.6" fill="#fff" />
          <path d="M0 15 Q7.5 7.5 15 0 M15 30 Q22.5 22.5 30 15 M15 0 Q22.5 7.5 30 15 M0 15 Q7.5 22.5 15 30" fill="none" stroke="#fff" strokeWidth="0.8" />
        </pattern>
        <radialGradient id={`${id}-fade`} cx="85%" cy="10%" r="80%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <rect width="100%" height="100%" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} mask={`url(#${id}-mask)`} />
    </svg>
  );
}

export default function BalanceCard({ netWorth, spent, income, hidden, onToggleHidden, onOpenWealth }: {
  netWorth: number; spent: number; income: number; hidden: boolean;
  onToggleHidden: () => void; onOpenWealth: () => void;
}) {
  const sym = symbolOf(displayCurrency());
  const symbolFirst = money(1).startsWith(sym);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 200, damping: 20 });
  const glareX = useTransform(mx, [-0.5, 0.5], ['0%', '100%']);
  const glare = useTransform(glareX, x => `radial-gradient(circle at ${x} 0%, rgba(255,255,255,0.14), transparent 55%)`);

  return (
    <div style={{ perspective: 900 }}>
      <motion.section
        className="hero"
        aria-label="Net worth"
        style={{ rotateX: rx, rotateY: ry }}
        onPointerMove={e => {
          if (e.pointerType !== 'mouse') return;
          const r = e.currentTarget.getBoundingClientRect();
          mx.set((e.clientX - r.left) / r.width - 0.5);
          my.set((e.clientY - r.top) / r.height - 0.5);
        }}
        onPointerLeave={() => { mx.set(0); my.set(0); }}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
      >
        <div className="hero-blob a" />
        <div className="hero-blob b" />
        <div className="hero-blob c" />
        <Kolam id="kolam-hero" />
        <motion.div style={{ position: 'absolute', inset: 0, background: glare, pointerEvents: 'none' }} />

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="hero-label">Net worth</span>
          <motion.button
            type="button"
            onClick={onToggleHidden}
            whileTap={{ scale: 0.85 }}
            aria-label={hidden ? 'Show balances' : 'Hide balances'}
            style={{ color: 'var(--hero-ink-2)', display: 'flex', padding: 6, margin: -6 }}
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </motion.button>
        </div>

        <button type="button" onClick={onOpenWealth} style={{ display: 'block', textAlign: 'left', color: 'inherit' }} aria-label="Open wealth">
          <motion.div className="hero-amount num" animate={{ filter: hidden ? 'blur(10px)' : 'blur(0px)' }}>
            {symbolFirst && <span className="rupee">{sym}</span>}
            <AnimatedNumber value={netWorth} format={n => money(n).replace(sym, '').trim()} />
            {!symbolFirst && <span className="rupee" style={{ marginLeft: 10, fontSize: '0.6em' }}>{sym}</span>}
          </motion.div>
        </button>

        <div className="hero-foot">
          <div className="hero-pill">
            <div className="k"><ArrowUpRight size={13} color="var(--hero-neg)" /> Spent this month</div>
            <div className={`v num${hidden ? ' blurred' : ''}`}><AnimatedNumber value={spent} format={n => money(n)} /></div>
          </div>
          <div className="hero-pill">
            <div className="k"><ArrowDownLeft size={13} color="var(--hero-pos)" /> Income this month</div>
            <div className={`v num${hidden ? ' blurred' : ''}`}><AnimatedNumber value={income} format={n => money(n)} /></div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
