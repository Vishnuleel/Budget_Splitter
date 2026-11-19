// Friends with their own account: requests by email, the "needs you" inbox, and bills sent between you.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Check, ChevronRight, Mail, UserCheck, X, Clock } from 'lucide-react';
import { requestFriend, respondFriend, sharedEnabled, useShared } from '../../lib/sharedApi';
import { useUI } from '../../store/UIContext';
import { avatarColor } from '../../lib/splits';
import { initials } from '../../lib/format';
import { money } from '../../lib/money';
import { useFeedback } from '../ui/Feedback';
import { computeShares, personKey } from '../../../shared/sharedBill.js';

function Face({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: avatarColor(id), color: '#fff', flexShrink: 0 }}>{initials(name)}</span>;
}

export default function FriendsPanel() {
  const s = useShared();
  const { openSheet } = useUI();
  const { toast } = useFeedback();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  if (!sharedEnabled()) return null;
  const me = s.me?.id;
  const nameOf = (uid: string) => s.names[uid] || s.friends.find(f => f.id === uid)?.name || 'Someone';

  const add = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try { toast({ message: await requestFriend(email.trim()) }); setEmail(''); } catch (e) { toast({ message: (e as Error).message }); } finally { setBusy(false); }
  };

  const incoming = s.friends.filter(f => f.status === 'pending' && f.direction === 'in');
  const outgoing = s.friends.filter(f => f.status === 'pending' && f.direction === 'out');
  const connected = s.friends.filter(f => f.status === 'accepted');

  const todoText = (t: (typeof s.todo)[number]) => {
    const b = t.bill.bill;
    const where = b.store || b.title;
    const fmt = (n: number) => money(n, { currency: b.currency, decimals: true });
    const part = (uid: string) => computeShares(b).per[personKey(uid)]?.total ?? 0;
    switch (t.kind) {
      case 'review': return { title: `${nameOf(t.bill.owner)} sent you a bill`, sub: `${where} · your part ${fmt(part(me!))}` };
      case 'approve': return { title: `${nameOf(t.member.user_id)} asked to change ${where}`, sub: `${t.member.removed.length} item${t.member.removed.length === 1 ? '' : 's'} · approve or keep them on it` };
      case 'confirm': return { title: `${nameOf(t.member.user_id)} says they paid you`, sub: `${where} · ${fmt(part(t.member.user_id))} · confirm when you see it` };
      case 'changed': return { title: `Your part of ${where} changed`, sub: `${fmt(t.from)} → ${fmt(t.to)}` };
    }
  };

  const billLine = (b: (typeof s.bills)[number]) => {
    const mine = b.owner === me;
    const fmt = (n: number) => money(n, { currency: b.bill.currency, decimals: true });
    const shares = computeShares(b.bill).per;
    if (mine) {
      const open = b.members.filter(m => m.status === 'accepted' && m.paid !== 'confirmed');
      const waiting = b.members.filter(m => m.status === 'pending' || m.status === 'change_requested').length;
      const due = open.reduce((a, m) => a + (shares[personKey(m.user_id)]?.total ?? 0), 0);
      return { who: 'You paid', state: waiting ? `${waiting} not answered` : due > 0 ? `${fmt(due)} owed to you` : 'all settled', done: !waiting && due === 0 };
    }
    const m = b.members.find(x => x.user_id === me)!;
    const part = fmt(shares[personKey(me!)]?.total ?? 0);
    const state = m.paid === 'confirmed' ? 'settled' : m.paid === 'claimed' ? 'waiting for them to confirm' : m.status === 'accepted' ? `you owe ${part}` : m.status === 'declined' ? 'declined' : m.status === 'change_requested' ? 'change asked' : `review · ${part}`;
    return { who: `${nameOf(b.owner)} paid`, state, done: m.paid === 'confirmed' || m.status === 'declined' };
  };

  return (
    <div className="form-stack" style={{ gap: 12 }}>
      <AnimatePresence initial={false}>
        {s.todo.length > 0 && (
          <motion.section key="todo" className="card" style={{ padding: '6px 14px', background: 'var(--jade-soft)' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="field-label row" style={{ gap: 6, margin: '8px 0 2px' }}><Bell size={14} /> Needs you</div>
            {s.todo.map(t => {
              const x = todoText(t);
              return (
                <button key={`${t.kind}-${t.bill.id}-${t.member.user_id}`} type="button" className="row" style={{ width: '100%', gap: 10, padding: '10px 0', textAlign: 'left', borderTop: '1px solid var(--line)' }}
                  onClick={() => openSheet({ kind: 'shared', id: t.bill.id })}>
                  <Face id={t.kind === 'review' || t.kind === 'changed' ? t.bill.owner : t.member.user_id} name={nameOf(t.kind === 'review' || t.kind === 'changed' ? t.bill.owner : t.member.user_id)} size={32} />
                  <span className="grow">
                    <span style={{ display: 'block', fontWeight: 800, fontSize: '0.88rem' }}>{x.title}</span>
                    <span className="faint" style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600 }}>{x.sub}</span>
                  </span>
                  <ChevronRight size={18} className="faint" />
                </button>
              );
            })}
          </motion.section>
        )}
      </AnimatePresence>

      <div>
        <div className="field-label" style={{ marginBottom: 8 }}>Friends with the app</div>
        <div className="row">
          <input className="input" type="email" inputMode="email" autoComplete="off" placeholder="Their email, to connect" value={email}
            onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void add(); }} />
          <motion.button type="button" className="icon-btn" style={{ flexShrink: 0, width: 48, height: 48 }} whileTap={{ scale: 0.9 }} disabled={busy} onClick={add} aria-label="Send friend request">
            <Mail size={20} />
          </motion.button>
        </div>
        <p className="faint" style={{ fontSize: '0.76rem', fontWeight: 600, marginTop: 6 }}>Connected friends get bills straight in their app and accept them there.</p>

        {incoming.map(f => (
          <div key={f.requestId} className="list-row">
            <Face id={f.id} name={f.name} />
            <div className="grow"><div style={{ fontWeight: 800 }}>{f.name}</div><div className="faint" style={{ fontSize: '0.78rem', fontWeight: 700 }}>wants to connect</div></div>
            <button type="button" className="btn btn-sm btn-ghost" aria-label={`Decline ${f.name}`} onClick={() => respondFriend(f.requestId, false).catch(e => toast({ message: e.message }))}><X size={14} /></button>
            <button type="button" className="btn btn-sm btn-jade" onClick={() => respondFriend(f.requestId, true).then(() => toast({ message: `Connected with ${f.name}` })).catch(e => toast({ message: e.message }))}><Check size={14} /> Accept</button>
          </div>
        ))}
        {connected.map(f => {
          const b = s.balances.get(personKey(f.id)) ?? 0;
          return (
            <div key={f.requestId} className="list-row">
              <Face id={f.id} name={f.name} />
              <div className="grow">
                <div style={{ fontWeight: 800 }} className="row"><span>{f.name}</span><UserCheck size={14} color="var(--jade)" aria-label="connected" /></div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: b > 0.5 ? 'var(--income)' : b < -0.5 ? 'var(--rose)' : 'var(--ink-3)' }}>
                  {b > 0.5 ? `owes you ${money(b)}` : b < -0.5 ? `you owe ${money(-b)}` : 'settled up'}
                </div>
              </div>
            </div>
          );
        })}
        {outgoing.map(f => (
          <div key={f.requestId} className="list-row" style={{ opacity: 0.7 }}>
            <Face id={f.id} name={f.name} />
            <div className="grow"><div style={{ fontWeight: 800 }}>{f.name}</div><div className="faint row" style={{ fontSize: '0.78rem', fontWeight: 700, gap: 4 }}><Clock size={12} /> request sent</div></div>
          </div>
        ))}
      </div>

      {s.bills.length > 0 && (
        <div>
          <div className="field-label" style={{ marginBottom: 4 }}>Shared bills</div>
          {s.bills.slice(0, 20).map(b => {
            const x = billLine(b);
            return (
              <button key={b.id} type="button" className="list-row" style={{ width: '100%', textAlign: 'left', opacity: x.done ? 0.55 : 1 }} onClick={() => openSheet({ kind: 'shared', id: b.id })}>
                <Face id={b.owner} name={nameOf(b.owner)} size={34} />
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 800 }} className="ellipsis">{b.bill.store || b.bill.title}</span>
                  <span className="faint" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600 }}>{x.who} · {x.state}</span>
                </span>
                <span className="num" style={{ fontWeight: 800 }}>{money(computeShares(b.bill).total, { currency: b.bill.currency })}</span>
                <ChevronRight size={16} className="faint" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
