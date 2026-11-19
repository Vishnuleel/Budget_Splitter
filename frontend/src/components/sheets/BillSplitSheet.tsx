import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera, ClipboardPaste, ListPlus, Sparkles, ChevronLeft, Check, Copy, Share2, Plus, Trash2,
  UserPlus, Users, User, AlertTriangle, ScanLine, Link2, UserCheck, Images, Layers, Rows3, Send,
} from 'lucide-react';
import { createShare, shareUrl } from '../../lib/billShareApi';
import { splitBill, type BillItem, type BillExtra } from '../../../shared/billSplit.js';
import { parseReceiptText, mergeReceipts, SAMPLE_RECEIPT, type ParsedReceipt } from '../../../shared/receipt.js';
import { isLinkedId, linkedPeople, sendBill, useShared } from '../../lib/sharedApi';
import { personKey } from '../../../shared/sharedBill.js';
import { readReceiptPhoto } from '../../lib/receiptApi';
import { useSetting } from '../../lib/settings';
import { avatarColor, uid } from '../../lib/splits';
import { initials } from '../../lib/format';
import { money } from '../../lib/money';
import { hintCategory } from '../../lib/parser';
import { useData } from '../../store/DataContext';
import { useFeedback } from '../ui/Feedback';
import { Segmented, Sheet, Switch } from '../ui/primitives';

type Step = 'receipt' | 'people' | 'assign' | 'summary';
export type BillPrefill = { store?: string; total?: number; currency?: string };

const ME = { id: 'me', name: 'You' };

function Face({ id, name, size = 30, on = true }: { id: string; name: string; size?: number; on?: boolean }) {
  return (
    <span className="avatar" style={{
      width: size, height: size, fontSize: size * 0.38,
      background: on ? (id === 'me' ? 'var(--me)' : avatarColor(id)) : 'var(--surface-3)',
      color: on ? '#fff' : 'var(--ink-3)',
      transition: 'background 0.2s, color 0.2s',
    }}>
      {id === 'me' ? 'You' : initials(name)}
    </span>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ['receipt', 'people', 'assign', 'summary'];
  const labels = ['Receipt', 'Who', 'Items', 'Summary'];
  const i = order.indexOf(step);
  return (
    <div className="row" style={{ gap: 6, marginBottom: 12 }} aria-label={`Step ${i + 1} of 4: ${labels[i]}`}>
      {order.map((s, k) => (
        <motion.span key={s} animate={{ flexGrow: k === i ? 3 : 1, backgroundColor: k <= i ? 'var(--jade)' : 'var(--surface-3)' }}
          style={{ height: 4, borderRadius: 99, flexBasis: 0 }} />
      ))}
    </div>
  );
}

function BigOption({ icon, title, sub, onClick, primary }: { icon: ReactNode; title: string; sub: string; onClick: () => void; primary?: boolean }) {
  return (
    <motion.button type="button" className="card row" onClick={onClick} whileTap={{ scale: 0.98 }} whileHover={{ y: -2 }}
      style={{ width: '100%', textAlign: 'left', gap: 12, padding: 14, background: primary ? 'var(--hero)' : undefined, color: primary ? 'var(--hero-ink)' : undefined, borderColor: primary ? 'transparent' : undefined }}>
      <span className="tile" style={{ width: 42, height: 42, borderRadius: 13, background: primary ? 'rgba(255,255,255,0.1)' : 'var(--surface-2)', color: primary ? 'var(--brand)' : 'var(--ink)' }}>{icon}</span>
      <span className="grow">
        <span style={{ display: 'block', fontWeight: 800 }}>{title}</span>
        <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, opacity: 0.75, marginTop: 2 }}>{sub}</span>
      </span>
    </motion.button>
  );
}

