import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Settings2, Eye, EyeOff } from 'lucide-react';
import LockScreen from './components/LockScreen';
import TabBar from './components/TabBar';
import Logo from './components/Logo';
import { FeedbackProvider } from './components/ui/Feedback';
import AddTransactionSheet from './components/sheets/AddTransactionSheet';
import SmsSheet from './components/sheets/SmsSheet';
import TxSheet from './components/sheets/TxSheet';
import SplitsSheet from './components/sheets/SplitsSheet';
import { BudgetsSheet, SettingsSheet } from './components/sheets/SettingsSheets';
import PhoneSetupSheet from './components/sheets/PhoneSetupSheet';
import SharedBillSheet from './components/sheets/SharedBillSheet';
import BillSplitSheet from './components/sheets/BillSplitSheet';
import HomePage from './pages/HomePage';
import ActivityPage from './pages/ActivityPage';
// Charts are heavy; load the Insights tab on demand.
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
import WealthPage from './pages/WealthPage';
import { DataProvider, useData } from './store/DataContext';
import { UIContext, type ActivityFilter, type SheetState, type UICtx } from './store/UIContext';
import { applyTheme, getSetting, useSetting } from './lib/settings';
import { AuthProvider, useAuth } from './lib/auth';
import { checkAppLockPin } from './lib/secure';
import { isAdminPath, usePath } from './lib/router';
import { LoginScreen, SetPasswordScreen, Splash, StatusScreen } from './components/auth/AuthScreens';
// The admin portal is only for admins; keep it out of everyone else's download.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const ClaimPage = lazy(() => import('./pages/ClaimPage'));
import { needsReview } from './lib/categories';
import { greeting } from './lib/format';
import { loadRates, useRates } from './lib/money';
import type { TabType } from './lib/types';

const TAB_ORDER: TabType[] = ['home', 'activity', 'insights', 'wealth'];
const TITLES: Record<TabType, string> = { home: '', activity: 'Activity', insights: 'Insights', wealth: 'Wealth' };
const AUTO_LOCK_MS = 5 * 60_000;

