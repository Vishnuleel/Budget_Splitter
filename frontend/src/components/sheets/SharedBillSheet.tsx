// One bill sent into friends' accounts. Friend: review their items, untick, accept, say "I've paid".
// Payer: approve or refuse changes (seeing who each change affects) and confirm payments.
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, Clock, HandCoins, MessageSquare, ArrowRight, CircleCheck } from 'lucide-react';
import { act, useShared } from '../../lib/sharedApi';
import { avatarColor } from '../../lib/splits';
import { initials } from '../../lib/format';
import { money } from '../../lib/money';
import { useSetting } from '../../lib/settings';
import { useFeedback } from '../ui/Feedback';
import { Sheet } from '../ui/primitives';
import { changePreview, computeShares, personKey, type Member, type SharedBillRow } from '../../../shared/sharedBill.js';

function Face({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: avatarColor(id), color: '#fff', flexShrink: 0 }}>
      {initials(name)}
    </span>
  );
}

const STATUS: Record<Member['status'], { label: string; cls: string }> = {
  pending: { label: 'Not answered yet', cls: 'neutral' },
  change_requested: { label: 'Asked for a change', cls: 'warn' },
  accepted: { label: 'Accepted', cls: 'good' },
  declined: { label: 'Declined', cls: 'bad' },
};

function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useFeedback();
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try { await fn(); if (done) toast({ message: done }); } catch (e) { toast({ message: (e as Error).message }); } finally { setBusy(null); }
  };
  return { busy, run };
}

