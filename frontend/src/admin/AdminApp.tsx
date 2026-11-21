import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, LogOut, Search, UserPlus, Users, ShieldCheck, Smartphone, PauseCircle, RefreshCw, Lock, X } from 'lucide-react';
import Logo from '../components/Logo';
import { Chip } from '../components/ui/primitives';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { adminCall, type AdminUser } from '../lib/adminApi';
import { AddPersonSheet, Avatar, ManagePersonSheet } from './PersonSheets';

type Filter = 'all' | 'admins' | 'active' | 'paused' | 'invited' | 'no-phone';

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function status(u: AdminUser): { label: string; tone: 'good' | 'bad' | 'warn' | 'neutral' } {
  if (u.disabled) return { label: 'Paused', tone: 'bad' };
  if (u.invitePending) return { label: 'Invited', tone: 'neutral' };
  if (u.mustChangePassword && !u.lastSignInAt) return { label: 'Not signed in yet', tone: 'neutral' };
  return { label: 'Active', tone: 'good' };
}

function NotAdmin() {
  const { signOut } = useAuth();
  return (
    <div className="auth">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-logo" style={{ color: 'var(--marigold)' }}><Lock size={26} /></div>
        <h1 style={{ fontSize: '1.4rem', marginTop: 14 }}>Admins only</h1>
        <p style={{ color: 'var(--hero-ink-2)', marginTop: 8, fontWeight: 600, lineHeight: 1.5, fontSize: '0.9rem' }}>
          This page manages everyone’s accounts. Your account isn’t an admin.
        </p>
        <div className="auth-links" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-block btn-marigold" onClick={() => navigate('/')}>Back to my app</button>
          <button type="button" className="auth-link" onClick={signOut}><LogOut size={14} /> Sign out</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const { isAdmin, profile, user, signOut, demo } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminCall<{ me: string; users: AdminUser[] }>('list');
      setUsers(r.users);
      setMeId(r.me);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  useEffect(() => { document.title = 'Admin · Splitkvitto'; return () => { document.title = 'Splitkvitto'; }; }, []);

  const upsert = (u: AdminUser) => setUsers(list => (list.some(x => x.id === u.id) ? list.map(x => (x.id === u.id ? u : x)) : [...list, u]));

  const stats = useMemo(() => ({
    people: users.length,
    admins: users.filter(u => u.role === 'admin' && !u.disabled).length,
    phones: users.filter(u => u.smsLinkedAt).length,
    paused: users.filter(u => u.disabled).length,
  }), [users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(u => {
      if (q && !`${u.displayName} ${u.email}`.toLowerCase().includes(q)) return false;
      switch (filter) {
        case 'admins': return u.role === 'admin';
        case 'active': return !u.disabled && !u.invitePending;
        case 'paused': return u.disabled;
        case 'invited': return u.invitePending || (u.mustChangePassword && !u.lastSignInAt);
        case 'no-phone': return !u.smsLinkedAt;
        default: return true;
      }
    });
  }, [users, query, filter]);

  if (!isAdmin) return <NotAdmin />;

  const manageUser = users.find(u => u.id === managing) ?? null;
  const myName = profile?.display_name || user?.email || 'You';

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: `All · ${users.length}` },
    { id: 'admins', label: 'Admins' },
    { id: 'active', label: 'Active' },
    { id: 'invited', label: 'Not signed in yet' },
    { id: 'paused', label: 'Paused' },
    { id: 'no-phone', label: 'No phone linked' },
  ];

  const statCards = [
    { k: 'People', v: stats.people, icon: Users, color: '#2f6fd6' },
    { k: 'Admins', v: stats.admins, icon: ShieldCheck, color: '#d4900f' },
    { k: 'Phones linked', v: stats.phones, icon: Smartphone, color: '#0e7c66' },
    { k: 'Paused', v: stats.paused, icon: PauseCircle, color: '#c8402f' },
  ];

  return (
    <div className="admin">
      <header className="admin-top">
        <div className="row" style={{ gap: 10 }}>
          <Logo size={30} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.1 }}>Splitkvitto</div>
            <div className="faint" style={{ fontSize: '0.72rem', fontWeight: 700 }}>Admin portal{demo ? ' · demo' : ''}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <motion.button type="button" className="btn btn-sm btn-ghost" whileTap={{ scale: 0.95 }} onClick={() => navigate('/')}>
            <ArrowLeft size={14} /> My app
          </motion.button>
          {!demo && (
            <motion.button type="button" className="icon-btn" whileTap={{ scale: 0.9 }} onClick={signOut} aria-label={`Sign out ${myName}`} title="Sign out">
              <LogOut size={16} />
            </motion.button>
          )}
        </div>
      </header>

      <main className="admin-main">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 style={{ fontSize: '1.6rem' }}>People</h1>
          <p className="muted" style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: 4, maxWidth: 620, lineHeight: 1.5 }}>
            Add friends, reset passwords, pause or remove accounts. You see activity counts here, never anyone’s transactions or amounts.
          </p>
        </motion.div>

        <div className="admin-stats">
          {statCards.map((s, i) => (
            <motion.div key={s.k} className="stat row" style={{ gap: 10 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
              <span className="tile" style={{ width: 36, height: 36, borderRadius: 11, background: `${s.color}1f`, color: s.color }}><s.icon size={17} /></span>
              <div>
                <div className="v num" style={{ marginTop: 0 }}>{loading ? '–' : s.v}</div>
                <div className="k">{s.k}</div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="admin-toolbar">
          <label className="search grow" style={{ minWidth: 200 }}>
            <Search size={17} className="faint" />
            <span className="sr-only">Search people</span>
            <input placeholder="Search by name or email" value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button type="button" className="faint" style={{ display: 'flex' }} onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
          </label>
          <motion.button type="button" className="icon-btn" style={{ width: 42, height: 42, borderRadius: 14 }} whileTap={{ scale: 0.9, rotate: 180 }} onClick={load} aria-label="Refresh list">
            <RefreshCw size={16} />
          </motion.button>
          <motion.button type="button" className="btn btn-primary" whileTap={{ scale: 0.96 }} onClick={() => setAdding(true)}>
            <UserPlus size={16} /> Add person
          </motion.button>
        </div>

        <div className="scroller" style={{ marginTop: -6 }}>
          {chips.map(c => <Chip key={c.id} group="admin-filter" active={filter === c.id} onClick={() => setFilter(c.id)}>{c.label}</Chip>)}
        </div>

        {error ? (
          <div className="empty" role="alert">
            <div style={{ fontWeight: 800, color: 'var(--rose)', marginBottom: 6 }}>Couldn’t load accounts</div>
            {error}
            <div style={{ marginTop: 12 }}><button type="button" className="btn btn-sm btn-ghost" onClick={load}>Try again</button></div>
          </div>
        ) : (
          <div className="admin-list" role="table" aria-label="People">
            <div className="admin-head" role="row">
              <span role="columnheader">Person</span>
              <span role="columnheader">Role</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Phone</span>
              <span role="columnheader">Activity</span>
              <span role="columnheader" className="sr-only">Actions</span>
            </div>
            {loading && users.length === 0 ? (
              [0, 1, 2].map(i => (
                <motion.div key={i} className="admin-row" animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}>
                  <div className="c-person row"><div className="avatar" style={{ background: 'var(--surface-3)' }} /><div style={{ height: 12, width: 140, borderRadius: 6, background: 'var(--surface-3)' }} /></div>
                </motion.div>
              ))
            ) : visible.length === 0 ? (
              <div className="empty" style={{ margin: 14 }}>{query ? `Nobody matches “${query}”.` : 'Nobody in this view.'}</div>
            ) : (
              <AnimatePresence initial={false}>
                {visible.map((u, i) => {
                  const st = status(u);
                  const isYou = u.id === meId;
                  return (
                    <motion.div
                      key={u.id}
                      layout
                      role="row"
                      className={`admin-row${u.disabled ? ' is-paused' : ''}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.03 } }}
                      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                    >
                      <div className="c-person row" role="cell" style={{ gap: 10, minWidth: 0 }}>
                        <Avatar user={u} />
                        <div style={{ minWidth: 0 }}>
                          <div className="ellipsis" style={{ fontWeight: 800 }}>
                            {u.displayName}{isYou && <span className="badge neutral" style={{ marginLeft: 6 }}>You</span>}
                          </div>
                          <div className="faint ellipsis" style={{ fontSize: '0.76rem', fontWeight: 600 }}>{u.email}</div>
                        </div>
                      </div>
                      <div className="c-meta" role="cell"><span className={`badge ${u.role === 'admin' ? 'warn' : 'neutral'}`}>{u.role === 'admin' ? 'Admin' : 'Member'}</span></div>
                      <div className="c-meta" role="cell"><span className={`badge ${st.tone}`}>{st.label}</span></div>
                      <div className="c-meta faint" role="cell" style={{ fontWeight: 700, fontSize: '0.78rem' }}>
                        {u.smsLinkedAt ? <span style={{ color: 'var(--jade)' }}>● Linked{u.lastSmsAt ? ` · SMS ${timeAgo(u.lastSmsAt)}` : ''}</span> : 'Not linked'}
                      </div>
                      <div className="c-meta faint" role="cell" style={{ fontWeight: 700, fontSize: '0.78rem' }}>
                        <span className="num">{u.txCount}</span> txns{u.lastSignInAt ? ` · seen ${timeAgo(u.lastSignInAt)}` : ''}
                      </div>
                      <div className="c-action" role="cell">
                        <motion.button type="button" className="btn btn-sm btn-ghost" whileTap={{ scale: 0.94 }} onClick={() => setManaging(u.id)} aria-label={`Manage ${u.displayName}`}>
                          Manage
                        </motion.button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        )}

        <p className="faint" style={{ fontSize: '0.76rem', fontWeight: 600, lineHeight: 1.6 }}>
          Paused accounts can’t sign in or log SMS, and their data is kept. Deleting removes the sign-in and everything they stored.
          {demo && ' This is a demo: changes reset when you reload.'}
        </p>
      </main>

      <AddPersonSheet open={adding} onClose={() => setAdding(false)} onCreated={upsert} />
      <ManagePersonSheet
        user={manageUser}
        isYou={manageUser?.id === meId}
        onClose={() => setManaging(null)}
        onChanged={upsert}
        onDeleted={id => setUsers(list => list.filter(u => u.id !== id))}
      />
    </div>
  );
}
