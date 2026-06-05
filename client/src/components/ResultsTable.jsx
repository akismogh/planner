import React from 'react';
import { fmtMoney } from '../utils/format.js';

// Year-by-year table. Header row and the Age/Year column are both sticky
// (frozen). Income/expense columns get ▲/▼ markers when they change
// substantially from the previous year (retirement, SS start, etc.).
//
// A "Monthly Cash Flow" column (annual netCashFlow / 12) gives a quick
// monthly view alongside the annual numbers.

// Column ordering strategy:
//   1. Identity (sticky Age/Year)
//   2. KEY SUMMARY NUMBERS — what you want to see at a glance
//   3. Income detail breakdown
//   4. Expense detail breakdown
//   5. Tax detail
//   6. Per-account asset balances
//   7. Real estate detail (last because it's separate from liquid)
// The `group` field is used to draw a thicker border at section boundaries.
// Each life event has its own color + emoji. Multiple events in the same
// year all render as separate badges in the Events column, so nothing
// hides behind anything else (the old row-tinting approach lost info).
const EVENT_CONFIG = [
  { flag: 'flagRetireMe',      label: 'Retire (me)',   icon: '🎉', cls: 'evt-retire' },
  { flag: 'flagRetireWife',    label: 'Retire (wife)', icon: '🎉', cls: 'evt-retire' },
  { flag: 'flagSSStartMe',     label: 'SS (me)',       icon: '🏦', cls: 'evt-ss' },
  { flag: 'flagSSStartWife',   label: 'SS (wife)',     icon: '🏦', cls: 'evt-ss' },
  { flag: 'flagRMDStart',      label: 'RMD start',     icon: '💰', cls: 'evt-rmd' },
  { flag: 'flagULCancelled',   label: 'UL cancelled',  icon: '📃', cls: 'evt-ul' },
  { flag: 'flagRentalStart',   label: 'Rental start',  icon: '🏘️', cls: 'evt-rental' },
  { flag: 'flagVehiclePurchase', label: 'Vehicle bought', icon: '🚗', cls: 'evt-vehicle' },
  { flag: 'flagLoanStart', label: 'Loan taken', icon: '🏦', cls: 'evt-loan' },
  { flag: 'flagHouseSold',     label: 'House sold',    icon: '🏠', cls: 'evt-house' },
  { flag: 'flagJapanMove',     label: 'Relocation',    icon: '🌏', cls: 'evt-japan' },
  { flag: 'flagSurvivor',      label: 'Survivor',      icon: '🕯️', cls: 'evt-survivor' },
  { flag: 'flagOneTime',       label: 'One-time exp',  icon: '💸', cls: 'evt-onetime' },
  { flag: 'flagMoneyOut',      label: 'Money out',     icon: '⚠️', cls: 'evt-money-out' },
];

function renderEventBadges(row) {
  // Standard events (excluding one-time expense/income, handled below so we
  // can render the user-entered description on each one).
  const active = EVENT_CONFIG.filter(
    (e) => row[e.flag] && e.flag !== 'flagOneTime' && e.flag !== 'flagOneTimeIn'
  );
  const badges = active.map((e) => (
    <span key={e.flag} className={`evt-badge ${e.cls}`}>
      <span className="evt-icon">{e.icon}</span>{e.label}
    </span>
  ));

  // One-time INCOMES: shown FIRST (visually "good news comes first"), with the
  // user's description as the label. Tooltip on hover shows the inflated amount.
  if (row.oneTimeIncomesThisYear && row.oneTimeIncomesThisYear.length > 0) {
    row.oneTimeIncomesThisYear.forEach((it, i) => {
      const amt = Math.round(it.amount || 0).toLocaleString('en-US');
      badges.push(
        <span
          key={`oi-${i}`}
          className="evt-badge evt-onetimein"
          title={`+$${amt}`}
        >
          <span className="evt-icon">💰</span>{it.description}
        </span>
      );
    });
  }

  // One-time EXPENSES: same pattern, distinct color.
  if (row.oneTimeExpensesThisYear && row.oneTimeExpensesThisYear.length > 0) {
    row.oneTimeExpensesThisYear.forEach((ot, i) => {
      const amt = Math.round(ot.amount || 0).toLocaleString('en-US');
      badges.push(
        <span
          key={`ot-${i}`}
          className="evt-badge evt-onetime"
          title={`-$${amt}`}
        >
          <span className="evt-icon">💸</span>{ot.description}
        </span>
      );
    });
  }

  if (badges.length === 0) return null;
  return <div className="event-badges">{badges}</div>;
}

