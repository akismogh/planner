import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { fmtMoney } from '../utils/format.js';
import { useUITranslate } from '../i18n.jsx';

// Compact axis labels ($1.8M / $600k) so the Y-axis is narrow and the plot
// gets as much width as possible.
function fmtAxisMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
}

// Lines: total assets, expenses, income, net worth.
// Vertical reference lines mark key life events.

// Flag → label/icon map for the life events listed in the hover tooltip.
// Mirrors the Events column in ResultsTable so the chart and table agree.
// `amount` reads the row's dollar figure for that event; `sign` marks it as a
// gain (+, cash in) or loss (−, cash out). Events with no clear cash figure
// (retire, relocation, survivor) leave `amount` undefined → no value shown.
const EVENT_FLAGS = [
  { flag: 'flagRetireMe',        icon: '🎉', label: 'Retire (me)' },
  { flag: 'flagRetireSpouse',    icon: '🎉', label: 'Retire (spouse)' },
  { flag: 'flagSSStartMe',       icon: '🏦', label: 'SS starts (me)' },
  { flag: 'flagSSStartSpouse',   icon: '🏦', label: 'SS starts (spouse)' },
  { flag: 'flagRMDStart',        icon: '💰', label: 'RMDs begin' },
  { flag: 'flagULCancelled',     icon: '📃', label: 'UL cancelled',     amount: (r) => r.ulSurrenderProceeds, sign: 1 },
  { flag: 'flagRentalStart',     icon: '🏘️', label: 'Rental starts',    amount: (r) => r.rentalIncome,     sign: 1 },
  { flag: 'flagVehiclePurchase', icon: '🚗', label: 'Vehicle bought',   amount: (r) => r.vehicleExpense,   sign: -1 },
  { flag: 'flagLoanStart',       icon: '🏦', label: 'Loan taken',       amount: (r) => r.loanProceeds,     sign: 1 },
  { flag: 'flagHouseSold',       icon: '🏠', label: 'House sold (net)', amount: (r) => r.houseSaleProceeds, sign: 1 },
  { flag: 'flagHouseSold',       icon: '🏠', label: 'Home sale fee',    amount: (r) => r.houseSaleFee,      sign: -1 },
  { flag: 'flagJapanMove',       icon: '🌏', label: 'Relocation' },
  { flag: 'flagSurvivor',        icon: '🕯️', label: 'Survivor' },
  { flag: 'flagMoneyOut',        icon: '⚠️', label: 'Money runs out' },
];

// Build the list of events for one projection row. Each entry is
// { text, amount, sign } where amount/sign are optional (omitted when there's
// no meaningful dollar figure). One-time incomes/expenses use the user's
// description and their inflated amount for that year.
function eventsForRow(r, tr = (x) => x) {
  if (!r) return [];
  const out = [];
  for (const e of EVENT_FLAGS) {
    if (!r[e.flag]) continue;
    const raw = e.amount ? Number(e.amount(r)) || 0 : 0;
    const entry = { text: `${e.icon} ${tr(e.label)}` };
    if (e.amount && raw > 0) {
      entry.amount = raw;
      entry.sign = e.sign;
    }
    out.push(entry);
  }
  (r.oneTimeIncomesThisYear || []).forEach((it) =>
    out.push({ text: `💰 ${it.description || tr('One-time income')}`, amount: Number(it.amount) || 0, sign: 1 }));
  (r.oneTimeExpensesThisYear || []).forEach((ot) =>
    out.push({ text: `💸 ${ot.description || tr('One-time expense')}`, amount: Number(ot.amount) || 0, sign: -1 }));
  return out;
}

// Recurring income streams active in a given year (shown EVERY year they pay,
// not just the start year). Each entry is { text, amount } (always a gain).
function incomesForRow(r, tr = (x) => x) {
  if (!r) return [];
  const out = [];
  const add = (text, val) => { if (Number(val) > 0) out.push({ text, amount: Number(val) }); };
  add(tr('🏦 SS (me)'), r.mySS);
  add(tr('🏦 SS (spouse)'), r.spouseSS);
  add(tr('📤 IRA withdrawals'), r.iraIncome);
  add(tr('📤 401k withdrawals'), r.k401Income);
  add(tr('💹 Investment income'), r.investIncome);
  return out;
}