function Body({ prefill, onDone }: { prefill?: BillPrefill; onDone: () => void }) {
  const [splits, setSplits] = useSetting('splits');
  const [displayCurrency] = useSetting('displayCurrency');
  const { insert } = useData();
  const { toast, celebrate } = useFeedback();

  const [step, setStep] = useState<Step>(prefill?.total ? 'people' : 'receipt');
  const [store, setStore] = useState<string>(prefill?.store ?? '');
  const [currency, setCurrency] = useState(prefill?.currency ?? displayCurrency);
  const [items, setItems] = useState<BillItem[]>(() => (prefill?.total ? [{ id: uid(), name: prefill.store || 'Purchase', price: prefill.total, among: [] }] : []));
  const [extras, setExtras] = useState<BillExtra[]>([]);
  const [receiptTotal, setReceiptTotal] = useState<number | null>(prefill?.total ?? null);
  const [people, setPeople] = useState<string[]>(['me']);
  const [payer, setPayer] = useState('me');
  const [mode, setMode] = useState<'pick' | 'paste'>('pick');
  const [pasted, setPasted] = useState('');
  const [scanning, setScanning] = useState(false);
  const [newFriend, setNewFriend] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [logMine, setLogMine] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const shared = useShared();
  /** Receipts read so far (several can be scanned before splitting). */
  const [scanned, setScanned] = useState<ParsedReceipt[]>([]);
  /** "Separate bills": receipts still to split after this one, and where we are. */
  const [queue, setQueue] = useState<ParsedReceipt[]>([]);
  const [batch, setBatch] = useState<{ at: number; of: number } | null>(null);

  const linked = linkedPeople(shared);
  const everyone = [ME, ...splits.people, ...linked];
  const nameOf = (id: string) => everyone.find(p => p.id === id)?.name ?? 'Someone';
  const fmt = (n: number) => money(n, { currency, decimals: true });
  /** "8,30" without the currency, for the grid's tight cells. */
  const bare = (n: number) => fmt(n).replace(/\s?[^\d\s,.−-]+$/, '').replace(/^[^\d−-]+/, '').trim();
  const [sweep, setSweep] = useState(false);
  const sweepT = useRef<number | undefined>(undefined);
  /** Tapping a name: on every item → off every item; otherwise → on every item. Sweeps down the rows. */
  const column = (p: string) => {
    window.clearTimeout(sweepT.current);
    setSweep(true);
    setItems(list => {
      const onAll = list.every(i => i.among.includes(p));
      return list.map(i => ({ ...i, shares: undefined, among: onAll ? i.among.filter(x => x !== p) : people.filter(x => x === p || i.among.includes(x)) }));
    });
    sweepT.current = window.setTimeout(() => setSweep(false), 420);
  };

  const loadReceipt = (r: { store: string | null; currency: string; items: { id: string; name: string; price: number; qty?: number }[]; extras: BillExtra[]; total: number | null }) => {
    if (!r.items.length) { toast({ message: 'No items found. Check the text, or type the items instead.' }); return; }
    setStore(r.store ?? store);
    setCurrency(r.currency || 'SEK');
    setItems(r.items.map(i => ({ ...i, among: [] })));
    setExtras(r.extras);
    setReceiptTotal(r.total);
    setStep('people');
  };

  const onPhotos = async (files?: FileList | null) => {
    const list = [...(files ?? [])].slice(0, 6 - scanned.length);
    if (!list.length) return;
    setScanning(true);
    const read = await Promise.allSettled(list.map(f => readReceiptPhoto(f)));
    setScanning(false);
    const good = read.flatMap(r => (r.status === 'fulfilled' && r.value.items.length ? [r.value] : []));
    const bad = read.length - good.length;
    if (bad) toast({ message: bad === read.length ? ((read[0] as PromiseRejectedResult).reason?.message ?? 'Couldn’t read that receipt.') : `${bad} photo${bad > 1 ? 's' : ''} couldn’t be read.`, duration: 6000 });
    setScanned(s => [...s, ...good]);
  };

  /** Several receipts → one bill, or a queue of separate bills with the same people. */
  const takeScanned = (how: 'one' | 'separate') => {
    if (how === 'one' || scanned.length === 1) { setBatch(null); loadReceipt(mergeReceipts(scanned)); }
    else { const [first, ...rest] = scanned; setQueue(rest); setBatch({ at: 1, of: scanned.length }); loadReceipt(first); }
    setScanned([]);
  };

  // Default: everyone on the bill shares every item they haven't been placed on yet.
  const goAssign = () => {
    setItems(list => list.map(i => ({ ...i, among: i.among.length ? i.among.filter(p => people.includes(p)) : [...people] })));
    setStep('assign');
  };

  const result = useMemo(() => splitBill(items, extras, people, payer), [items, extras, people, payer]);
  const parsedTotal = result.total;
  const mismatch = receiptTotal != null ? Math.round((receiptTotal - parsedTotal) * 100) / 100 : 0;

  const toggle = (itemId: string, p: string) =>
    setItems(list => list.map(i => (i.id !== itemId ? i : { ...i, among: i.among.includes(p) ? i.among.filter(x => x !== p) : [...i.among, p] })));
  const setAmong = (itemId: string, among: string[]) => setItems(list => list.map(i => (i.id === itemId ? { ...i, among, shares: undefined } : i)));
  const patchItem = (itemId: string, patch: Partial<BillItem>) => setItems(list => list.map(i => (i.id === itemId ? { ...i, ...patch } : i)));

  const addFriend = () => {
    const name = newFriend.trim();
    if (!name) return;
    const id = uid();
    setSplits(s => ({ ...s, people: [...s.people, { id, name }] }));
    setPeople(p => [...p, id]);
    setNewFriend('');
  };

  const messageFor = (p: string) => {
    const mine = result.per[p];
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const lines = mine.items.map(i => `• ${i.name}${i.sharedWith > 1 ? ` (shared ÷${i.sharedWith})` : ''}  ${fmt(i.amount)}`);
    const skipped = items.filter(i => !i.among.includes(p)).map(i => i.name);
    return [
      `Hi ${nameOf(p)}! ${store || 'Shopping'} (${date}): your share is ${fmt(mine.total)}`,
      ...lines,
      ...(mine.extras ? [`• Discounts/bags: ${fmt(mine.extras)}`] : []),
      ...(skipped.length ? [`Not on your bill: ${skipped.join(', ')}`] : []),
      payer !== p ? `Pay ${nameOf(payer) === 'You' ? 'me' : nameOf(payer)} when you can 🙏` : '',
    ].filter(Boolean).join('\n');
  };

  const linkMessage = () => `Hi! I paid for ${store || 'our shopping'} (${fmt(parsedTotal)}). Tick the items you’re sharing so you only pay for yours: ${link}`;

  const copy = async (p: string) => {
    try { await navigator.clipboard.writeText(messageFor(p)); setCopied(p); setTimeout(() => setCopied(c => (c === p ? null : c)), 1500); }
    catch { toast({ message: 'Copy blocked — use Share instead.' }); }
  };

  const linkedOn = people.filter(isLinkedId);
  const sendsToApps = payer === 'me' && linkedOn.length > 0 && !!shared.me;

  /** Next receipt in a "separate bills" batch, or close. Same people and payer carry over. */
  const finish = () => {
    if (!queue.length) { onDone(); return; }
    const [next, ...rest] = queue;
    setQueue(rest);
    setBatch(b => (b ? { ...b, at: b.at + 1 } : b));
    setLink(null);
    setStore(next.store ?? '');
    setCurrency(next.currency || currency);
    setItems(next.items.map(i => ({ ...i, among: [...people] })));
    setExtras(next.extras);
    setReceiptTotal(next.total);
    setStep('assign');
  };

  const save = async (withLink = false) => {
    if (result.unassigned.length) { toast({ message: 'Some items have nobody on them. Assign or delete them first.' }); setStep('assign'); return; }
    let sharedId: string | undefined;
    if (sendsToApps) {
      setSending(true);
      try {
        const k = (p: string) => (p === 'me' ? personKey(shared.me!.id) : p);
        sharedId = await sendBill({
          title: store || 'Shopping', store: store || null, currency, date: new Date().toISOString(), payer: k(payer),
          people: people.map(p => ({ id: k(p), name: nameOf(p) })),
          items: items.map(i => ({ ...i, among: i.among.map(k), shares: i.shares ? Object.fromEntries(Object.entries(i.shares).map(([p, w]) => [k(p), w])) : undefined })),
          extras,
        }, linkedOn.map(p => p.slice(2)));
      } catch (e) {
        toast({ message: (e as Error).message });
        setSending(false);
        return;
      }
      setSending(false);
    }
    let share: { id: string; token: string } | null = null;
    if (withLink) {
      setSending(true);
      try {
        share = await createShare({
          title: store || 'Shopping', currency, payer,
          people: people.map(p => ({ id: p, name: nameOf(p) })), items, extras,
        });
      } catch (e) {
        toast({ message: (e as Error).message });
        setSending(false);
        return;
      }
      setSending(false);
    }
    const entry = {
      id: uid(), title: store || 'Receipt', amount: parsedTotal, currency, date: new Date().toISOString(),
      paidBy: payer, among: people, settled: [], items, extras, store: store || null,
      ...(share ? { shareId: share.id, shareToken: share.token } : {}),
      ...(sharedId ? { sharedId } : {}),
    };
    setSplits(s => ({ ...s, entries: [entry, ...s.entries] }));
    if (share) {
      if (logMine && payer === 'me' && result.per.me?.total > 0) {
        await insert('transactions', { amount: result.per.me.total, currency, merchant: store || 'Shared shopping', category: hintCategory(store || '') ?? 'Groceries', date: new Date().toISOString() });
      }
      setLink(shareUrl(share.token));
      return;
    }
    if (logMine && payer === 'me' && result.per.me?.total > 0) {
      await insert('transactions', {
        amount: result.per.me.total, currency, merchant: store || 'Shared shopping',
        category: hintCategory(store || '') ?? 'Groceries', date: new Date().toISOString(),
      });
    }
    const owed = people.filter(p => p !== payer).reduce((a, p) => a + result.per[p].total, 0);
    celebrate({
      amount: fmt(owed),
      title: sharedId ? `Sent to ${linkedOn.map(nameOf).join(' & ')}` : payer === 'me' ? 'Owed to you' : `You owe ${nameOf(payer)}`,
      subtitle: sharedId ? 'It counts once they accept it in their app' : `${items.length} items split fairly`,
    });
    finish();
  };

  return (
    <div className="form-stack">
      <StepDots step={step} />
      {batch && <div className="badge neutral" style={{ alignSelf: 'center' }}>Receipt {batch.at} of {batch.of}</div>}
      <AnimatePresence mode="wait" initial={false}>
        {/* ── 1 · Receipt ─────────────────────────── */}
        {step === 'receipt' && (
          <motion.div key="receipt" className="form-stack" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { void onPhotos(e.target.files); e.target.value = ''; }} />
            <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={e => { void onPhotos(e.target.files); e.target.value = ''; }} />
            {scanning ? (
              <div className="card" style={{ textAlign: 'center', padding: 28 }}>
                <motion.div style={{ display: 'inline-grid', color: 'var(--jade)' }} animate={{ y: [-6, 6, -6] }} transition={{ duration: 1.2, repeat: Infinity }}>
                  <ScanLine size={40} />
                </motion.div>
                <div style={{ fontWeight: 800, marginTop: 10 }}>Reading your receipts…</div>
                <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: 4 }}>Items, discounts, pant and bags</div>
              </div>
            ) : scanned.length > 0 ? (
              <>
                <div className="field-label">{scanned.length} receipt{scanned.length === 1 ? '' : 's'} read</div>
                {scanned.map((r, k) => (
                  <div key={k} className="card card-tight row" style={{ gap: 10 }}>
                    <span className="tile" style={{ width: 34, height: 34, background: 'var(--tint-1)', color: 'var(--ink)', fontWeight: 900 }}>{k + 1}</span>
                    <div className="grow">
                      <div style={{ fontWeight: 800 }}>{r.store || `Receipt ${k + 1}`}</div>
                      <div className="faint" style={{ fontSize: '0.76rem', fontWeight: 600 }}>{r.items.length} items{r.total != null ? ` · ${money(r.total, { currency: r.currency, decimals: true })}` : ''}</div>
                    </div>
                    <button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove receipt ${k + 1}`} onClick={() => setScanned(l => l.filter((_, i) => i !== k))}><Trash2 size={14} /></button>
                  </div>
                ))}
                {scanned.length < 6 && (
                  <div className="form-grid">
                    <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}><Camera size={16} /> Scan another</button>
                    <button type="button" className="btn btn-ghost" onClick={() => libRef.current?.click()}><Images size={16} /> From photos</button>
                  </div>
                )}
                {scanned.length === 1 ? (
                  <motion.button type="button" className="btn btn-primary btn-block" whileTap={{ scale: 0.97 }} onClick={() => takeScanned('one')}>Continue</motion.button>
                ) : (
                  <>
                    <BigOption primary icon={<Layers size={20} />} title="One bill" sub={`All ${scanned.reduce((a, r) => a + r.items.length, 0)} items in one split. Same shop trip.`} onClick={() => takeScanned('one')} />
                    <BigOption icon={<Rows3 size={20} />} title="Separate bills" sub={`${scanned.length} splits, one after another, same people`} onClick={() => takeScanned('separate')} />
                  </>
                )}
              </>
            ) : mode === 'pick' ? (
              <>
                <BigOption primary icon={<Camera size={20} />} title="Scan receipt" sub="Take a photo. You can add more receipts after." onClick={() => fileRef.current?.click()} />
                <BigOption icon={<Images size={20} />} title="Choose receipt photos" sub="Pick one or several from your photos" onClick={() => libRef.current?.click()} />
                <BigOption icon={<ClipboardPaste size={20} />} title="Paste receipt text" sub="From the ICA/Coop app or an e-receipt (Kivra)" onClick={() => setMode('paste')} />
                <BigOption icon={<ListPlus size={20} />} title="Type the items" sub="Quick for a few things" onClick={() => { setItems([{ id: uid(), name: '', price: 0, among: [] }]); setStep('people'); }} />
                <button type="button" className="link-btn row" style={{ gap: 6, justifyContent: 'center' }} onClick={() => loadReceipt(parseReceiptText(SAMPLE_RECEIPT))}>
                  <Sparkles size={14} /> Try with a sample ICA receipt
                </button>
              </>
            ) : (
              <>
                <textarea className="input" style={{ minHeight: 200, fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }} autoFocus
                  placeholder={'CHAMPINJONER 250G   24,90\nMJÖLK 3% 1,5L       17,50\n…\nTotalt             257,40'} value={pasted} onChange={e => setPasted(e.target.value)} />
                <div className="form-grid">
                  <button type="button" className="btn btn-ghost" onClick={() => setMode('pick')}>Back</button>
                  <motion.button type="button" className="btn btn-primary" disabled={!pasted.trim()} whileTap={{ scale: 0.97 }} onClick={() => loadReceipt(parseReceiptText(pasted))}>Read items</motion.button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── 2 · People ──────────────────────────── */}
        {step === 'people' && (
          <motion.div key="people" className="form-stack" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>Who was this shop for?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {everyone.map(p => {
                  const on = people.includes(p.id);
                  return (
                    <motion.button key={p.id} type="button" className="chip" aria-pressed={on} whileTap={{ scale: 0.92 }}
                      onClick={() => p.id !== 'me' && setPeople(list => (on ? list.filter(x => x !== p.id) : [...list, p.id]))}
                      style={{ paddingLeft: 5, background: on ? 'var(--jade-soft)' : 'var(--surface)', borderColor: on ? 'var(--jade)' : 'var(--line)', color: 'var(--ink)' }}>
                      <span><Face id={p.id} name={p.name} size={24} on={on} /> {p.name}{isLinkedId(p.id) && <UserCheck size={13} color="var(--jade)" aria-label="has the app" />}{on && <Check size={13} color="var(--jade)" />}</span>
                    </motion.button>
                  );
                })}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <input className="input" placeholder="Add a roommate" value={newFriend} onChange={e => setNewFriend(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addFriend(); }} />
                <motion.button type="button" className="icon-btn" style={{ width: 44, height: 44, flexShrink: 0 }} whileTap={{ scale: 0.9 }} onClick={addFriend} aria-label="Add roommate"><UserPlus size={18} /></motion.button>
              </div>
            </div>
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>Who paid?</div>
              <Segmented id="bill-payer" value={payer} onChange={setPayer} options={people.map(p => ({ value: p, label: nameOf(p) }))} />
              {linkedOn.length > 0 && (
                <p className="faint row" style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 8, gap: 6, alignItems: 'flex-start' }}>
                  <UserCheck size={14} color="var(--jade)" style={{ flexShrink: 0, marginTop: 1 }} />
                  {payer === 'me'
                    ? `${linkedOn.map(nameOf).join(' & ')} will get this bill in their app to accept.`
                    : isLinkedId(payer) ? `${nameOf(payer)} paid, so ${nameOf(payer)} should send it from their app. Saving here only keeps your own record.` : 'Only the person who paid can send it to friends’ apps.'}
                </p>
              )}
            </div>
            <div className="form-grid">
              <label className="field"><span className="field-label">Shop</span><input className="input" value={store} placeholder="ICA, Willys…" onChange={e => setStore(e.target.value)} /></label>
              <label className="field"><span className="field-label">Currency</span>
                <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>{['SEK', 'INR', 'EUR', 'USD', 'NOK', 'DKK', 'GBP'].map(c => <option key={c}>{c}</option>)}</select>
              </label>
            </div>
            <div className="form-grid">
              <button type="button" className="btn btn-ghost" onClick={() => setStep('receipt')}><ChevronLeft size={16} /> Receipt</button>
              <motion.button type="button" className="btn btn-primary" disabled={people.length < 2} whileTap={{ scale: 0.97 }} onClick={goAssign}>
                {people.length < 2 ? 'Add a roommate' : `Split ${items.length} item${items.length === 1 ? '' : 's'}`}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── 3 · Assign items ────────────────────── */}
        {step === 'assign' && (
          <motion.div key="assign" className="form-stack" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <p className="faint" style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.45 }}>
              Tick who's in on each item. <b style={{ color: 'var(--ink)' }}>Tap a name</b> to add or remove them everywhere. Tap an item to edit it.
            </p>

            <div className="bgr" role="table" aria-label="Who shares each item" data-sweep={sweep || undefined}
              style={{ '--cols': people.length, overflowX: people.length > 5 ? 'auto' : undefined } as CSSProperties}>
              <div className="bgr-head" role="row">
                <span className="bgr-corner" role="columnheader">Item</span>
                {people.map(p => (
                  <span key={p} role="columnheader">
                    <button type="button" className="bgr-col" onClick={() => column(p)} aria-label={`${nameOf(p)}, ${fmt(result.per[p].total)}. Toggle on every item`}>
                      <Face id={p} name={nameOf(p)} size={28} />
                      <span className="bgr-cname ell">{nameOf(p)}</span>
                      <span className="bgr-ctot num">{bare(result.per[p].total)}</span>
                    </button>
                  </span>
                ))}
              </div>

              {items.map((item, r) => {
                const open = editing === item.id;
                return (
                  <div key={item.id} role="rowgroup" className={`bgr-group${item.among.length ? '' : ' warn'}`}>
                    <div role="row" className="bgr-row" style={{ '--i': r } as CSSProperties}>
                      <button type="button" role="rowheader" className="bgr-item" aria-expanded={open} onClick={() => setEditing(open ? null : item.id)}>
                        <span className="bgr-name ell">{item.name || 'Untitled item'}</span>
                        <span className="bgr-price num">{bare(item.price)}{item.among.length > 1 ? ` ÷${item.among.length}` : ''}{item.among.length ? '' : ' · nobody'}</span>
                      </button>
                      {people.map(p => {
                        const on = item.among.includes(p);
                        const share = result.per[p]?.items.find(i => i.id === item.id)?.amount;
                        return (
                          <span key={p} role="cell">
                            <button type="button" className="bgr-cell" aria-pressed={on} aria-label={`${nameOf(p)}: ${item.name}`}
                              style={{ '--c': p === 'me' ? 'var(--me)' : avatarColor(p) } as CSSProperties} onClick={() => toggle(item.id, p)}>
                              <span className="bgr-box"><Check size={14} strokeWidth={3} aria-hidden="true" /></span>
                              <span className="bgr-amt num">{on && share != null ? bare(share) : '·'}</span>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div className="bgr-edit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
                          <div className="row" style={{ gap: 8 }}>
                            <input className="bill-name" value={item.name} placeholder="Item name" aria-label="Item name" onChange={e => patchItem(item.id, { name: e.target.value })} />
                            <input className="bill-price num" inputMode="decimal" aria-label={`Price of ${item.name || 'item'}`}
                              value={item.price ? String(item.price).replace('.', ',') : ''} placeholder="0,00"
                              onChange={e => patchItem(item.id, { price: parseFloat(e.target.value.replace(',', '.').replace(/[^\d.-]/g, '')) || 0 })} />
                          </div>
                          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAmong(item.id, [payer])}><User size={13} /> Only {nameOf(payer) === 'You' ? 'me' : nameOf(payer)}</button>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAmong(item.id, [...people])}><Users size={13} /> Everyone</button>
                            <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--rose)' }} onClick={() => { setItems(l => l.filter(i => i.id !== item.id)); setEditing(null); }}><Trash2 size={13} /> Remove</button>
                          </div>
                          {item.among.length > 1 && (
                            <div style={{ marginTop: 10 }}>
                              <div className="field-label" style={{ marginBottom: 6 }}>Uneven split (e.g. 2 of 3 packs)</div>
                              {item.among.map(p => {
                                const w = item.shares?.[p] ?? 1;
                                const setW = (v: number) => patchItem(item.id, { shares: { ...Object.fromEntries(item.among.map(x => [x, item.shares?.[x] ?? 1])), [p]: Math.max(0, Math.min(20, v)) } });
                                return (
                                  <div key={p} className="row" style={{ gap: 8, padding: '4px 0' }}>
                                    <Face id={p} name={nameOf(p)} size={24} />
                                    <span className="grow" style={{ fontWeight: 700, fontSize: '0.85rem' }}>{nameOf(p)}</span>
                                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setW(w - 1)} aria-label={`Fewer for ${nameOf(p)}`}>−</button>
                                    <span className="num" style={{ width: 20, textAlign: 'center', fontWeight: 800 }}>{w}</span>
                                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setW(w + 1)} aria-label={`More for ${nameOf(p)}`}>+</button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {extras.length > 0 && (
                <div role="row" className="bgr-row bgr-extras">
                  <div role="rowheader" className="bgr-item"><span className="bgr-name ell">{extras.map(x => x.name).join(' & ')}</span><span className="bgr-price">whole bill</span></div>
                  {people.map(p => <span key={p} role="cell" className="bgr-x num">{bare(result.per[p].extras)}</span>)}
                </div>
              )}
            </div>

            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { const id = uid(); setItems(l => [...l, { id, name: '', price: 0, among: [...people] }]); setEditing(null); }}>
              <Plus size={14} /> Add item
            </button>

            {extras.length > 0 && (
              <div className="card card-tight">
                <div className="field-label" style={{ marginBottom: 6 }}>Shared by the whole bill</div>
                {extras.map((x, k) => (
                  <div key={k} className="row" style={{ justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 700, padding: '3px 0' }}>
                    <span>{x.name} <span className="faint" style={{ fontWeight: 600 }}>· {x.kind === 'fee' ? 'split equally' : 'by what each bought'}</span></span>
                    <span className="num" style={{ color: x.amount < 0 ? 'var(--income)' : undefined }}>{fmt(x.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {Math.abs(mismatch) >= 0.01 && (
              <div className="card card-tight row" style={{ background: 'var(--marigold-soft)', borderColor: 'transparent', gap: 10 }}>
                <AlertTriangle size={18} color="var(--marigold-ink)" />
                <div className="grow" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--marigold-ink)' }}>
                  Items add up to {fmt(parsedTotal)}, receipt says {fmt(receiptTotal!)} ({fmt(mismatch)} off).
                </div>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setItems(l => [...l, { id: uid(), name: 'Unmatched', price: mismatch, among: [...people] }])}>Add line</button>
              </div>
            )}

            <div className="form-grid">
              <button type="button" className="btn btn-ghost" onClick={() => setStep('people')}><ChevronLeft size={16} /> Who</button>
              <motion.button type="button" className="btn btn-primary" disabled={!items.length || result.unassigned.length > 0} whileTap={{ scale: 0.97 }} onClick={() => setStep('summary')}>
                Review · {fmt(parsedTotal)}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── 4 · Summary ─────────────────────────── */}
        {step === 'summary' && (
          <motion.div key="summary" className="form-stack" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            {people.map((p, k) => {
              const mine = result.per[p];
              const skipped = items.filter(i => !i.among.includes(p));
              return (
                <motion.section key={p} className="card" style={{ padding: 14 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <Face id={p} name={nameOf(p)} size={36} />
                    <div className="grow">
                      <div style={{ fontWeight: 800 }}>{nameOf(p)}{p === payer && <span className="badge good" style={{ marginLeft: 6 }}>paid</span>}</div>
                      <div className="faint" style={{ fontSize: '0.76rem', fontWeight: 600 }}>{mine.items.length} item{mine.items.length === 1 ? '' : 's'}{skipped.length ? ` · skipped ${skipped.length}` : ''}</div>
                    </div>
                    <div className="display num" style={{ fontSize: '1.15rem' }}>{fmt(mine.total)}</div>
                  </div>
                  <div className="bill-breakdown">
                    {mine.items.map(i => (
                      <div key={i.id} className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="ellipsis">{i.name}{i.sharedWith > 1 && <span className="faint"> ÷{i.sharedWith}</span>}</span>
                        <span className="num">{fmt(i.amount)}</span>
                      </div>
                    ))}
                    {mine.extras !== 0 && <div className="row faint" style={{ justifyContent: 'space-between' }}><span>Discounts &amp; bags</span><span className="num">{fmt(mine.extras)}</span></div>}
                    {skipped.length > 0 && <div className="faint" style={{ marginTop: 4 }}>Not charged: {skipped.map(i => i.name).join(', ')}</div>}
                  </div>
                  {p !== payer && sendsToApps && isLinkedId(p) ? (
                    <div className="row faint" style={{ gap: 6, marginTop: 10, fontSize: '0.8rem', fontWeight: 700 }}>
                      <UserCheck size={14} color="var(--jade)" /> Goes to {nameOf(p)}’s app to accept
                    </div>
                  ) : p !== payer && (
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <motion.button type="button" className="btn btn-sm btn-ghost grow" whileTap={{ scale: 0.96 }} onClick={() => copy(p)}>
                        {copied === p ? <Check size={14} color="var(--jade)" /> : <Copy size={14} />} {copied === p ? 'Copied' : `Copy ${nameOf(p)}’s bill`}
                      </motion.button>
                      {typeof navigator.share === 'function' && (
                        <motion.button type="button" className="btn btn-sm btn-ghost" whileTap={{ scale: 0.96 }} onClick={() => navigator.share({ text: messageFor(p) }).catch(() => {})} aria-label={`Share ${nameOf(p)}’s bill`}>
                          <Share2 size={14} />
                        </motion.button>
                      )}
                    </div>
                  )}
                </motion.section>
              );
            })}

            {payer === 'me' && (
              <div className="row card card-tight">
                <div className="grow">
                  <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Log my share as an expense</div>
                  <div className="faint" style={{ fontSize: '0.76rem', fontWeight: 600 }}>{fmt(result.per.me.total)} · {hintCategory(store || '') ?? 'Groceries'}</div>
                </div>
                <Switch checked={logMine} onChange={setLogMine} label="Log my share as an expense" />
              </div>
            )}

            {link ? (
              <motion.div className="cred" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div style={{ fontWeight: 800 }}>Saved. Send this link to your roommates</div>
                <p className="faint" style={{ fontSize: '0.78rem', fontWeight: 600, margin: '4px 0 10px', lineHeight: 1.45 }}>
                  Each one picks their name and unticks what isn’t theirs. No account needed. You’ll see their picks under Split bills → History.
                </p>
                <code style={{ display: 'block', fontSize: '0.78rem', wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{link}</code>
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <motion.button type="button" className="btn btn-sm btn-primary grow" whileTap={{ scale: 0.96 }} onClick={async () => {
                    try { await navigator.clipboard.writeText(linkMessage()); setCopied('link'); } catch { toast({ message: 'Copy blocked — use Share.' }); }
                  }}>{copied === 'link' ? <Check size={14} /> : <Copy size={14} />} {copied === 'link' ? 'Copied' : 'Copy message'}</motion.button>
                  {typeof navigator.share === 'function' && (
                    <motion.button type="button" className="btn btn-sm btn-ghost" whileTap={{ scale: 0.96 }} onClick={() => navigator.share({ text: linkMessage() }).catch(() => {})}><Share2 size={14} /> Share</motion.button>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={finish}>{queue.length ? 'Next receipt' : 'Done'}</button>
                </div>
              </motion.div>
            ) : (
              <>
                {sendsToApps ? (
                  <motion.button type="button" className="btn btn-primary btn-block" disabled={sending} whileTap={{ scale: 0.97 }} onClick={() => save()}>
                    <Send size={16} /> {sending ? 'Sending…' : `Send to ${linkedOn.map(nameOf).join(' & ')}’s app${linkedOn.length > 1 ? 's' : ''}`}
                  </motion.button>
                ) : (
                  <motion.button type="button" className="btn btn-primary btn-block" disabled={sending} whileTap={{ scale: 0.97 }} onClick={() => save(true)}>
                    <Link2 size={16} /> {sending ? 'Creating link…' : 'Save & let them pick their items'}
                  </motion.button>
                )}
                <div className="form-grid">
                  <button type="button" className="btn btn-ghost" onClick={() => setStep('assign')}><ChevronLeft size={16} /> Items</button>
                  {!sendsToApps && <motion.button type="button" className="btn btn-jade" whileTap={{ scale: 0.97 }} onClick={() => save()}><Check size={16} /> Save split</motion.button>}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function BillSplitSheet({ open, prefill, onClose }: { open: boolean; prefill?: BillPrefill; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Split a receipt">
      <Body prefill={prefill} onDone={onClose} />
    </Sheet>
  );
}
