import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { UserPlus, Check, Trash2, HandCoins, ReceiptText } from 'lucide-react';
import { useUI } from '../../store/UIContext';
import SharePicks from './SharePicks';
import FriendsPanel from './FriendsPanel';
import { useShared } from '../../lib/sharedApi';
import { useSetting } from '../../lib/settings';
import { avatarColor, balances, settleWith, uid } from '../../lib/splits';
import { initials } from '../../lib/format';
import { useFeedback } from '../ui/Feedback';
import { AnimatedNumber, Field, Sheet } from '../ui/primitives';
import { money, displayCurrency } from '../../lib/money';

function Avatar({ id, name, size = 40 }: { id: string; name: string; size?: number }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: id === 'me' ? 'var(--ink)' : avatarColor(id), color: id === 'me' ? 'var(--surface)' : '#fff', fontSize: size * 0.36 }}>
      {id === 'me' ? 'You' : initials(name)}
    </div>
  );
}

function PickChip({ active, onClick, id, name }: { active: boolean; onClick: () => void; id: string; name: string }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onClick} aria-pressed={active}
      className="chip" style={{ paddingLeft: 6, background: active ? 'var(--jade-soft)' : 'var(--surface)', borderColor: active ? 'var(--jade)' : 'var(--line)', color: 'var(--ink)' }}>
      <span><Avatar id={id} name={name} size={24} /> {id === 'me' ? 'You' : name}{active && <Check size={14} color="var(--jade)" />}</span>
    </motion.button>
  );
}

