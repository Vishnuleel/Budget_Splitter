import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Download, Lock, Trash2, Cloud, CloudOff, Target, ChevronRight, Sun, Moon, Monitor, FlaskConical, Coins, CreditCard, Smartphone } from 'lucide-react';
import { setDemoMode } from '../../lib/demo';
import { setSetting, useCloudState, useSetting } from '../../lib/settings';
import { CATEGORIES, CATEGORY_META, effectiveCategory, isExpense } from '../../lib/categories';
import { inMonth, pct } from '../../lib/format';
import { exportCsv } from '../../lib/csv';
import { useData } from '../../store/DataContext';
import { useUI } from '../../store/UIContext';
import { Bar, Field, Segmented, Sheet, Switch, Tile } from '../ui/primitives';
import { AccountCard, AppLockRow } from './AccountSettings';
import { money, amt, convert, loadRates, useRates, displayCurrency, CURRENCY_CODES, type CurrencyCode } from '../../lib/money';

function Row({ icon, title, sub, right, onClick }: { icon: ReactNode; title: string; sub?: string; right?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <div className="tile" style={{ width: 40, height: 40, background: 'var(--surface-2)', color: 'var(--ink)' }}>{icon}</div>
      <div className="grow" style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        {sub && <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{sub}</div>}
      </div>
      {right}
    </>
  );
  return onClick ? (
    <motion.button type="button" className="list-row" style={{ width: '100%' }} whileTap={{ scale: 0.98 }} onClick={onClick}>{inner}</motion.button>
  ) : (
    <div className="list-row">{inner}</div>
  );
}