function Shell({ onLock }: { onLock: () => void }) {
  const { transactions, loading, demo } = useData();
  // Subscribing here re-renders every page when the display currency or FX rates change.
  useSetting('displayCurrency');
  useRates();
  useEffect(() => { loadRates(); }, []);

  // Home-screen icon shortcuts (long-press the app icon): /?action=add or /?action=sms
  useEffect(() => {
    const url = new URL(location.href);
    const action = url.searchParams.get('action');
    if (action === 'add') setSheet({ kind: 'add', mode: 'expense' });
    if (action === 'sms') setSheet({ kind: 'sms' });
    if (action) {
      url.searchParams.delete('action');
      history.replaceState(null, '', url.toString());
    }
  }, []);
  const [tab, setTabState] = useState<TabType>('home');
  const [dir, setDir] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [hidden, setHidden] = useState(() => getSetting('hideBalances'));

  const setTab = useCallback((t: TabType) => {
    setTabState(prev => {
      setDir(TAB_ORDER.indexOf(t) > TAB_ORDER.indexOf(prev) ? 1 : -1);
      return t;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const ui = useMemo<UICtx>(() => ({
    tab, setTab, sheet,
    openSheet: s => setSheet(s),
    closeSheet: () => setSheet(null),
    activityFilter, setActivityFilter,
    lock: onLock,
  }), [tab, setTab, sheet, activityFilter, onLock]);

  const close = useCallback(() => setSheet(null), []);
  const reviewCount = transactions.filter(needsReview).length;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <UIContext.Provider value={ui}>
      <div className="app">
        <header className="topbar">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
              className="row" style={{ gap: 12 }}>
              {tab === 'home' && <Logo size={38} />}
              <div>
                {tab === 'home' && <div className="topbar-sub">{today}{demo && <span className="badge warn" style={{ marginLeft: 8 }}>Demo</span>}</div>}
                <h1 className="topbar-title">{tab === 'home' ? greeting() : TITLES[tab]}</h1>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="topbar-actions">
            <motion.button type="button" className="icon-btn" whileTap={{ scale: 0.88 }} onClick={() => setHidden(h => !h)} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} aria-pressed={hidden}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={String(hidden)} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} style={{ display: 'flex' }}>
                  {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <motion.button type="button" className="icon-btn" whileTap={{ scale: 0.88, rotate: 45 }} onClick={() => setSheet({ kind: 'settings' })} aria-label="Settings">
              <Settings2 size={19} />
            </motion.button>
          </div>
        </header>

        <main>
          {loading ? (
            <SkeletonHome />
          ) : (
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={tab}
                custom={dir}
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: d * 36 }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({ opacity: 0, x: d * -36 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              >
                {tab === 'home' && <HomePage hidden={hidden} />}
                {tab === 'activity' && <ActivityPage hidden={hidden} />}
                {tab === 'insights' && <Suspense fallback={<SkeletonHome />}><InsightsPage hidden={hidden} /></Suspense>}
                {tab === 'wealth' && <WealthPage hidden={hidden} />}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <TabBar tab={tab} setTab={setTab} onAdd={() => setSheet({ kind: 'add', mode: 'expense' })} reviewCount={reviewCount} />

      <AddTransactionSheet open={sheet?.kind === 'add'} mode={sheet?.kind === 'add' ? sheet.mode : 'expense'} onClose={close} />
      <SmsSheet open={sheet?.kind === 'sms'} onClose={close} />
      <TxSheet id={sheet?.kind === 'tx' ? sheet.id : null} onClose={close} />
      <SplitsSheet open={sheet?.kind === 'splits'} prefill={sheet?.kind === 'splits' ? sheet.prefill : undefined} onClose={close} />
      <SettingsSheet open={sheet?.kind === 'settings'} onClose={close} />
      <BudgetsSheet open={sheet?.kind === 'budgets'} onClose={close} />
      <PhoneSetupSheet open={sheet?.kind === 'phone'} onClose={close} />
      <SharedBillSheet open={sheet?.kind === 'shared'} id={sheet?.kind === 'shared' ? sheet.id : undefined} onClose={close} />
      <BillSplitSheet open={sheet?.kind === 'bill'} prefill={sheet?.kind === 'bill' ? sheet.prefill : undefined} onClose={close} />
    </UIContext.Provider>
  );
}

function SkeletonHome() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      {[220, 150, 120, 260].map((h, i) => (
        <motion.div key={i} style={{ height: h, borderRadius: 24, background: i === 0 ? 'var(--hero)' : 'var(--surface-2)' }}
          animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }} />
      ))}
    </div>
  );
}

/** Optional per-device PIN lock (set in Settings). Wraps both the app and the admin portal. */
function AppLock({ userId, name, children }: { userId: string; name?: string | null; children: (lock: () => void) => ReactNode }) {
  const { signOut } = useAuth();
  const [lockHash] = useSetting('appLockHash');
  const key = `bs:unlocked:${userId}`;
  // Unlocked if this tab already unlocked, or if there was no PIN when the app opened
  // (so turning a PIN on in Settings doesn't lock you out mid-session).
  const [unlocked, setUnlocked] = useState(() => {
    if (!getSetting('appLockHash')) return true;
    try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
  });
  const hiddenAt = useRef<number | null>(null);

  const unlock = useCallback(() => {
    try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
    setUnlocked(true);
  }, [key]);
  const lock = useCallback(() => {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    setUnlocked(false);
  }, [key]);

  // Auto-lock after the app has been in the background for a while.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > AUTO_LOCK_MS) lock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [lock]);

  const locked = !!lockHash && !unlocked;
  return (
    <AnimatePresence mode="wait">
      {locked ? (
        <LockScreen key="lock" name={name} onUnlock={unlock} onSignOut={signOut} verify={pin => checkAppLockPin(userId, pin)} />
      ) : (
        // Opacity only: a transform here would trap the fixed tab bar inside this box.
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          {children(lock)}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Root() {
  const auth = useAuth();
  const path = usePath();

  // Public "pick your items" link — no sign-in needed.
  const claim = path.match(/^\/b\/([A-Za-z0-9_-]{20,80})\/?$/);
  if (claim) return <Suspense fallback={<Splash />}><ClaimPage token={claim[1]} /></Suspense>;

  switch (auth.status) {
    case 'loading': return <Splash />;
    case 'signed-out': return <LoginScreen />;
    case 'set-password': return <SetPasswordScreen />;
    case 'disabled':
    case 'needs-setup':
    case 'not-configured': return <StatusScreen kind={auth.status} />;
  }

  const userId = auth.user?.id ?? auth.profile!.id;
  const name = auth.profile?.display_name;
  return (
    <AppLock key={userId} userId={userId} name={name}>
      {lock => isAdminPath(path) ? (
        <Suspense fallback={<Splash />}><AdminApp /></Suspense>
      ) : (
        <DataProvider key={userId} userId={userId}>
          <Shell onLock={lock} />
        </DataProvider>
      )}
    </AppLock>
  );
}

export default function App() {
  const [theme] = useSetting('theme');
  useEffect(() => { applyTheme(theme); }, [theme]);

  return (
    <MotionConfig reducedMotion="user">
      <FeedbackProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </FeedbackProvider>
    </MotionConfig>
  );
}