function FriendView({ row, me, ownerName }: { row: SharedBillRow; me: string; ownerName: string }) {
  const key = personKey(me);
  const member = row.members.find(m => m.user_id === me)!;
  const fmt = (n: number) => money(n, { currency: row.bill.currency, decimals: true });
  const shares = computeShares(row.bill).per;
  const mineNow = shares[key]?.total ?? 0;
  const myItems = row.bill.items.filter(i => i.among.includes(key));
  const others = row.bill.items.filter(i => !i.among.includes(key));
  const [removed, setRemoved] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const { busy, run } = useBusy();
  const canEdit = ['pending', 'accepted'].includes(member.status) && member.paid === 'none';
  const after = useMemo(
    () => (removed.length ? changePreview(row.bill, key, removed).find(p => p.id === key)?.after ?? mineNow : mineNow),
    [removed, row.bill, key, mineNow],
  );
  const changed = member.status === 'accepted' && member.ack_total != null && Math.abs(member.ack_total - mineNow) >= 0.01;

  return (
    <div className="form-stack">
      <div className="hero" style={{ padding: 18 }}>
        <div className="hero-label">{ownerName} paid · {row.bill.store || row.bill.title}</div>
        <div className="hero-amount num">{fmt(removed.length ? after : mineNow)}</div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--hero-ink-2)', marginTop: 4 }}>
          {removed.length ? <>Was {fmt(mineNow)} · if {ownerName} agrees</> : `Your part of ${fmt(computeShares(row.bill).total)}`}
        </div>
      </div>

      {member.reply && member.status === 'pending' && (
        <div className="card card-tight row" style={{ gap: 10, background: 'var(--marigold-soft)' }}>
          <MessageSquare size={18} color="var(--marigold-ink)" />
          <div className="grow" style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--marigold-ink)' }}>
            {ownerName} kept you on it: “{member.reply}”
          </div>
        </div>
      )}
      {changed && (
        <div className="card card-tight row" style={{ gap: 10, background: 'var(--jade-soft)' }}>
          <div className="grow" style={{ fontSize: '0.84rem', fontWeight: 700 }}>
            Your part changed: {fmt(member.ack_total!)} <ArrowRight size={13} style={{ verticalAlign: -2 }} /> {fmt(mineNow)}
            <div className="faint" style={{ fontWeight: 600 }}>Someone else asked to be taken off an item and {ownerName} agreed.</div>
          </div>
          <button type="button" className="btn btn-sm btn-jade" disabled={!!busy} onClick={() => run('ack', () => act(row.id, 'ack'))}>OK</button>
        </div>
      )}

      <section className="card" style={{ padding: '6px 14px' }}>
        <div className="field-label" style={{ margin: '8px 0 4px' }}>{canEdit ? 'Your items: untick anything that isn’t yours' : 'Your items'}</div>
        {myItems.map(i => {
          const off = removed.includes(i.id);
          const amt = shares[key]?.items.find(x => x.id === i.id);
          return (
            <label key={i.id} className="row" style={{ gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)', cursor: canEdit ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={!off} disabled={!canEdit} onChange={() => setRemoved(r => (off ? r.filter(x => x !== i.id) : [...r, i.id]))}
                style={{ width: 20, height: 20, accentColor: 'var(--jade)' }} />
              <span className="grow ellipsis" style={{ fontWeight: 700, textDecoration: off ? 'line-through' : undefined, color: off ? 'var(--ink-3)' : undefined }}>{i.name}</span>
              <span className="faint num" style={{ fontSize: '0.78rem' }}>{i.among.length > 1 ? `÷${i.among.length}` : 'just you'}</span>
              <span className="num" style={{ fontWeight: 800, minWidth: 64, textAlign: 'right' }}>{amt ? fmt(amt.amount) : '–'}</span>
            </label>
          );
        })}
        {(shares[key]?.extras ?? 0) !== 0 && (
          <div className="row faint" style={{ justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: '0.84rem' }}>
            <span>Bags &amp; discounts</span><span className="num">{fmt(shares[key].extras)}</span>
          </div>
        )}
        {others.length > 0 && <div className="faint" style={{ fontSize: '0.78rem', fontWeight: 600, padding: '8px 0 10px', borderTop: '1px solid var(--line)' }}>Not on your bill: {others.map(i => i.name).join(', ')}</div>}
      </section>

      {member.status === 'change_requested' && (
        <div className="card card-tight row" style={{ gap: 10 }}>
          <Clock size={18} color="var(--ink-3)" />
          <div className="grow" style={{ fontSize: '0.84rem', fontWeight: 700 }}>Waiting for {ownerName} to approve taking you off {member.removed.map(id => row.bill.items.find(i => i.id === id)?.name).filter(Boolean).join(', ')}.</div>
        </div>
      )}

      {canEdit && removed.length > 0 && (
        <>
          <input className="input" placeholder={`Note for ${ownerName} (optional)`} value={note} onChange={e => setNote(e.target.value)} maxLength={140} />
          <motion.button type="button" className="btn btn-primary btn-block" disabled={!!busy} whileTap={{ scale: 0.97 }}
            onClick={() => run('change', () => act(row.id, 'request_change', { removed, note: note.trim() || null }), `Sent to ${ownerName} to approve`)}>
            Ask {ownerName} to take me off {removed.length} item{removed.length === 1 ? '' : 's'}
          </motion.button>
        </>
      )}

      {member.status === 'pending' && removed.length === 0 && (
        <div className="form-grid">
          <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => run('decline', () => act(row.id, 'decline'), 'Declined')}><X size={16} /> Decline</button>
          <motion.button type="button" className="btn btn-jade" disabled={!!busy} whileTap={{ scale: 0.97 }} onClick={() => run('accept', () => act(row.id, 'accept'), `Accepted · you owe ${ownerName} ${fmt(mineNow)}`)}>
            <Check size={16} /> Accept {fmt(mineNow)}
          </motion.button>
        </div>
      )}

      {member.status === 'accepted' && removed.length === 0 && (
        member.paid === 'none' ? (
          <motion.button type="button" className="btn btn-jade btn-block" disabled={!!busy} whileTap={{ scale: 0.97 }}
            onClick={() => run('paid', () => act(row.id, 'claim_paid'), `${ownerName} will confirm they got it`)}>
            <HandCoins size={16} /> I’ve paid {ownerName} {fmt(mineNow)}
          </motion.button>
        ) : member.paid === 'claimed' ? (
          <div className="card card-tight row" style={{ gap: 10 }}><Clock size={18} color="var(--ink-3)" /><div className="grow" style={{ fontWeight: 700, fontSize: '0.86rem' }}>You said you paid. Waiting for {ownerName} to confirm.</div></div>
        ) : (
          <div className="card card-tight row" style={{ gap: 10 }}><CircleCheck size={18} color="var(--income)" /><div className="grow" style={{ fontWeight: 800, color: 'var(--income)' }}>Settled. {ownerName} confirmed your payment.</div></div>
        )
      )}
      {member.status === 'declined' && <div className="faint" style={{ textAlign: 'center', fontWeight: 700 }}>You declined this bill.</div>}
    </div>
  );
}