// Custom tooltip: the default money rows, plus a list of that year's events.
function ChartTooltip({ active, payload, label }) {
  const tr = useUITranslate();
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  const events = eventsForRow(row, tr);
  const incomes = incomesForRow(row, tr);
  const year = row?.year;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        {tr('Age')} {label}{year ? ` (${year})` : ''}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-dot" style={{ background: p.color }} />
          <span className="chart-tooltip-name">{p.name}</span>
          <span className="chart-tooltip-val">{fmtMoney(p.value)}</span>
        </div>
      ))}
      {incomes.length > 0 && (
        <div className="chart-tooltip-events">
          <div className="chart-tooltip-subhead">{tr('Income this year')}</div>
          {incomes.map((inc, i) => (
            <div key={i} className="chart-tooltip-event">
              <span className="chart-tooltip-event-label">{inc.text}</span>
              <span className="chart-tooltip-event-amt pos">+{fmtMoney(inc.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <div className="chart-tooltip-events">
          <div className="chart-tooltip-subhead">{tr('Events')}</div>
          {events.map((ev, i) => (
            <div key={i} className="chart-tooltip-event">
              <span className="chart-tooltip-event-label">{ev.text}</span>
              {ev.amount > 0 && (
                <span className={`chart-tooltip-event-amt ${ev.sign < 0 ? 'neg' : 'pos'}`}>
                  {ev.sign < 0 ? '−' : '+'}{fmtMoney(ev.amount)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResultsChart({ rows, markers }) {
  const tr = useUITranslate();
  const [rotated, setRotated] = useState(false);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  // While rotated, size the (pre-rotation) container to the swapped viewport
  // dimensions in JS — vh/vw units are unreliable inside a WebView — and lock
  // page scrolling so only the graph shows.
  useEffect(() => {
    if (!rotated) return undefined;
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('resize', update);
      document.body.style.overflow = '';
    };
  }, [rotated]);

  if (!rows || rows.length === 0) return null;

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 24, right: 14, left: 2, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="myAge" label={{ value: tr('My Age'), position: 'insideBottom', offset: -5 }} />
          <YAxis width={46} tickFormatter={fmtAxisMoney} />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          {/* Total Assets = liquid accounts + home equity (the figure formerly
              shown as "Net Worth"). The separate liquid-only line was removed. */}
          <Line type="monotone" dataKey="cumulativeNetWorth" name={tr('Total Assets')} stroke="#1f6feb" dot={false} strokeWidth={2.5} />
          <Line type="monotone" dataKey="totalExpenses" name={tr('Annual Expenses')} stroke="#d04a3a" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="totalIncome" name={tr('Annual Income')} stroke="#2ea043" dot={false} strokeWidth={2} />
          {/* Cash Position — per-year view. For each age, shows what bank
              would be if no IRA/401k drawdowns: (bank_start + RMD) ×
              (1 + growth) + netCashFlow. Negative = this year's bank
              shortfall (how much more bank cash you'd need THIS year).
              Resets each year — does NOT compound into a giant cumulative
              number. Going below 0 also triggers Money Lasts: No. */}
          <Line type="monotone" dataKey="cumulativeNetCashFlow" name={tr('Cash Position (yr)')} stroke="#f59e0b" dot={false} strokeWidth={2} strokeDasharray="4 2" />
          {/* Zero line — dipping below = bank can't cover this year. */}
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="2 4" label={{ value: tr('$0 cash'), position: 'insideTopLeft', fill: '#ef4444', fontSize: 11, fontWeight: 600 }} />
          {markers.retireAge && (
            <ReferenceLine x={markers.retireAge} stroke="#d04a3a" strokeDasharray="4 4"
              label={{ value: tr('Retire'), position: 'top', fill: '#d04a3a', fontSize: 11 }} />
          )}
          {markers.possibleRetire && markers.possibleRetire !== markers.retireAge && (
            <ReferenceLine x={markers.possibleRetire} stroke="#2ea043" strokeDasharray="4 4"
              label={{ value: tr('Possible'), position: 'top', fill: '#2ea043', fontSize: 11 }} />
          )}
          {markers.ssAge && (
            <ReferenceLine x={markers.ssAge} stroke="#1f6feb" strokeDasharray="2 2"
              label={{ value: 'SS', position: 'top', fill: '#1f6feb', fontSize: 11 }} />
          )}
          {markers.rmdAge && (
            <ReferenceLine x={markers.rmdAge} stroke="#9c6f00" strokeDasharray="2 2"
              label={{ value: 'RMD', position: 'top', fill: '#9c6f00', fontSize: 11 }} />
          )}
          {markers.sellAge && (
            <ReferenceLine x={markers.sellAge} stroke="#8957e5" strokeDasharray="2 2"
              label={{ value: tr('House'), position: 'top', fill: '#8957e5', fontSize: 11 }} />
          )}
          {markers.japanAge && (
            <ReferenceLine x={markers.japanAge} stroke="#d11a2a" strokeDasharray="3 3"
              label={{ value: tr('🌏 Relocation'), position: 'top', fill: '#d11a2a', fontSize: 11 }} />
          )}
          {markers.survivorAge && (
            <ReferenceLine x={markers.survivorAge} stroke="#555" strokeDasharray="3 3"
              label={{ value: tr('Survivor'), position: 'top', fill: '#555', fontSize: 11 }} />
          )}
        </LineChart>
      </ResponsiveContainer>
  );

  // Rotated fullscreen view: the chart alone turned 90° so it fills the screen
  // in landscape while the phone stays in portrait. Dismiss with the ✕ button.
  if (rotated) {
    return (
      <div className="chart-rotate-overlay" role="dialog" aria-label={tr('Retirement Projection')}>
        <button
          className="chart-rotate-close"
          onClick={() => setRotated(false)}
          aria-label={tr('Close')}
        >✕</button>
        <div
          className="chart-rotate-inner"
          style={{ width: `${vp.h}px`, height: `${vp.w}px` }}
        >{chart}</div>
      </div>
    );
  }

  return (
    <div className="chart-wrapper">
      <button
        className="chart-rotate-btn"
        onClick={() => setRotated(true)}
        title={tr('Rotate graph')}
        aria-label={tr('Rotate graph')}
      >
        {/* rotate-device glyph */}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="12" height="14" rx="2" />
          <path d="M15 4a5 5 0 0 1 5 5" />
          <path d="M20 4v3h-3" />
        </svg>
      </button>
      <div className="chart-canvas">{chart}</div>
    </div>
  );
}