function MoneySettings() {
  const [display] = useSetting('displayCurrency');
  const [markup, setMarkup] = useSetting('forexMarkup');
  const [markupDraft, setMarkupDraft] = useState(String(markup));
  const rates = useRates();

  // Budgets are stored in the display currency, so convert them when it changes.
  const changeDisplay = (next: CurrencyCode) => {
    if (next === display) return;
    const k = convert(1, display, next);
    const round = (v: number) => (next === 'INR' ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10);
    setSetting('monthlyBudget', b => round(b * k));
    setSetting('categoryBudgets', caps => Object.fromEntries(Object.entries(caps).map(([c, v]) => [c, round(v * k)])));
    setSetting('displayCurrency', next);
  };

  return (
    <div>
      <div className="field-label" style={{ marginBottom: 8 }}>Money</div>
      <div className="card" style={{ padding: '4px 16px' }}>
        <div className="list-row">
          <div className="tile" style={{ width: 40, height: 40, background: 'var(--surface-2)', color: 'var(--ink)' }}><Coins size={18} /></div>
          <div className="grow">
            <div style={{ fontWeight: 800 }}>Show totals in</div>
            <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Each payment keeps its own currency</div>
          </div>
          <select className="input" style={{ width: 96, padding: '9px 10px' }} value={display} aria-label="Display currency"
            onChange={e => changeDisplay(e.target.value as CurrencyCode)}>
            {CURRENCY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="list-row">
          <div className="tile" style={{ width: 40, height: 40, background: 'var(--surface-2)', color: 'var(--ink)' }}><CreditCard size={18} /></div>
          <div className="grow">
            <div style={{ fontWeight: 800 }}>Card forex markup</div>
            <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Your Indian card's fee abroad</div>
          </div>
          <input className="input num" style={{ width: 74, padding: '9px 10px', textAlign: 'right' }} inputMode="decimal" aria-label="Forex markup percent"
            value={markupDraft} onChange={e => setMarkupDraft(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
            onBlur={() => { const v = Math.min(10, Number(markupDraft) || 0); setMarkup(v); setMarkupDraft(String(v)); }} />
          <span className="faint" style={{ fontWeight: 800 }}>%</span>
        </div>
        <div className="list-row" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
          <span className="faint grow">
            1 SEK = {money(convert(1, 'SEK', 'INR'), { currency: 'INR', decimals: true })} · ECB rate {rates.date}{rates.live ? '' : ' (offline copy)'}
          </span>
          <button type="button" className="link-btn" onClick={() => loadRates(true)}>Refresh</button>
        </div>
      </div>
    </div>
  );
}

function SettingsBody() {
  const [theme, setTheme] = useSetting('theme');
  const [hide, setHide] = useSetting('hideBalances');
  const [rules, setRules] = useSetting('merchant_rules');
  const cloud = useCloudState();
  const { transactions, demo } = useData();
  const { lock, openSheet, closeSheet } = useUI();

  return (
    <div className="form-stack">
      <AccountCard onNavigate={closeSheet} />

      <div>
        <div className="field-label" style={{ marginBottom: 8 }}>Appearance</div>
        <Segmented id="theme" value={theme} onChange={setTheme} options={[
          { value: 'system', label: <span className="row" style={{ gap: 6, justifyContent: 'center' }}><Monitor size={15} />Auto</span> },
          { value: 'light', label: <span className="row" style={{ gap: 6, justifyContent: 'center' }}><Sun size={15} />Light</span> },
          { value: 'dark', label: <span className="row" style={{ gap: 6, justifyContent: 'center' }}><Moon size={15} />Dark</span> },
        ]} />
      </div>

      <MoneySettings />

      <div className="card" style={{ padding: '4px 16px' }}>
        <Row icon={<Smartphone size={18} />} title="Use on your phone" sub="Home-screen app + automatic bank SMS" right={<ChevronRight size={18} className="faint" />} onClick={() => openSheet({ kind: 'phone' })} />
        <Row icon={<Target size={18} />} title="Budgets" sub="Monthly limit and per-category caps" right={<ChevronRight size={18} className="faint" />} onClick={() => openSheet({ kind: 'budgets' })} />
        <Row icon={<Lock size={18} />} title="Hide balances on open" sub="Blur amounts until you tap the eye" right={<Switch checked={hide} onChange={setHide} label="Hide balances" />} />
        <Row icon={<Download size={18} />} title="Export CSV" sub={`${transactions.length} transactions`} onClick={() => exportCsv(transactions)} right={<ChevronRight size={18} className="faint" />} />
        <AppLockRow onLockNow={lock} />
        <Row
          icon={<FlaskConical size={18} />}
          title={demo ? 'Demo mode is on' : 'Explore with demo data'}
          sub={demo ? 'Sample data only — nothing is saved' : 'Try every feature without touching your data'}
          onClick={() => setDemoMode(!demo)}
          right={<span className="badge neutral">{demo ? 'Exit' : 'Open'}</span>}
        />
        {!demo && (
          <Row
            icon={cloud === 'ok' ? <Cloud size={18} /> : <CloudOff size={18} />}
            title={cloud === 'ok' ? 'Settings synced' : cloud === 'missing' ? 'Settings saved on this device' : 'Checking sync…'}
            sub={cloud === 'ok' ? 'Budgets, rules and splits follow you to every device' : 'Couldn’t reach app_settings. Ask the admin to run supabase/schema.sql'}
          />
        )}
      </div>

      <div>
        <div className="field-label" style={{ marginBottom: 4 }}>Merchant rules ({rules.length})</div>
        {rules.length === 0 ? (
          <div className="empty">Confirm a category on any payment and we’ll remember it for that merchant.</div>
        ) : (
          <div className="card" style={{ padding: '4px 16px' }}>
            {rules.map(r => {
              const meta = CATEGORY_META[r.category] ?? CATEGORY_META.Uncategorized;
              return (
                <div key={r.merchant} className="list-row">
                  <Tile icon={meta.icon} color={meta.color} size={36} radius={12} />
                  <div className="grow">
                    <div style={{ fontWeight: 800 }} className="ellipsis">{r.merchant}</div>
                    <div className="faint" style={{ fontSize: '0.8rem', fontWeight: 600 }}>→ {meta.short}</div>
                  </div>
                  <button type="button" aria-label={`Delete rule for ${r.merchant}`} style={{ color: 'var(--ink-3)', padding: 8 }}
                    onClick={() => setRules(rs => rs.filter(x => x.merchant !== r.merchant))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BudgetsBody() {
  const [monthly, setMonthly] = useSetting('monthlyBudget');
  const [caps, setCaps] = useSetting('categoryBudgets');
  const { transactions } = useData();
  const [draft, setDraft] = useState(String(monthly));
  const now = new Date();

  const spentBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) {
      if (!isExpense(t) || !inMonth(t.date, now.getFullYear(), now.getMonth())) continue;
      const c = effectiveCategory(t);
      m.set(c, (m.get(c) ?? 0) + amt(t));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);
  const total = [...spentBy.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="form-stack">
      <Field label={`Monthly spending limit (${displayCurrency()})`}>
        <input className="input num" inputMode="numeric" value={draft}
          onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={() => setMonthly(Number(draft) || 0)} />
      </Field>
      <div>
        <div className="row" style={{ justifyContent: 'space-between', fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>
          <span>This month</span><span className="num">{money(total)} / {money(Number(draft) || 0)}</span>
        </div>
        <Bar value={pct(total, Number(draft) || 0)} color={total > (Number(draft) || 0) ? 'var(--rose)' : 'var(--jade)'} />
      </div>

      <div className="field-label" style={{ marginTop: 6 }}>Category caps <span className="faint">(optional)</span></div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {CATEGORIES.map((c, i) => {
          const meta = CATEGORY_META[c];
          const spent = spentBy.get(c) ?? 0;
          const cap = caps[c] ?? 0;
          const over = cap > 0 && spent > cap;
          return (
            <div key={c} className="list-row" style={{ flexWrap: 'wrap' }}>
              <Tile icon={meta.icon} color={meta.color} size={36} radius={12} />
              <div className="grow">
                <div style={{ fontWeight: 800 }}>{meta.short}</div>
                <div className="faint num" style={{ fontSize: '0.78rem', fontWeight: 700, color: over ? 'var(--rose)' : undefined }}>
                  {money(spent)} spent{cap ? ` of ${money(cap)}` : ''}
                </div>
              </div>
              <input className="input num" style={{ width: 110, padding: '9px 12px', fontSize: '0.9rem' }} inputMode="numeric" placeholder="No cap"
                aria-label={`${meta.short} monthly cap`}
                defaultValue={cap || ''}
                onBlur={e => {
                  const v = Number(e.target.value.replace(/\D/g, '')) || 0;
                  setCaps(prev => {
                    const next = { ...prev };
                    if (v) next[c] = v; else delete next[c];
                    return next;
                  });
                }} />
              {cap > 0 && <div style={{ width: '100%', marginTop: 4 }}><Bar value={pct(spent, cap)} color={over ? 'var(--rose)' : meta.color} delay={i * 0.03} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Settings"><SettingsBody /></Sheet>;
}

export function BudgetsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Budgets"><BudgetsBody /></Sheet>;
}