function SplitsBody({ prefill }: { prefill?: { title: string; amount: number } }) {
  const [splits, setSplits] = useSetting('splits');
  const { celebrate, toast } = useFeedback();
  const { openSheet } = useUI();
  const { people, entries } = splits;
  const [newName, setNewName] = useState('');
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [amount, setAmount] = useState(prefill ? String(prefill.amount) : '');
  const [paidBy, setPaidBy] = useState('me');
  const [among, setAmong] = useState<string[]>(['me']);
  const [formOpen, setFormOpen] = useState(!!prefill);

  const shared = useShared();
  const bal = useMemo(() => balances(people, entries), [people, entries]);
  // Totals include bills accepted in friends' accounts.
  const all = [...bal.values(), ...shared.balances.values()];
  const owed = all.filter(v => v > 0).reduce((a, b) => a + b, 0);
  const owe = -all.filter(v => v < 0).reduce((a, b) => a + b, 0);
  const nameOf = (id: string) => (id === 'me' ? 'You' : people.find(p => p.id === id)?.name ?? 'Someone');

  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    const id = uid();
    setSplits(s => ({ ...s, people: [...s.people, { id, name }] }));
    setAmong(a => [...a, id]);
    setNewName('');
  };

  const value = parseFloat(amount) || 0;
  const share = among.length ? value / among.length : 0;
  const validSplit = title.trim() && value > 0 && among.length >= 1 && among.some(a => a !== paidBy);

  const addSplit = () => {
    if (!validSplit) return;
    setSplits(s => ({
      ...s,
      entries: [{ id: uid(), title: title.trim(), amount: value, currency: displayCurrency(), date: new Date().toISOString(), paidBy, among, settled: [] }, ...s.entries],
    }));
    toast({ message: `Split ${money(value)} · ${money(share)} each` });
    setTitle(''); setAmount(''); setFormOpen(false);
  };

  const settle = (id: string) => {
    const owedAmount = Math.abs(bal.get(id) ?? 0);
    setSplits(s => ({ ...s, entries: settleWith(id, s.entries) }));
    celebrate({ amount: money(owedAmount), title: `Settled up with ${nameOf(id)}`, subtitle: 'All square now' });
  };

  const toggleAmong = (id: string) => setAmong(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));

  return (
    <div className="form-stack">
      <div className="hero" style={{ padding: 18, borderRadius: 24 }}>
        <div className="hero-blob a" style={{ width: 160, height: 160 }} />
        <div className="hero-foot" style={{ marginTop: 0 }}>
          <div className="hero-pill">
            <div className="k">You are owed</div>
            <div className="v num" style={{ color: 'var(--hero-pos)' }}><AnimatedNumber value={owed} format={n => money(n)} /></div>
          </div>
          <div className="hero-pill">
            <div className="k">You owe</div>
            <div className="v num" style={{ color: 'var(--hero-neg)' }}><AnimatedNumber value={owe} format={n => money(n)} /></div>
          </div>
        </div>
      </div>

      <FriendsPanel />

      <div>
        <div className="field-label" style={{ marginBottom: 8 }}>People without the app</div>
        <div className="row">
          <input className="input" placeholder="Add a friend’s name" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} />
          <motion.button type="button" className="icon-btn" style={{ flexShrink: 0, width: 48, height: 48 }} whileTap={{ scale: 0.9 }} onClick={addPerson} aria-label="Add friend">
            <UserPlus size={20} />
          </motion.button>
        </div>
        <AnimatePresence initial={false}>
          {people.map(p => {
            const b = bal.get(p.id) ?? 0;
            return (
              <motion.div key={p.id} layout className="list-row" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}>
                <Avatar id={p.id} name={p.name} />
                <div className="grow">
                  <div style={{ fontWeight: 800 }}>{p.name}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: b > 0.5 ? 'var(--income)' : b < -0.5 ? 'var(--rose)' : 'var(--ink-3)' }}>
                    {b > 0.5 ? `owes you ${money(b)}` : b < -0.5 ? `you owe ${money(-b)}` : 'settled up'}
                  </div>
                </div>
                {Math.abs(b) > 0.5 ? (
                  <motion.button type="button" className="btn btn-sm btn-jade" whileTap={{ scale: 0.93 }} onClick={() => settle(p.id)}>
                    <HandCoins size={15} /> Settle
                  </motion.button>
                ) : (
                  <button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove ${p.name}`}
                    onClick={() => setSplits(s => ({ people: s.people.filter(x => x.id !== p.id), entries: s.entries.map(e => ({ ...e, among: e.among.filter(a => a !== p.id) })).filter(e => e.paidBy !== p.id) }))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {formOpen ? (
          <motion.div key="form" className="card form-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <div className="form-grid">
              <Field label="What for">
                <input className="input" placeholder="Dinner, cab…" value={title} onChange={e => setTitle(e.target.value)} />
              </Field>
              <Field label={`Total (${displayCurrency()})`}>
                <input className="input num" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
              </Field>
            </div>
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>Paid by</div>
              <div className="scroller" style={{ flexWrap: 'nowrap' }}>
                {[{ id: 'me', name: 'You' }, ...people].map(p => (
                  <PickChip key={p.id} id={p.id} name={p.name} active={paidBy === p.id} onClick={() => setPaidBy(p.id)} />
                ))}
              </div>
            </div>
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>Split equally between</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[{ id: 'me', name: 'You' }, ...people].map(p => (
                  <PickChip key={p.id} id={p.id} name={p.name} active={among.includes(p.id)} onClick={() => toggleAmong(p.id)} />
                ))}
              </div>
              {people.length === 0 && <p className="faint" style={{ fontSize: '0.82rem', marginTop: 8, fontWeight: 600 }}>Add a friend above to split with them.</p>}
            </div>
            {value > 0 && among.length > 0 && (
              <motion.div layout className="badge neutral" style={{ alignSelf: 'flex-start', fontSize: '0.8rem', padding: '6px 10px' }}>
                {money(share, { decimals: true })} per person
              </motion.div>
            )}
            <div className="form-grid">
              <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
              <motion.button type="button" className="btn btn-primary" disabled={!validSplit} whileTap={{ scale: 0.96 }} onClick={addSplit}>Add split</motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="open" className="form-stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.button type="button" className="btn btn-primary btn-block" whileTap={{ scale: 0.97 }} onClick={() => openSheet({ kind: 'bill' })}>
              <ReceiptText size={16} /> Split a receipt item by item
            </motion.button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setFormOpen(true)}>Quick equal split</button>
          </motion.div>
        )}
      </AnimatePresence>

      {entries.length > 0 && (
        <div>
          <div className="field-label" style={{ marginBottom: 4 }}>History</div>
          {entries.slice(0, 20).map(e => {
            const done = e.among.filter(a => a !== e.paidBy).every(a => e.settled.includes(a));
            return (
              <div key={e.id} className="list-row" style={{ opacity: done ? 0.55 : 1, flexWrap: 'wrap' }}>
                <Avatar id={e.paidBy} name={nameOf(e.paidBy)} size={34} />
                <div className="grow">
                  <div style={{ fontWeight: 800 }} className="ellipsis">{e.title}</div>
                  <div className="faint" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                    {nameOf(e.paidBy)} paid · {e.items?.length ? `${e.items.length} items, itemised` : `split ${e.among.length} ways`}{done ? ' · settled' : ''}
                  </div>
                </div>
                <div className="num" style={{ fontWeight: 800 }}>{money(e.amount, { currency: e.currency ?? 'INR' })}</div>
                <button type="button" aria-label="Delete split" style={{ color: 'var(--ink-3)', padding: 6 }}
                  onClick={() => setSplits(s => ({ ...s, entries: s.entries.filter(x => x.id !== e.id) }))}>
                  <Trash2 size={15} />
                </button>
                {e.shareId && !done && <SharePicks entry={e} nameOf={nameOf} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SplitsSheet({ open, prefill, onClose }: { open: boolean; prefill?: { title: string; amount: number }; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Split bills">
      <SplitsBody prefill={prefill} />
    </Sheet>
  );
}
