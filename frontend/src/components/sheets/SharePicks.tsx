import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Clock, Copy, Wand2, XCircle } from 'lucide-react';
import type { SplitEntry } from '../../lib/settings';
import { useSetting } from '../../lib/settings';
import { closeShare, shareStatus, shareUrl } from '../../lib/billShareApi';
import { applyClaims, type Claims } from '../../../shared/billShare.js';
import { useFeedback } from '../ui/Feedback';

/** Under a receipt in Split history: who has picked their items, and "Apply picks". */
export default function SharePicks({ entry, nameOf }: { entry: SplitEntry; nameOf: (id: string) => string }) {
  const [, setSplits] = useSetting('splits');
  const [claims, setClaims] = useState<Claims | null>(null);
  const [gone, setGone] = useState(false);
  const { toast } = useFeedback();

  useEffect(() => {
    if (!entry.shareId) return;
    let alive = true;
    shareStatus([entry.shareId])
      .then(r => { if (!alive) return; const s = r.shares[0]; if (s) setClaims(s.claims); else setGone(true); })
      .catch(() => alive && setGone(true));
    return () => { alive = false; };
  }, [entry.shareId]);

  if (!entry.shareId || !entry.items?.length) return null;
  const roommates = entry.among.filter(p => p !== entry.paidBy);
  const answered = Object.keys(claims ?? {});
  // New answers, or answers changed after we last applied them.
  const newPicks = answered.filter(p => !(entry.picksApplied ?? []).includes(p) || (claims?.[p]?.at ?? '') > (entry.picksAppliedAt ?? ''));

  const apply = () => {
    if (!claims) return;
    setSplits(s => ({
      ...s,
      entries: s.entries.map(e => (e.id !== entry.id ? e : { ...e, items: applyClaims(e.items!, claims), picksApplied: answered, picksAppliedAt: new Date().toISOString() })),
    }));
    toast({ message: `Applied picks from ${answered.map(nameOf).join(', ')}` });
  };

  const close = async () => {
    try { await closeShare(entry.shareId!); } catch { /* already gone */ }
    setSplits(s => ({ ...s, entries: s.entries.map(e => (e.id !== entry.id ? e : { ...e, shareId: undefined, shareToken: undefined })) }));
    toast({ message: 'Link closed' });
  };

  return (
    <div className="share-picks">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {roommates.map(p => {
          const did = answered.includes(p);
          return (
            <span key={p} className={`badge ${did ? 'good' : 'neutral'}`}>
              {did ? <Check size={11} /> : <Clock size={11} />} {nameOf(p)}
            </span>
          );
        })}
        {gone && <span className="badge bad">link expired</span>}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {newPicks.length > 0 && (
          <motion.button type="button" className="btn btn-sm btn-jade" whileTap={{ scale: 0.95 }} onClick={apply} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            <Wand2 size={13} /> Apply picks ({newPicks.length})
          </motion.button>
        )}
        {newPicks.length === 0 && answered.length > 0 && <span className="faint" style={{ fontSize: '0.74rem', fontWeight: 700 }}>Picks applied</span>}
        {entry.shareToken && !gone && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={async () => {
            try { await navigator.clipboard.writeText(shareUrl(entry.shareToken!)); toast({ message: 'Link copied' }); } catch { toast({ message: 'Copy blocked' }); }
          }}><Copy size={13} /> Link</button>
        )}
        {!gone && <button type="button" className="btn btn-sm btn-ghost" onClick={close}><XCircle size={13} /> Close link</button>}
      </div>
    </div>
  );
}
