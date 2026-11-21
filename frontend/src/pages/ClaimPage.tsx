import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ShoppingBasket, AlertTriangle, Pencil } from 'lucide-react';
import Logo from '../components/Logo';
import { viewShare, submitClaim } from '../lib/billShareApi';
import { applyClaims, type ShareBill } from '../../shared/billShare.js';
import { splitBill } from '../../shared/billSplit.js';
import { money } from '../lib/money';
import { avatarColor } from '../lib/splits';
import { initials } from '../lib/format';

/** Public page a roommate opens from the link: pick your name, untick what isn't yours, send. */
export default function ClaimPage({ token }: { token: string }) {
  const [bill, setBill] = useState<ShareBill | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = 'Pick your items · Splitkvitto';
    viewShare(token).then(r => { setBill(r.bill); setAnswered(r.answered); }).catch(e => setError((e as Error).message));
  }, [token]);

  const choose = (id: string) => {
    setWho(id);
    // Start from what the sender assumed; they untick what isn't theirs.
    setPicked(new Set(bill!.items.filter(i => i.among.includes(id)).map(i => i.id)));
    setDone(false);
  };

  const estimate = useMemo(() => {
    if (!bill || !who) return null;
    const items = applyClaims(bill.items, { [who]: { itemIds: [...picked] } });
    return splitBill(items, bill.extras, bill.people.map(p => p.id), bill.payer).per[who]?.total ?? 0;
  }, [bill, who, picked]);

  const send = async () => {
    if (!who) return;
    setBusy(true);
    try {
      await submitClaim(token, who, [...picked]);
      setAnswered(a => [...new Set([...a, who])]);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => money(n, { currency: bill?.currency ?? 'SEK', decimals: true });
  const payerName = bill?.people.find(p => p.id === bill.payer)?.name;
  const nameOf = (id: string) => bill?.people.find(p => p.id === id)?.name ?? '';

  return (
    <div className="claim">
      <header className="row" style={{ gap: 10, padding: 'calc(16px + env(safe-area-inset-top)) 0 8px' }}>
        <Logo size={30} />
        <span style={{ fontWeight: 800 }}>Splitkvitto</span>
      </header>

      {error ? (
        <div className="card" style={{ textAlign: 'center', padding: 24, marginTop: 20 }}>
          <AlertTriangle size={28} color="var(--marigold-ink)" />
          <h1 style={{ fontSize: '1.2rem', marginTop: 10 }}>Can’t open this bill</h1>
          <p className="muted" style={{ fontWeight: 600, marginTop: 6 }}>{error}</p>
        </div>
      ) : !bill ? (
        <motion.div className="card" style={{ height: 160, marginTop: 20 }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
      ) : (
        <>
          <motion.section className="hero" style={{ marginTop: 8 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="hero-blob a" />
            <div className="row" style={{ gap: 12 }}>
              <span className="tile" style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.1)', color: 'var(--brand)' }}><ShoppingBasket size={22} /></span>
              <div>
                <div className="hero-label">{payerName === 'You' ? 'Shared bill' : `${payerName} paid`}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.35rem' }}>{bill.title}</div>
              </div>
            </div>
            <p style={{ color: 'var(--hero-ink-2)', fontWeight: 600, fontSize: '0.86rem', marginTop: 12, lineHeight: 1.45 }}>
              Tick only what you’ll use or eat. You won’t pay for anything you untick.
            </p>
          </motion.section>

          <div className="field-label" style={{ margin: '18px 0 8px' }}>Who are you?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {bill.people.filter(p => p.id !== bill.payer).map(p => (
              <motion.button key={p.id} type="button" className="chip" aria-pressed={who === p.id} whileTap={{ scale: 0.93 }} onClick={() => choose(p.id)}
                style={{ paddingLeft: 5, background: who === p.id ? 'var(--jade-soft)' : 'var(--surface)', borderColor: who === p.id ? 'var(--jade)' : 'var(--line)', color: 'var(--ink)' }}>
                <span>
                  <span className="avatar" style={{ width: 24, height: 24, fontSize: 9, background: avatarColor(p.id) }}>{initials(p.name)}</span>
                  {p.name}{answered.includes(p.id) && <Check size={13} color="var(--jade)" />}
                </span>
              </motion.button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {who && !done && (
              <motion.div key={`pick-${who}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between', margin: '18px 0 8px' }}>
                  <span className="field-label">Your items, {nameOf(who)}</span>
                  <span className="row" style={{ gap: 10 }}>
                    <button type="button" className="link-btn" onClick={() => setPicked(new Set(bill.items.map(i => i.id)))}>All</button>
                    <button type="button" className="link-btn" onClick={() => setPicked(new Set())}>None</button>
                  </span>
                </div>
                <div className="tx-list" style={{ padding: 4 }}>
                  {bill.items.map(i => {
                    const on = picked.has(i.id);
                    return (
                      <motion.button key={i.id} type="button" className="claim-item" aria-pressed={on} whileTap={{ scale: 0.98 }}
                        onClick={() => setPicked(s => { const n = new Set(s); if (on) n.delete(i.id); else n.add(i.id); return n; })}>
                        <motion.span className="claim-box" animate={{ backgroundColor: on ? 'var(--jade)' : 'rgba(0,0,0,0)', borderColor: on ? 'var(--jade)' : 'var(--line-strong)' }}>
                          {on && <Check size={14} color="var(--on-primary)" strokeWidth={3} />}
                        </motion.span>
                        <span className="grow" style={{ textAlign: 'left', fontWeight: 700, textDecoration: on ? 'none' : 'line-through', color: on ? 'var(--ink)' : 'var(--ink-3)' }}>{i.name}</span>
                        <span className="num faint" style={{ fontWeight: 700 }}>{fmt(i.price)}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <div className="claim-bar">
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--hero-ink-2)' }}>Your share (estimate)</div>
                    <motion.div key={estimate} initial={{ scale: 1.12 }} animate={{ scale: 1 }} className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem' }}>{fmt(estimate ?? 0)}</motion.div>
                  </div>
                  <motion.button type="button" className="btn btn-marigold" disabled={busy} whileTap={{ scale: 0.96 }} onClick={send}>
                    {busy ? 'Sending…' : `Send my picks`}
                  </motion.button>
                </div>
              </motion.div>
            )}
            {done && who && (
              <motion.div key="done" className="card" style={{ textAlign: 'center', padding: 26, marginTop: 18 }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                <motion.div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--jade)', display: 'grid', placeItems: 'center', margin: '0 auto' }}
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
                  <Check size={32} color="var(--on-primary)" strokeWidth={3} />
                </motion.div>
                <h1 style={{ fontSize: '1.25rem', marginTop: 14 }}>Sent, thanks {nameOf(who)}!</h1>
                <p className="muted" style={{ fontWeight: 600, marginTop: 6, lineHeight: 1.45 }}>
                  {payerName === 'You' ? 'They' : payerName} will see your picks. Your share is about <b className="num" style={{ color: 'var(--ink)' }}>{fmt(estimate ?? 0)}</b>.
                </p>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setDone(false)}><Pencil size={13} /> Change my picks</button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
