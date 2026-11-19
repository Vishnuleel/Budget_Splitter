import { useEffect, useId, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useSpring, useTransform } from 'motion/react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ── Animated number (springs to new values) ───────────────── */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const spring = useSpring(value, { stiffness: 90, damping: 22, mass: 0.8 });
  const text = useTransform(spring, v => format(v));
  useEffect(() => { spring.set(value); }, [spring, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/* ── Bottom sheet with drag-to-dismiss ─────────────────────── */
export function Sheet({ open, onClose, title, children, action }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; action?: ReactNode;
}) {
  const controls = useDragControls();
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="sheet-backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            key="sheet"
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? labelId : undefined}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.7 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose(); }}
          >
            <div onPointerDown={e => controls.start(e)} style={{ touchAction: 'none', cursor: 'grab' }}>
              <div className="sheet-grip" />
              {title && (
                <div className="sheet-head">
                  <h2 id={labelId}>{title}</h2>
                  <div className="row" style={{ gap: 8 }}>
                    {action}
                    <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Close">
                      <X size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ── Progress ring ─────────────────────────────────────────── */
export function Ring({ value, size = 96, stroke = 10, color = 'var(--jade)', track = 'var(--surface-2)', children }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: v || 0.0001 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

/* ── Animated progress bar ─────────────────────────────────── */
export function Bar({ value, color = 'var(--jade)', delay = 0 }: { value: number; color?: string; delay?: number }) {
  return (
    <div className="bar">
      <motion.div
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/* ── Icon tile ─────────────────────────────────────────────── */
export function Tile({ icon: Icon, color, size = 38, radius = 12 }: { icon: LucideIcon; color: string; size?: number; radius?: number }) {
  return (
    <div className="tile" style={{ width: size, height: size, borderRadius: radius, background: `${color}1f`, color }}>
      <Icon size={size * 0.46} strokeWidth={2.2} />
    </div>
  );
}

/* ── Segmented control with sliding pill ───────────────────── */
export function Segmented<T extends string>({ value, onChange, options, id }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; id: string;
}) {
  return (
    <div className="segmented" role="group">
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {value === o.value && (
            <motion.div layoutId={`seg-${id}`} className="seg-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Filter chip with shared highlight ─────────────────────── */
export function Chip({ active, onClick, children, group }: { active: boolean; onClick: () => void; children: ReactNode; group: string }) {
  return (
    <motion.button type="button" className="chip" aria-pressed={active} onClick={onClick} whileTap={{ scale: 0.94 }}>
      {active && <motion.div layoutId={`chip-${group}`} className="chip-bg" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
      <span>{children}</span>
    </motion.button>
  );
}

/* ── Switch ────────────────────────────────────────────────── */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <motion.span layout className="switch-knob" transition={{ type: 'spring', stiffness: 600, damping: 34 }} />
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function SectionHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

/* ── Stagger helpers ───────────────────────────────────────── */
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
export const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 28 } },
};

export function Press({ children, className, onClick, style, label }: {
  children: ReactNode; className?: string; onClick?: () => void; style?: CSSProperties; label?: string;
}) {
  return (
    <motion.button type="button" className={className} style={style} onClick={onClick} aria-label={label}
      whileTap={{ scale: 0.95 }} whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
      {children}
    </motion.button>
  );
}
