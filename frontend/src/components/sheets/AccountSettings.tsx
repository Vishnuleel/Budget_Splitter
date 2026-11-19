import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LogOut, ShieldCheck, Lock, ChevronRight } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { navigate } from '../../lib/router';
import { setAppLockPin } from '../../lib/secure';
import { useSetting } from '../../lib/settings';
import { avatarColor } from '../../lib/splits';
import { initials } from '../../lib/format';
import { useFeedback } from '../ui/Feedback';

/** "You" card at the top of Settings: who's signed in, admin portal link, sign out. */
export function AccountCard({ onNavigate }: { onNavigate: () => void }) {
  const { profile, user, isAdmin, signOut, demo } = useAuth();
  const name = profile?.display_name || user?.email || 'You';
  const email = profile?.email || user?.email || '';
  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row">
        <div className="avatar" style={{ width: 44, height: 44, background: avatarColor(profile?.id || 'me'), fontSize: '0.95rem' }}>{initials(name)}</div>
        <div className="grow">
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontWeight: 800 }} className="ellipsis">{name}</span>
            {isAdmin && <span className="badge warn">Admin</span>}
          </div>
          <div className="faint ellipsis" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{email}{demo ? ' · demo' : ''}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        {isAdmin && (
          <motion.button type="button" className="btn btn-sm btn-primary grow" whileTap={{ scale: 0.96 }} onClick={() => { onNavigate(); navigate('/admin'); }}>
            <ShieldCheck size={15} /> Admin portal
          </motion.button>
        )}
        {!demo && (
          <motion.button type="button" className="btn btn-sm btn-ghost grow" whileTap={{ scale: 0.96 }} onClick={signOut}>
            <LogOut size={15} /> Sign out
          </motion.button>
        )}
      </div>
    </section>
  );
}

/** Optional per-device PIN. Stored as a hash on this device only. */
export function AppLockRow({ onLockNow }: { onLockNow: () => void }) {
  const { user, profile } = useAuth();
  const uid = user?.id ?? profile?.id ?? 'demo';
  const [hash] = useSetting('appLockHash');
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const { toast } = useFeedback();

  const save = async () => {
    if (!/^\d{4}$/.test(pin)) return setErr('Use exactly 4 digits.');
    if (pin !== pin2) return setErr('The two PINs don’t match.');
    await setAppLockPin(uid, pin);
    try { sessionStorage.setItem(`bs:unlocked:${uid}`, '1'); } catch { /* ignore */ }
    setOpen(false); setPin(''); setPin2(''); setErr(null);
    toast({ message: 'App lock on for this device' });
  };

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  return (
    <div className="list-row" style={{ flexWrap: 'wrap' }}>
      <div className="tile" style={{ width: 40, height: 40, background: 'var(--surface-2)', color: 'var(--ink)' }}><Lock size={18} /></div>
      <div className="grow">
        <div style={{ fontWeight: 800 }}>App lock {hash ? 'is on' : ''}</div>
        <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{hash ? '4-digit PIN on this device' : 'Ask for a PIN when the app opens'}</div>
      </div>
      {hash ? (
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onLockNow}>Lock now</button>
          <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--rose)' }}
            onClick={async () => { await setAppLockPin(uid, null); toast({ message: 'App lock removed' }); }}>
            Remove
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? 'Cancel' : 'Set PIN'} {!open && <ChevronRight size={14} />}
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && !hash && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ width: '100%', overflow: 'hidden' }}>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <input className="input num" type="password" inputMode="numeric" autoComplete="new-password" placeholder="New PIN" aria-label="New 4-digit PIN" value={pin} onChange={e => setPin(digits(e.target.value))} />
              <input className="input num" type="password" inputMode="numeric" autoComplete="new-password" placeholder="Repeat PIN" aria-label="Repeat PIN" value={pin2} onChange={e => setPin2(digits(e.target.value))} />
            </div>
            {err && <p className="badge bad" style={{ marginTop: 8 }}>{err}</p>}
            <button type="button" className="btn btn-sm btn-primary btn-block" style={{ marginTop: 10 }} onClick={save}>Turn on app lock</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
