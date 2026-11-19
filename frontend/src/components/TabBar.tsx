import { motion } from 'motion/react';
import { Home, ReceiptText, ChartPie, Landmark, Plus, type LucideIcon } from 'lucide-react';
import type { TabType } from '../lib/types';
import { haptic } from './ui/Feedback';

const LEFT: { id: TabType; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'activity', label: 'Activity', icon: ReceiptText },
];
const RIGHT: { id: TabType; label: string; icon: LucideIcon }[] = [
  { id: 'insights', label: 'Insights', icon: ChartPie },
  { id: 'wealth', label: 'Wealth', icon: Landmark },
];

export default function TabBar({ tab, setTab, onAdd, reviewCount }: {
  tab: TabType; setTab: (t: TabType) => void; onAdd: () => void; reviewCount: number;
}) {
  const renderTab = ({ id, label, icon: Icon }: (typeof LEFT)[number]) => {
    const active = tab === id;
    return (
      <motion.button
        key={id}
        type="button"
        className="tab"
        aria-current={active ? 'page' : undefined}
        onClick={() => { haptic(4); setTab(id); }}
        whileTap={{ scale: 0.9 }}
      >
        {active && <motion.div layoutId="tab-bg" className="tab-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
        <motion.span animate={{ y: active ? -1 : 0, scale: active ? 1.08 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
          <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
        </motion.span>
        <span>{label}</span>
        {id === 'activity' && reviewCount > 0 && (
          <motion.span className="tab-dot" initial={{ scale: 0 }} animate={{ scale: 1 }} aria-label={`${reviewCount} to review`} />
        )}
      </motion.button>
    );
  };

  return (
    <nav className="tabbar-wrap" aria-label="Main">
      <motion.div
        className="tabbar"
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.15 }}
      >
        {LEFT.map(renderTab)}
        <motion.button
          type="button"
          className="fab"
          aria-label="Add transaction"
          onClick={() => { haptic(10); onAdd(); }}
          whileHover={{ rotate: 90 }}
          whileTap={{ scale: 0.88, rotate: 90 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
        >
          <Plus size={24} strokeWidth={2.5} />
        </motion.button>
        {RIGHT.map(renderTab)}
      </motion.div>
    </nav>
  );
}