function OwnerView({ row, names }: { row: SharedBillRow; names: Record<string, string> }) {
  const fmt = (n: number) => money(n, { currency: row.bill.currency, decimals: true });
  const shares = computeShares(row.bill).per;
  const [replies, setReplies] = useState<Record<string, string>>({});
  const { busy, run } = useBusy();
  const [, setSplits] = useSetting('splits');
  const nameOf = (uid: string) => names[uid] || row.bill.people.find(p => p.id === personKey(uid))?.name || 'Someone';
  const myKey = row.bill.payer;
  const owed = row.members.filter(m => m.status === 'accepted' && m.paid !== 'confirmed').reduce((a, m) => a + (shares[personKey(m.user_id)]?.total ?? 0), 0);

  // Keep the local copy (for name-only roommates' amounts) in step after an approved change.
  const syncLocal = (bill: SharedBillRow['bill']) => setSplits(s => ({
    ...s,
    entries: s.entries.map(e => (e.sharedId !== row.id ? e : {
      ...e,
      items: bill.items.map(i => ({ ...i, among: i.among.map(p => (p === myKey ? 'me' : p)), shares: i.shares ? Object.fromEntries(Object.entries(i.shares).map(([p, w]) => [p === myKey ? 'me' : p, w])) : undefined })),
    })),
  }));

  return (
    <div className="form-stack">
      <div className="hero" style={{ padding: 18 }}>
        <div className="hero-label">You paid · {row.bill.store || row.bill.title}</div>
        <div className="hero-amount num">{fmt(computeShares(row.bill).total)}</div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--hero-ink-2)', marginTop: 4 }}>Still owed to you: {fmt(owed)}</div>
      </div>

      {row.members.map(m => {
        const k = personKey(m.user_id);
        const name = nameOf(m.user_id);
        const st = STATUS[m.status];
        const preview = m.status === 'change_requested' ? changePreview(row.bill, k, m.removed) : [];
        return (
          <section key={m.user_id} className="card" style={{ padding: 14 }}>
            <div className="row" style={{ gap: 10 }}>
              <Face id={m.user_id} name={name} />
              <div className="grow">
                <div style={{ fontWeight: 800 }}>{name}</div>
                <span className={`badge ${m.paid === 'confirmed' ? 'good' : st.cls}`}>{m.paid === 'confirmed' ? 'Paid' : m.paid === 'claimed' ? 'Says they paid' : st.label}</span>
              </div>
              <div className="display num" style={{ fontSize: '1.05rem' }}>{fmt(shares[k]?.total ?? 0)}</div>
            </div>

            {m.status === 'change_requested' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
                  Says {m.removed.map(id => row.bill.items.find(i => i.id === id)?.name).filter(Boolean).join(', ')} {m.removed.length === 1 ? 'isn’t' : 'aren’t'} theirs.
                </div>
                {m.note && <div className="faint" style={{ fontSize: '0.82rem', fontWeight: 600, marginTop: 2 }}>“{m.note}”</div>}
                <div className="bill-breakdown" style={{ marginTop: 8 }}>
                  {preview.filter(p => Math.abs(p.delta) >= 0.01).map(p => (
                    <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <span>{p.id === myKey ? 'You' : p.name}</span>
                      <span className="num">{fmt(p.before)} → {fmt(p.after)} <b style={{ color: p.delta > 0 ? 'var(--rose-ink)' : 'var(--income)' }}>{p.delta > 0 ? '+' : ''}{fmt(p.delta)}</b></span>
                    </div>
                  ))}
                </div>
                <input className="input" style={{ marginTop: 10 }} placeholder="Reply if you keep them on it (optional)" maxLength={140}
                  value={replies[m.user_id] ?? ''} onChange={e => setReplies(r => ({ ...r, [m.user_id]: e.target.value }))} />
                <div className="form-grid" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-ghost" disabled={!!busy}
                    onClick={() => run('keep', () => act(row.id, 'keep', { member: m.user_id, reply: replies[m.user_id]?.trim() || undefined }), `${name} stays on it`)}>Keep {name} on it</button>
                  <motion.button type="button" className="btn btn-jade" disabled={!!busy} whileTap={{ scale: 0.97 }}
                    onClick={() => run('approve', async () => { const r = await act(row.id, 'approve_change', { member: m.user_id }); syncLocal(r.bill); }, 'Approved · everyone’s part is updated')}>
                    <Check size={16} /> Approve
                  </motion.button>
                </div>
              </div>
            )}

            {m.status === 'accepted' && m.paid !== 'confirmed' && (
              <motion.button type="button" className={`btn btn-sm ${m.paid === 'claimed' ? 'btn-jade' : 'btn-ghost'} btn-block`} style={{ marginTop: 12 }} disabled={!!busy} whileTap={{ scale: 0.97 }}
                onClick={() => run('confirm', () => act(row.id, 'confirm_paid', { member: m.user_id }), `Settled with ${name}`)}>
                <HandCoins size={15} /> {m.paid === 'claimed' ? `Confirm you got ${fmt(shares[k]?.total ?? 0)}` : 'Mark as received (cash)'}
              </motion.button>
            )}
            {m.status === 'declined' && m.note && <div className="faint" style={{ marginTop: 8, fontSize: '0.82rem' }}>“{m.note}”</div>}
          </section>
        );
      })}
    </div>
  );
}

export default function SharedBillSheet({ open, id, onClose }: { open: boolean; id?: string; onClose: () => void }) {
  const s = useShared();
  const row = s.bills.find(b => b.id === id);
  const me = s.me?.id;
  const ownerName = row ? s.names[row.owner] || 'Your friend' : '';
  return (
    <Sheet open={open} onClose={onClose} title={row ? (row.owner === me ? 'Your shared bill' : `Bill from ${ownerName}`) : 'Shared bill'}>
      {!row || !me ? (
        <div className="faint" style={{ textAlign: 'center', padding: 24, fontWeight: 700 }}>{s.ready ? 'This bill isn’t available any more.' : 'Loading…'}</div>
      ) : row.owner === me ? (
        <OwnerView row={row} names={s.names} />
      ) : (
        <FriendView key={row.id + row.version} row={row} me={me} ownerName={ownerName} />
      )}
    </Sheet>
  );
}