const COLUMNS = [
  // ── 1. Identity ──────────────────────────────────────────────────────
  { key: 'ageYear', label: 'Age / Year', group: 'id' },
  { key: 'events', label: 'Events', group: 'id' },

  // ── 2. KEY SUMMARY NUMBERS (visible immediately) ─────────────────────
  { key: 'totalIncome', label: 'Total Income', money: true, trackChange: true, bold: true, group: 'summary' },
  { key: 'totalExpenses', label: 'Total Expenses', money: true, trackChange: true, bold: true, group: 'summary' },
  { key: 'netCashFlow', label: 'Net Cash Flow (yr)', money: true, bold: true, group: 'summary' },
  { key: 'monthlyCashFlow', label: 'Net Cash Flow (mo)', money: true, group: 'summary' },
  { key: 'cumulativeNetCashFlow', label: 'Cash Position (yr)', money: true, bold: true, group: 'summary' },
  { key: 'bankTotal', label: 'Bank Total', money: true, bold: true, trackChange: true, group: 'summary' },
  { key: 'cumulativeNetWorth', label: 'Total Assets', money: true, bold: true, highlight: 'assets', group: 'summary' },

  // ── 3. Income detail ─────────────────────────────────────────────────
  { key: 'myIncome', label: 'My Income', money: true, trackChange: true, group: 'income' },
  { key: 'wifeIncome', label: "Wife's Income", money: true, trackChange: true, group: 'income' },
  { key: 'mySS', label: 'SS (mine)', money: true, trackChange: true, group: 'income' },
  { key: 'wifeSS', label: 'SS (wife)', money: true, trackChange: true, group: 'income' },
  { key: 'bracketIncome', label: 'Other Income', money: true, trackChange: true, group: 'income' },
  { key: 'rentalIncome', label: 'Rental Income', money: true, trackChange: true, group: 'income' },
  { key: 'oneTimeIncome', label: 'One-Time Income', money: true, group: 'income' },

  // ── 4. Expense detail ────────────────────────────────────────────────
  { key: 'livingAnnual', label: 'Living Exp.', money: true, group: 'expense' },
  { key: 'travelAnnual', label: 'Travel Exp.', money: true, group: 'expense' },
  { key: 'mortgagePayment', label: 'Mortgage', money: true, group: 'expense' },
  { key: 'maintenanceAnnual', label: 'Maintenance', money: true, group: 'expense' },
  { key: 'ulPremium', label: 'UL Premium', money: true, group: 'expense' },
  { key: 'oneTimeExpense', label: 'One-Time Expense', money: true, group: 'expense' },
  { key: 'vehicleExpense', label: 'Vehicle Cost', money: true, group: 'expense' },
  { key: 'loanPayment', label: 'Loan Payment', money: true, group: 'expense' },

  // ── 5. Tax detail ────────────────────────────────────────────────────
  { key: 'rmdGross', label: 'RMD (gross)', money: true, group: 'tax' },
  { key: 'taxesPaid', label: 'Taxes Paid', money: true, group: 'tax' },

  // ── 6. Per-account balances ──────────────────────────────────────────
  { key: 'bank1', label: 'Bank 1', money: true, group: 'asset' },
  { key: 'bank2', label: 'Bank 2', money: true, group: 'asset' },
  { key: 'bank3', label: 'Bank 3', money: true, group: 'asset' },
  { key: 'ulValue', label: 'UL Surrender', money: true, group: 'asset' },
  // Placeholders — expanded into one column per account at render time
  // (IRAs and 401ks are unlimited; see buildColumns below).
  { key: '__iras__', group: 'asset' },
  { key: '__k401s__', group: 'asset' },

  // ── 7. Real estate detail ────────────────────────────────────────────
  { key: 'realEstateValue', label: 'Real Estate', money: true, group: 'realestate' },
  { key: 'loanBalance', label: 'Loan Balance', money: true, group: 'realestate' },
  { key: 'netHomeEquity', label: 'Net Equity', money: true, group: 'realestate' },
];

// Expand the `__iras__` / `__k401s__` placeholders into one column per account,
// using the per-account balance (and nickname for the header) carried on each
// row. The account counts are read from the first row's `iraAccounts` /
// `k401Accounts` arrays, so any number of accounts is supported without
// hardcoding columns.
function buildColumns(rows) {
  const first = rows && rows[0] ? rows[0] : {};
  const expand = (placeholderKey, rowField, prefix, label) => {
    const sample = Array.isArray(first[rowField]) ? first[rowField] : [];
    return sample.map((acc, i) => ({
      key: `${prefix}_${i}`,
      label: acc.nickname ? `${label}: ${acc.nickname}` : `${label} ${i + 1}`,
      money: true,
      group: 'asset',
      get: (r) => (r[rowField] && r[rowField][i] ? r[rowField][i].balance : null),
    }));
  };
  const out = [];
  for (const c of COLUMNS) {
    if (c.key === '__iras__') out.push(...expand('__iras__', 'iraAccounts', 'ira', 'IRA'));
    else if (c.key === '__k401s__') out.push(...expand('__k401s__', 'k401Accounts', 'k401', '401k'));
    else out.push(c);
  }
  return out;
}

