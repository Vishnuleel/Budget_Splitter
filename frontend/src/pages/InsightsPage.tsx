import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Plus, Lightbulb } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Pie, PieChart, Cell } from 'recharts';
import { AnimatedNumber, Bar, SectionHead, Tile, rise, stagger } from '../components/ui/primitives';
import FormSheet, { type FormSpec } from '../components/sheets/FormSheet';
import { useData } from '../store/DataContext';
import { useUI } from '../store/UIContext';
import { getSetting, useSetting } from '../lib/settings';
import { CATEGORY_META, categoryMeta, effectiveCategory, isExpense } from '../lib/categories';
import { daysInMonth, daysUntil, inMonth, monthLabel, pct } from '../lib/format';
import type { Subscription, Transaction } from '../lib/types';
import { money, moneyCompact, amt, CURRENCY_CODES } from '../lib/money';

function monthStats(transactions: Transaction[], y: number, m: number) {
  const days = daysInMonth(y, m);
  const daily = Array<number>(days).fill(0);
  const byCat = new Map<string, number>();
  const byMerchant = new Map<string, { total: number; count: number; category: string }>();
  let spent = 0, income = 0, count = 0, abroadCard = 0, fees = 0;
  for (const t of transactions) {
    if (!inMonth(t.date, y, m)) continue;
    const v = amt(t);
    if (t.category === 'Income') { income += v; continue; }
    if (!isExpense(t)) continue;
    spent += v; count++;
    // Non-rupee spends that came in as Indian bank SMS = your Indian card used abroad.
    if ((t.currency ?? 'INR') !== 'INR' && t.raw_text) abroadCard += v;
    if (effectiveCategory(t) === 'Bank fees') fees += v;
    daily[new Date(t.date).getDate() - 1] += v;
    const c = effectiveCategory(t);
    byCat.set(c, (byCat.get(c) ?? 0) + v);
    const mk = t.merchant || 'Unknown';
    const prev = byMerchant.get(mk) ?? { total: 0, count: 0, category: c };
    byMerchant.set(mk, { total: prev.total + v, count: prev.count + 1, category: c });
  }
  return { spent, income, count, daily, byCat, byMerchant, abroadCard, fees };
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  const spent = payload.find(p => p.dataKey === 'cum');
  const day = payload.find(p => p.dataKey === 'day');
  return (
    <div className="chart-tip num">
      <div style={{ opacity: 0.7 }}>Day {label}</div>
      {spent && <div>{money(spent.value)} so far</div>}
      {day && day.value > 0 && <div style={{ opacity: 0.8 }}>{money(day.value)} that day</div>}
    </div>
  );
}

