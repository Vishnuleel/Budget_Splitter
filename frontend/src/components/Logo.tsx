import { motion } from 'motion/react';

/** The "split coin" mark: one coin, two halves drifting apart. */
export default function Logo({ size = 40, animate = false }: { size?: number; animate?: boolean }) {
  const t = { type: 'spring' as const, stiffness: 120, damping: 12, delay: 0.2 };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <motion.path
        d="M11.27 36.73A18 18 0 0 1 36.73 11.27Z"
        fill="var(--logo-ink)"
        initial={animate ? { x: 0, y: 0 } : false}
        animate={{ x: -1.8, y: -1.8 }}
        transition={t}
      />
      <motion.path
        d="M36.73 11.27A18 18 0 0 1 11.27 36.73Z"
        fill="var(--brand)"
        initial={animate ? { x: 0, y: 0 } : false}
        animate={{ x: 1.8, y: 1.8 }}
        transition={t}
      />
    </svg>
  );
}