// Compute the symbol/colour for a year-over-year change.
// We only flag changes ≥ 5% relative to the previous year (or any change
// that crosses zero) so inflation creep doesn't put arrows everywhere.
function changeMarker(curr, prev) {
  if (prev === null || prev === undefined || curr === null || curr === undefined) return null;
  if (Math.abs(curr - prev) < 1) return null;
  const denom = Math.abs(prev) || 1;
  const pct = (curr - prev) / denom;
  if (Math.abs(pct) < 0.05 && !(curr === 0 && prev !== 0) && !(prev === 0 && curr !== 0)) return null;
  return curr > prev ? 'up' : 'down';
}

// Row-level tinting is now reserved for the single "Money runs out" case
// — a critical danger that you should never miss when scanning the table.
// All other events show as distinct colored badges in the Events column,
// so overlapping events in the same year are all visible side-by-side.
function rowClassForFlags(row) {
  if (row.flagMoneyOut) return 'flag-money-out';
  return '';
}

export default function ResultsTable({ rows }) {
  if (!rows || rows.length === 0) return null;

  // Pre-compute monthly cashflow on each row for the new column.
  const enriched = rows.map((r) => ({ ...r, monthlyCashFlow: r.netCashFlow / 12 }));

  // Expand dynamic columns (e.g. one per IRA account) for this dataset.
  const columns = buildColumns(enriched);

  const exportCSV = () => {
    const header = columns.map((c) => c.label).join(',');
    const lines = enriched.map((r) =>
      columns.map((c) => {
        if (c.key === 'ageYear') return `${r.myAge} (${r.year})`;
        const v = c.get ? c.get(r) : r[c.key];
        if (v === null || v === undefined) return '';
        return c.money ? Math.round(v) : v;
      }).join(',')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'retirement-projection.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="results-table-wrapper">
      <div className="table-actions">
        <button onClick={exportCSV}>Export CSV</button>
        <div className="legend">
          <span className="evt-badge evt-retire">🎉 Retire</span>
          <span className="evt-badge evt-ss">🏦 SS starts</span>
          <span className="evt-badge evt-rmd">💰 RMDs (73)</span>
          <span className="evt-badge evt-ul">📃 UL cancelled</span>
          <span className="evt-badge evt-rental">🏘️ Rental start</span>
          <span className="evt-badge evt-vehicle">🚗 Vehicle bought</span>
          <span className="evt-badge evt-loan">🏦 Loan taken</span>
          <span className="evt-badge evt-house">🏠 House sold</span>
          <span className="evt-badge evt-japan">🌏 Relocation</span>
          <span className="evt-badge evt-survivor">🕯️ Survivor</span>
          <span className="evt-badge evt-onetime">💸 One-time exp</span>
          <span className="evt-badge evt-onetimein">💰 One-time income</span>
          <span className="evt-badge evt-money-out">⚠️ Money out</span>
          <span className="legend-item legend-change"><span className="ch up">▲</span> up &nbsp;<span className="ch down">▼</span> down</span>
        </div>
      </div>
      <div className="scroll-x">
        <table className="results-table">
          <thead>
            <tr>
              {columns.map((c, idx) => {
                const prevGroup = idx > 0 ? columns[idx - 1].group : null;
                const isFirstInGroup = c.group !== prevGroup;
                const stickyCls =
                  c.key === 'ageYear' ? 'sticky-col sticky-col-1'
                  : c.key === 'events' ? 'sticky-col sticky-col-2'
                  : '';
                const cls = [stickyCls, isFirstInGroup ? 'group-start' : '']
                  .filter(Boolean).join(' ');
                return (
                  <th key={c.key} className={cls} data-group={c.group}>
                    {c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {enriched.map((r, idx) => {
              const prev = idx > 0 ? enriched[idx - 1] : null;
              return (
                <tr key={idx} className={rowClassForFlags(r)}>
                  {columns.map((c, idx) => {
                    const prevGroup = idx > 0 ? columns[idx - 1].group : null;
                    const isFirstInGroup = c.group !== prevGroup;
                    if (c.key === 'ageYear') {
                      return (
                        <td key={c.key} className="sticky-col sticky-col-1">
                          <div>{r.myAge} <span className="year-sub">({r.year})</span></div>
                          {r.wifeAge !== undefined && r.wifeAge !== r.myAge && (
                            <div className="wife-age-sub">Wife {r.wifeAge}</div>
                          )}
                        </td>
                      );
                    }
                    if (c.key === 'events') {
                      return (
                        <td key={c.key} className="sticky-col sticky-col-2 events-cell">
                          {renderEventBadges(r)}
                        </td>
                      );
                    }
                    const v = c.get ? c.get(r) : r[c.key];
                    const cls = [];
                    if (c.bold) cls.push('bold');
                    if (c.highlight) cls.push(`col-${c.highlight}`);
                    if (isFirstInGroup) cls.push('group-start');
                    if (v !== null && v < 0) cls.push('neg');
                    let marker = null;
                    if (c.trackChange && prev) {
                      marker = changeMarker(v, c.get ? c.get(prev) : prev[c.key]);
                    }
                    return (
                      <td key={c.key} className={cls.join(' ')}>
                        {c.money ? fmtMoney(v) : v}
                        {marker && <span className={`ch ${marker}`}>{marker === 'up' ? ' ▲' : ' ▼'}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