export default function InsightsPage({ hidden }: { hidden: boolean }) {
  const { transactions, subscriptions, insert, update, remove, markSubscriptionPaid } = useData();
  const { setTab, setActivityFilter, openSheet } = useUI();
  const [budget] = useSetting('monthlyBudget');
  const [caps] = useSetting('categoryBudgets');
  const [markup] = useSetting('forexMarkup');
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [dir, setDir] = useState(0);
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const isCurrent = cursor.y === now.getFullYear() && cursor.m === now.getMonth();
  const prev = cursor.m === 0 ? { y: cursor.y - 1, m: 11 } : { y: cursor.y, m: cursor.m - 1 };

  const cur = useMemo(() => monthStats(transactions, cursor.y, cursor.m), [transactions, cursor]);
  const last = useMemo(() => monthStats(transactions, prev.y, prev.m), [transactions, prev.y, prev.m]);

  const shift = (d: number) => {
    setDir(d);
    setPickedDay(null);
    setCursor(c => {
      const mm = c.m + d;
      return { y: c.y + Math.floor(mm / 12), m: ((mm % 12) + 12) % 12 };
    });
  };

  const days = cur.daily.length;
  const lastDay = isCurrent ? now.getDate() : days;
  const chartData = useMemo(() => {
    let cum = 0;
    return cur.daily.map((v, i) => {
      cum += v;
      return { d: i + 1, day: v, cum: i < lastDay ? cum : null, pace: (budget / days) * (i + 1) };
    });
  }, [cur.daily, lastDay, budget, days]);

  const cats = [...cur.byCat.entries()].sort((a, b) => b[1] - a[1]);
  const merchants = [...cur.byMerchant.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const delta = last.spent > 0 ? ((cur.spent - last.spent) / last.spent) * 100 : null;
  const maxDay = Math.max(1, ...cur.daily);
  const firstDow = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7; // Monday-first

  const insights = useMemo(() => {
    const out: { text: string; tone: 'good' | 'bad' | 'neutral' }[] = [];
    if (cur.abroadCard > 0 && markup > 0) {
      const lost = (cur.abroadCard * markup) / 100;
      out.push({ text: `Your Indian card added roughly ${money(lost)} in forex markup this month (${markup}% on ${money(cur.abroadCard)} spent abroad).`, tone: 'bad' });
    }
    if (cur.fees > 0) out.push({ text: `Bank fees charged this month: ${money(cur.fees)}. A zero-markup card or a Swedish account would cut this.`, tone: 'bad' });
    if (cats[0]) out.push({ text: `${CATEGORY_META[cats[0][0]]?.short ?? cats[0][0]} is your biggest spend — ${Math.round(pct(cats[0][1], cur.spent))}% of the month.`, tone: 'neutral' });
    for (const [c, v] of cats.slice(0, 4)) {
      const before = last.byCat.get(c) ?? 0;
      if (before > 0 && Math.abs(v - before) / before > 0.25 && Math.abs(v - before) > 300) {
        const up = v > before;
        out.push({ text: `${CATEGORY_META[c]?.short ?? c} is ${up ? 'up' : 'down'} ${Math.round(Math.abs(v - before) / before * 100)}% vs last month (${money(Math.abs(v - before))}).`, tone: up ? 'bad' : 'good' });
      }
    }
    if (isCurrent && budget > 0) {
      const projected = (cur.spent / Math.max(1, now.getDate())) * days;
      out.push(projected > budget
        ? { text: `At this pace you’ll spend about ${moneyCompact(projected)} — ${moneyCompact(projected - budget)} over budget.`, tone: 'bad' }
        : { text: `On pace for ${moneyCompact(projected)} — about ${moneyCompact(budget - projected)} under budget.`, tone: 'good' });
    }
    if (cur.income > 0) {
      const rate = (cur.income - cur.spent) / cur.income;
      out.push({ text: rate > 0 ? `You kept ${Math.round(rate * 100)}% of what came in this month.` : `Spending is above income this month by ${money(cur.spent - cur.income)}.`, tone: rate > 0.2 ? 'good' : rate > 0 ? 'neutral' : 'bad' });
    }
    const topDay = cur.daily.indexOf(Math.max(...cur.daily));
    if (cur.daily[topDay] > 0) out.push({ text: `Heaviest day: ${topDay + 1} ${new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-IN', { month: 'short' })} with ${money(cur.daily[topDay])}.`, tone: 'neutral' });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, last, budget, isCurrent, markup]);

  const subForm = (s?: Subscription): FormSpec => ({
    title: s ? s.name : 'New bill or subscription',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'Hyra, SL card, Telia, Spotify', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true, half: true },
      { name: 'currency', label: 'Currency', type: 'select', options: CURRENCY_CODES, half: true },
      { name: 'cycle', label: 'Repeats', type: 'select', options: ['Monthly', 'Yearly'], half: true },
      { name: 'next_due_date', label: 'Next due date', type: 'date', half: true },
    ],
    initial: {
      name: s?.name ?? '', amount: s ? String(s.amount) : '', cycle: s?.cycle ?? 'Monthly',
      next_due_date: s?.next_due_date ?? '', currency: s ? s.currency ?? 'INR' : getSetting('entryCurrency'),
    },
    onSubmit: async v => {
      const row = { name: v.name.trim(), amount: Number(v.amount) || 0, cycle: v.cycle, next_due_date: v.next_due_date || null, currency: v.currency };
      return s ? update('subscriptions', s.id, row) : !!(await insert('subscriptions', row));
    },
    onDelete: s ? () => remove('subscriptions', s.id) : undefined,
  });

  const monthlyBills = subscriptions.reduce((a, s) => a + (s.cycle === 'Yearly' ? amt(s) / 12 : amt(s)), 0);

  return (
    <motion.div className="page" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row" style={{ justifyContent: 'space-between' }}>
        <motion.button type="button" className="icon-btn" whileTap={{ scale: 0.88 }} onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={20} /></motion.button>
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div key={`${cursor.y}-${cursor.m}`} custom={dir} className="display" style={{ fontSize: '1.15rem', textAlign: 'center' }}
            initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }}>
            {monthLabel(cursor.y, cursor.m)}
          </motion.div>
        </AnimatePresence>
        <motion.button type="button" className="icon-btn" whileTap={{ scale: 0.88 }} onClick={() => shift(1)} disabled={isCurrent} aria-label="Next month"><ChevronRight size={20} /></motion.button>
      </motion.div>

      <motion.div variants={rise} className="stat-trio">
        <div className="stat">
          <div className="k">Spent</div>
          <div className={`v num${hidden ? ' blurred' : ''}`}><AnimatedNumber value={cur.spent} format={moneyCompact} /></div>
          {delta != null && (
            <span className={`badge ${delta > 0 ? 'bad' : 'good'}`} style={{ marginTop: 6 }}>
              {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(Math.round(delta))}%
            </span>
          )}
        </div>
        <div className="stat">
          <div className="k">Received</div>
          <div className={`v num${hidden ? ' blurred' : ''}`} style={{ color: 'var(--income)' }}><AnimatedNumber value={cur.income} format={moneyCompact} /></div>
          <span className="badge neutral" style={{ marginTop: 6 }}>{cur.count} spends</span>
        </div>
        <div className="stat">
          <div className="k">Kept</div>
          <div className={`v num${hidden ? ' blurred' : ''}`} style={{ color: cur.income - cur.spent >= 0 ? 'var(--ink)' : 'var(--rose)' }}>
            <AnimatedNumber value={cur.income - cur.spent} format={moneyCompact} />
          </div>
          <span className="badge neutral" style={{ marginTop: 6 }}>net</span>
        </div>
      </motion.div>

      {insights.length > 0 && (
        <motion.div variants={rise} className="scroller">
          {insights.map((ins, i) => (
            <motion.div key={ins.text} className="card card-tight" style={{ width: 250, display: 'flex', gap: 10, alignItems: 'flex-start' }}
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }}>
              <span className="tile" style={{ width: 32, height: 32, borderRadius: 10, background: ins.tone === 'good' ? 'var(--income-soft)' : ins.tone === 'bad' ? 'var(--rose-soft)' : 'var(--marigold-soft)', color: ins.tone === 'good' ? 'var(--income)' : ins.tone === 'bad' ? 'var(--rose)' : 'var(--marigold-ink)' }}>
                <Lightbulb size={16} />
              </span>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.4 }}>{ins.text}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      <motion.section variants={rise} className="card">
        <SectionHead title="Budget pace" action={<span className="faint row" style={{ fontSize: '0.78rem', fontWeight: 700, gap: 6 }}><span style={{ width: 14, borderTop: '2px dashed var(--marigold)' }} />on-budget line</span>} />
        <div style={{ height: 190, marginLeft: -10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--jade)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--jade)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11, fontWeight: 700 }} interval={Math.ceil(days / 6) - 1} />
              <YAxis tickLine={false} axisLine={false} width={46} tick={{ fill: 'var(--ink-3)', fontSize: 11, fontWeight: 700 }} tickFormatter={v => moneyCompact(v)} />
              <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--line-strong)' }} />
              {budget > 0 && <Line type="linear" dataKey="pace" stroke="var(--marigold)" strokeDasharray="5 5" strokeWidth={2} dot={false} isAnimationActive={false} />}
              <Area type="monotone" dataKey="cum" stroke="var(--jade)" strokeWidth={3} fill="url(#cumFill)" connectNulls={false} animationDuration={900} />
              <Area type="monotone" dataKey="day" stroke="none" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      <motion.section variants={rise} className="card">
        <SectionHead title="Where it went" />
        {cats.length === 0 ? (
          <div className="empty">No spending recorded in {monthLabel(cursor.y, cursor.m)}.</div>
        ) : (
          <>
            <div style={{ position: 'relative', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={cats.map(([name, value]) => ({ name, value }))} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={3} cornerRadius={6} stroke="none"
                    onMouseEnter={(_, i) => setActiveCat(cats[i][0])} onMouseLeave={() => setActiveCat(null)} onClick={(_, i) => setActiveCat(a => (a === cats[i][0] ? null : cats[i][0]))}>
                    {cats.map(([c]) => <Cell key={c} fill={categoryMeta(c).color} opacity={activeCat && activeCat !== c ? 0.3 : 1} style={{ transition: 'opacity 0.2s', cursor: 'pointer' }} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
                <AnimatePresence mode="wait">
                  <motion.div key={activeCat ?? 'total'} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}>
                    <div className="faint" style={{ fontSize: '0.72rem', fontWeight: 800 }}>{activeCat ? (CATEGORY_META[activeCat]?.short ?? activeCat).toUpperCase() : 'TOTAL'}</div>
                    <div className={`display num${hidden ? ' blurred' : ''}`} style={{ fontSize: '1.15rem' }}>{money(activeCat ? cur.byCat.get(activeCat) ?? 0 : cur.spent)}</div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              {cats.map(([c, v], i) => {
                const meta = categoryMeta(c);
                const cap = caps[c];
                const over = cap && v > cap;
                return (
                  <motion.button key={c} type="button" className="list-row" style={{ width: '100%', flexWrap: 'wrap', textAlign: 'left' }}
                    whileTap={{ scale: 0.98 }} onClick={() => { setActivityFilter(c); setTab('activity'); }}
                    onHoverStart={() => setActiveCat(c)} onHoverEnd={() => setActiveCat(null)}>
                    <Tile icon={meta.icon} color={meta.color} size={36} radius={12} />
                    <div className="grow">
                      <div style={{ fontWeight: 800 }}>{meta.short}</div>
                      <div className="faint" style={{ fontSize: '0.78rem', fontWeight: 700, color: over ? 'var(--rose)' : undefined }}>
                        {Math.round(pct(v, cur.spent))}%{cap ? ` · cap ${moneyCompact(cap)}${over ? ' — over' : ''}` : ''}
                      </div>
                    </div>
                    <div className={`num${hidden ? ' blurred' : ''}`} style={{ fontWeight: 800 }}>{money(v)}</div>
                    <div style={{ width: '100%', marginTop: 8 }}>
                      <Bar value={cap ? pct(v, cap) : pct(v, cats[0][1])} color={over ? 'var(--rose)' : meta.color} delay={0.1 + i * 0.05} />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </>
        )}
      </motion.section>

      <motion.section variants={rise} className="card">
        <SectionHead title="Spending calendar" action={<span className="faint" style={{ fontSize: '0.78rem', fontWeight: 700 }}>darker = more spent</span>} />
        <div className="heatmap" role="grid" aria-label="Daily spending">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="heat-dow">{d}</div>)}
          {Array.from({ length: firstDow }, (_, i) => <div key={`pad${i}`} />)}
          {cur.daily.map((v, i) => {
            const intensity = v > 0 ? 0.18 + 0.82 * (v / maxDay) : 0;
            const future = isCurrent && i + 1 > now.getDate();
            const picked = pickedDay === i;
            return (
              <motion.button
                key={i}
                type="button"
                role="gridcell"
                className="heat-cell num"
                aria-label={`${i + 1}: ${money(v)}`}
                onClick={() => setPickedDay(p => (p === i ? null : i))}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: future ? 0.35 : 1, scale: picked ? 1.12 : 1 }}
                transition={{ delay: i * 0.012, type: 'spring', stiffness: 400, damping: 22 }}
                whileTap={{ scale: 0.9 }}
                style={{
                  background: v > 0 ? `color-mix(in srgb, var(--jade) ${Math.round(intensity * 100)}%, var(--surface-2))` : 'var(--surface-2)',
                  color: intensity > 0.55 ? '#fff' : 'var(--ink-2)',
                  outline: picked ? '2px solid var(--marigold)' : isCurrent && i + 1 === now.getDate() ? '2px solid var(--ink)' : 'none',
                  outlineOffset: 1,
                }}
              >
                {i + 1}
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence>
          {pickedDay != null && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 14, fontWeight: 800 }}>
                <span>{new Date(cursor.y, cursor.m, pickedDay + 1).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                <span className="num">{money(cur.daily[pickedDay])}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {merchants.length > 0 && (
        <motion.section variants={rise} className="card">
          <SectionHead title="Top merchants" />
          {merchants.map(([name, info], i) => {
            const meta = categoryMeta(info.category);
            return (
              <div key={name} className="list-row">
                <span className="display faint num" style={{ width: 18, fontSize: '0.95rem' }}>{i + 1}</span>
                <Tile icon={meta.icon} color={meta.color} size={36} radius={12} />
                <div className="grow">
                  <div style={{ fontWeight: 800 }} className="ellipsis">{name}</div>
                  <div className="faint" style={{ fontSize: '0.78rem', fontWeight: 700 }}>{info.count} payment{info.count > 1 ? 's' : ''}</div>
                </div>
                <div className={`num${hidden ? ' blurred' : ''}`} style={{ fontWeight: 800 }}>{money(info.total)}</div>
              </div>
            );
          })}
        </motion.section>
      )}

      <motion.section variants={rise}>
        <SectionHead
          title="Bills & subscriptions"
          action={
            <motion.button type="button" className="link-btn row" style={{ gap: 4 }} whileTap={{ scale: 0.94 }} onClick={() => setForm(subForm())}>
              <Plus size={16} /> Add
            </motion.button>
          }
        />
        {subscriptions.length === 0 ? (
          <div className="empty">Track rent (hyra), your SL card, phone, gym and streaming. We’ll remind you before they’re due.</div>
        ) : (
          <div className="card" style={{ padding: '4px 16px' }}>
            <div className="row faint" style={{ justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, padding: '10px 0 4px' }}>
              <span>{subscriptions.length} active</span><span className="num">≈ {money(monthlyBills)}/month</span>
            </div>
            {subscriptions.map(s => {
              const d = daysUntil(s.next_due_date);
              const tone = d == null ? 'neutral' : d < 0 ? 'bad' : d <= 3 ? 'warn' : 'good';
              return (
                <div key={s.id} className="list-row">
                  <button type="button" className="grow" style={{ textAlign: 'left' }} onClick={() => setForm(subForm(s))}>
                    <div style={{ fontWeight: 800 }}>{s.name}</div>
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      <span className={`badge ${tone}`}>{d == null ? 'No date' : d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : `Due in ${d}d`}</span>
                      <span className="faint" style={{ fontSize: '0.75rem', fontWeight: 700 }}>{s.cycle}</span>
                    </div>
                  </button>
                  <div className="num" style={{ fontWeight: 800 }}>{money(s.amount, { currency: s.currency ?? 'INR' })}</div>
                  <motion.button type="button" className="btn btn-sm btn-ghost" whileTap={{ scale: 0.92 }} onClick={() => markSubscriptionPaid(s, true)}>Paid</motion.button>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={() => openSheet({ kind: 'budgets' })}>Edit budgets →</button>
      </motion.section>

      <FormSheet spec={form} onClose={() => setForm(null)} />
    </motion.div>
  );
}
