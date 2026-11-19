import { useCallback, useEffect, useState } from 'react';
import { motion, useAnimate } from 'motion/react';
import { Delete, LogOut } from 'lucide-react';
import Logo from './Logo';
import { haptic } from './ui/Feedback';
import { greeting } from '../lib/format';

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30_000;

// Optional per-device app lock. Each person sets their own PIN in Settings; only a hash is
// stored on the device. Real protection is the Supabase sign-in + Row Level Security.
export default function LockScreen({ onUnlock, verify, onSignOut, name }: {
  onUnlock: () => void;
  verify: (pin: string) => Promise<boolean>;
  onSignOut: () => void;
  name?: string | null;
}) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'error' | 'ok'>('idle');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [scope, animate] = useAnimate();

  const coolingDown = lockedUntil > now;

  useEffect(() => {
    if (!coolingDown) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [coolingDown]);

  const press = useCallback((digit: string) => {
    if (status === 'ok' || status === 'checking' || coolingDown) return;
    if (pin.length >= PIN_LENGTH) return;
    haptic(6);
    const next = pin + digit;
    setPin(next);
    setStatus('idle');
    if (next.length < PIN_LENGTH) return;

    setStatus('checking');
    verify(next).then(ok => {
      if (ok) {
        setStatus('ok');
        haptic([10, 30, 10]);
        window.setTimeout(onUnlock, 520);
        return;
      }
      setStatus('error');
      haptic([40, 40, 40]);
      animate(scope.current, { x: [0, -14, 12, -9, 6, -3, 0] }, { duration: 0.45 });
      const n = attempts + 1;
      if (n >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + COOLDOWN_MS);
        setNow(Date.now());
        setAttempts(0);
      } else {
        setAttempts(n);
      }
      window.setTimeout(() => setPin(''), 450);
    });
  }, [pin, attempts, status, coolingDown, onUnlock, verify, animate, scope]);

  const backspace = useCallback(() => {
    if (status === 'ok') return;
    setStatus('idle');
    setPin(p => p.slice(0, -1));
  }, [status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') backspace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, backspace]);

  const message = coolingDown
      ? `Too many tries. Wait ${Math.ceil((lockedUntil - now) / 1000)}s`
      : status === 'error'
        ? 'That PIN didn’t match'
        : 'Enter your PIN to continue';

  return (
    <motion.div
      className="lock"
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
      transition={{ duration: 0.4 }}
    >
      <div className="hero-blob a" style={{ top: -60, right: -80 }} />
      <div className="hero-blob b" style={{ bottom: 120, left: -100 }} />

      <motion.div
        style={{ textAlign: 'center' }}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          style={{ display: 'inline-grid', placeItems: 'center', width: 76, height: 76, borderRadius: 26, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          animate={status === 'ok' ? { scale: [1, 1.15, 0.9], rotate: [0, 0, 90] } : { scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Logo size={46} animate />
        </motion.div>
        <h1 style={{ fontSize: '1.5rem', marginTop: 16 }}>{greeting()}{name ? `, ${name}` : ''}</h1>
        <p style={{ color: 'var(--hero-ink-2)', marginTop: 6, fontWeight: 600 }} aria-live="polite">{message}</p>

        <div className="pin-dots" ref={scope} aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => {
            const filled = i < pin.length;
            const color = status === 'error' ? '#f87171' : status === 'ok' ? '#4ade80' : '#f59e0b';
            return (
              <motion.span
                key={i}
                className="pin-dot"
                animate={{
                  scale: filled ? [1, 1.35, 1] : 1,
                  backgroundColor: filled ? color : 'rgba(255,255,255,0)',
                  borderColor: filled ? color : 'rgba(255,255,255,0.35)',
                }}
                transition={{ duration: 0.25, delay: status === 'ok' ? i * 0.06 : 0 }}
              />
            );
          })}
        </div>
      </motion.div>

      <motion.div
        className="keypad"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0.15 } } }}
      >
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => {
          if (k === '') return <span key={i} />;
          const isDel = k === 'del';
          return (
            <motion.button
              key={k}
              type="button"
              className={`key${isDel ? ' ghost' : ''}`}
              aria-label={isDel ? 'Delete digit' : k}
              onClick={() => (isDel ? backspace() : press(k))}
              variants={{ hidden: { opacity: 0, y: 18, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1 } }}
              whileTap={{ scale: 0.86, backgroundColor: 'rgba(245,158,11,0.25)' }}
              disabled={coolingDown}
            >
              {isDel ? <Delete size={26} /> : k}
            </motion.button>
          );
        })}
      </motion.div>

      <button type="button" className="auth-link" onClick={onSignOut} style={{ marginTop: 18 }}>
        <LogOut size={14} /> Forgot PIN? Sign out
      </button>
    </motion.div>
  );
}
