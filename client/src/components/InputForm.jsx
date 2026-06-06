import React, { useState, useRef } from 'react';
import { calcLoanPayment, calcTotalInterest, ageFromDOB } from '../utils/calculations.js';
import { isBrowserStorage, exportDataToFile, importDataFromFile } from '../api.js';
import { useT } from '../i18n.jsx';
// (calcTotalInterest is used by both Loan and Vehicle tables to display
// the amortization total interest column live as the user types.)

// ─────────────────────────────────────────────────────────────────────────────
// InputForm — all fields, organized into collapsible sections.
// Receives separate onSave and onCalculate handlers from App.
// ─────────────────────────────────────────────────────────────────────────────

export function defaultInputs() {
  return {
    personal: {
      myDOB: '',
      wifeDOB: '',
      // Life expectancy. The simulation runs to MY life expectancy.
      // Without a survivor scenario, we assume both spouses reach this age
      // together (no single-household period). Wife's separate life
      // expectancy ONLY matters in the survivor scenario when I pass first —
      // it's defined inside `survivor.wifeLifeExpectancy`.
      lifeExpectancy: 90,
      inflationRate: 3.0,
      // Minimum cash reserve to keep in bank accounts. Withdrawals stop
      // pulling from banks once they collectively reach this floor; the
      // simulation then dips into IRA/401k instead.
      emergencyFund: 0,
      // Spend-down strategy: when ON, the engine proactively withdraws
      // from IRA/401k each year (using the annuity formula) targeting $0
      // balance by life expectancy. Net withdrawal lands in bank, taxes
      // paid as usual. When OFF (default), accounts are only tapped on
      // shortfall (legacy behavior) — often leaves substantial balance.
      autoDepleteRetirement: false,
    },
    income: {
      myIncome: 0,
      wifeIncome: 0,
      myRetirementAge: 65,
      wifeRetirementAge: 65,
      // Annual nominal growth of working income (raises + COLA).
      // Set equal to inflation for "real income stays flat" (typical assumption).
      // Set to 0 for "no raises" (nominal stays flat; real shrinks).
      // Set higher than inflation for career growth.
      incomeGrowthRate: 3.0,
    },
    banks: [
      { nickname: '', balance: 0, growthRate: 2.0 },
      { nickname: '', balance: 0, growthRate: 2.0 },
      { nickname: '', balance: 0, growthRate: 2.0 },
    ],
    // Auto-invest excess bank cash: when enabled, any bank total above
    // `threshold` earns `returnRate` each year as investment income (added to
    // income, lands back in the bank). Models sweeping idle cash into a
    // brokerage/HYSA. Threshold is nominal (not inflated), like emergencyFund.
    bankInvest: {
      enabled: false,
      threshold: 0,
      returnRate: 5.0,
    },
    ul: {
      surrenderValue: 0,
      monthlyPremium: 0,
      // Monthly insurance cost/fee portion of the premium. The premium minus
      // this fee is the amount that actually funds the cash (surrender) value,
      // compounding at growthRate. The full premium still leaves take-home.
      monthlyFee: 0,
      growthRate: 3.5,
      cancelAge: 0,
    },
    // accountType: 'traditional' (pre-tax) or 'roth' (post-tax).
    // withdrawalTaxRate: effective tax rate when drawing from this account
    // in retirement. Roth accounts effectively ignore it (set to 0 anyway).
    // earliestWithdrawalAge: IRS-friendly withdrawal age. The engine won't
    // pull from this account before this age. Default 60 (just above the
    // IRS 59½ threshold to avoid the 10% early-withdrawal penalty).
    iras: [
      { nickname: '', balance: 0, monthlyContrib: 0, growthRate: 7.0, stopContribAge: 65, accountType: 'traditional', withdrawalTaxRate: 22, earliestWithdrawalAge: 60 },
      { nickname: '', balance: 0, monthlyContrib: 0, growthRate: 7.0, stopContribAge: 65, accountType: 'traditional', withdrawalTaxRate: 22, earliestWithdrawalAge: 60 },
      { nickname: '', balance: 0, monthlyContrib: 0, growthRate: 7.0, stopContribAge: 65, accountType: 'traditional', withdrawalTaxRate: 22, earliestWithdrawalAge: 60 },
    ],
    // companyMonthlyMatch: employer match in DOLLARS per month (not a percent).
    // E.g. if you contribute $500/mo and employer matches dollar-for-dollar, enter 500.
    // If they match 50% of yours, enter 250. If no match, 0.
    k401s: [
      { nickname: '', balance: 0, monthlyContrib: 0, companyMonthlyMatch: 0, growthRate: 7.0, stopContribAge: 65, accountType: 'traditional', withdrawalTaxRate: 22, earliestWithdrawalAge: 60 },
      { nickname: '', balance: 0, monthlyContrib: 0, companyMonthlyMatch: 0, growthRate: 7.0, stopContribAge: 65, accountType: 'traditional', withdrawalTaxRate: 22, earliestWithdrawalAge: 60 },
      { nickname: '', balance: 0, monthlyContrib: 0, companyMonthlyMatch: 0, growthRate: 7.0, stopContribAge: 65, accountType: 'traditional', withdrawalTaxRate: 22, earliestWithdrawalAge: 60 },
    ],
    realEstate: {
      value: 0,
      loanBalance: 0,
      apr: 0,
      monthlyPayment: 0,
      extraPrincipal: 0,
      appreciationRate: 3.0,
      sellAge: 0,
      // One-time selling cost as % of the sale price (realtor commission +
      // closing costs, typically ~5–6%). Deducted from sale proceeds in the
      // year the house is sold (direct sale or end-of-rental sale).
      saleFeeRate: 6.0,
      // Maintenance auto-computed as % of current home value each year.
      // Property tax is assumed escrowed into the monthly mortgage payment
      // (typical PITI setup) — do NOT enter it separately to avoid double-counting.
      maintenanceRate: 1.0,
    },
    // ── Home rental option ──
    // Instead of selling, rent the house out starting AT MY RETIREMENT AGE
    // (auto-derived from income.myRetirementAge — not a separate field).
    // While rental is enabled:
    //   - `monthlyRentIncome` adds to total income.
    //   - `monthlyMaintenanceRate` REPLACES realEstate.maintenanceRate.
    //   - `extraPrincipalDuringRental` REPLACES realEstate.extraPrincipal.
    //   - `oneTimeSetupCost` hits exactly the year rental starts.
    //   - `sellAge` (0 = never): if set, rental ends at this age and the
    //     house is sold — net equity goes into bank. Real Estate's own
    //     sellAge is IGNORED when rental is enabled (this one takes over).
    rental: {
      enabled: false,
      // 0 = start at retirement age (default). Set a value to rent the house
      // out at a specific age (e.g. 60 while still working to 65).
      startAge: 0,
      oneTimeSetupCost: 0,
      monthlyRentIncome: 0,
      // Rents typically grow at their own pace (can be higher OR lower than
      // CPI depending on market). Applied year-over-year from today (not
      // from rental start) since you enter rent in today's dollars.
      annualRentIncrease: 3.0,
      monthlyMaintenanceRate: 2.0,
      extraPrincipalDuringRental: 0,
      sellAge: 0,
    },
    // ── New Home purchase (move-up / second primary residence) ──
    // Buy a new home at `purchaseAge`. The price is the NOMINAL price you pay
    // that year. Down payment leaves the bank; a new mortgage (APR + term)
    // starts; the home appreciates and accrues maintenance; equity counts
    // toward net worth. Combine with the Rental option to model "rent the old
    // house, buy a new one."
    newHome: {
      enabled: false,
      purchaseAge: 60,
      price: 0,
      downPayment: 0,
      apr: 6.5,
      loanTermYears: 30,
      appreciationRate: 3.0,
      maintenanceRate: 1.0,
      sellAge: 0,
      saleFeeRate: 6.0,
    },
    ss: {
      mySSAmount: 0,
      mySSAge: 67,
      wifeSSAmount: 0,
      wifeSSAge: 67,
    },
    // Expense brackets are now an array of up to 5 user-defined age ranges.
    // Each has fromAge / toAge plus the per-category monthly costs. The
    // calc engine picks the bracket whose range contains the current age.
    // If ranges overlap, the first match wins. If there's a gap, the nearest
    // earlier bracket is used as a fallback.
    expenseBrackets: [
      { fromAge: 50, toAge: 59, ...emptyBracket() },
      { fromAge: 60, toAge: 69, ...emptyBracket() },
      { fromAge: 70, toAge: 79, ...emptyBracket() },
      { fromAge: 80, toAge: 89, ...emptyBracket() },
      { fromAge: 90, toAge: 100, ...emptyBracket() },
    ],
    // 20 slots for one-time large purchases (wedding, car, renovation, etc.).
    // Amount is in today's dollars and gets inflation-adjusted to the year
    // it's spent. `enabled` toggles inclusion in the simulation.
    oneTimeExpenses: Array.from({ length: 20 }, () => ({
      enabled: true,
      description: '',
      age: 0,
      amount: 0,
    })),
    // 5 slots for one-time large incomes (inheritance, asset sale, settlement,
    // bonus). Amount is in today's dollars and inflation-adjusted to the year
    // it lands. Deposited into Bank 1 in that year.
    oneTimeIncomes: Array.from({ length: 5 }, () => ({
      enabled: true,
      description: '',
      age: 0,
      amount: 0,
    })),
    // 5 slots for loans (personal, HELOC, education, etc.). Each has:
    //   - description: free text (e.g. "Kids' college", "Kitchen reno HELOC")
    //   - person: 'self' or 'wife' (informational)
    //   - age: my age when the loan starts
    //   - amount: principal received (today's dollars, inflated to start year)
    //   - durationYears: loan term in YEARS
    //   - apr: annual percentage rate
    // Loan proceeds (the principal) are deposited into Bank 1 at start age.
    // Monthly payment is calculated via standard amortization formula and
    // deducted from cash flow every month for `durationYears * 12` months.
    loans: Array.from({ length: 5 }, () => ({
      // Enabled toggle (default true) lets you keep loan parameters defined
      // but turn the loan on/off for the simulation without losing data.
      enabled: true,
      description: '',
      person: 'self',
      age: 0,
      amount: 0,
      durationYears: 0,
      apr: 0,
    })),
    // 8 slots for vehicle purchases (cars / motorcycles). Each purchase has:
    //   - description: 'car' or 'motorcycle'
    //   - person: 'self' or 'wife'
    //   - age: my age at purchase
    //   - cost: total purchase price (used in loan calc)
    //   - down: cash paid at purchase (hits bank that year)
    //   - monthsToPay: loan duration in months (e.g. 60 = 5-yr loan)
    //   - apr: annual interest rate for the loan (%)
    // Monthly payment is AUTO-CALCULATED from (cost - down), months, APR
    // using the standard amortization formula. All amounts in today's
    // dollars; inflation factor locks at the purchase year.
    vehicles: Array.from({ length: 8 }, () => ({
      description: 'car',
      person: 'self',
      age: 0,
      cost: 0,
      down: 0,
      monthsToPay: 0,
      apr: 0,
    })),
    // ── Japan relocation ──
    // When enabled, at moveAge:
    //  - Living expenses get multiplied by `costMultiplier` (Japan typically
    //    25% cheaper than US outside Tokyo).
    //  - Retirement withdrawals use `withdrawalTaxRate` instead of the
    //    per-account US rate (Japan taxes worldwide income after 5 yrs).
    //  - House sale is governed solely by Real Estate.sellAge — set it
    //    explicitly to your planned sale year.
    japan: {
      enabled: false,
      moveAge: 60,
      costMultiplier: 0.75,
      withdrawalTaxRate: 20,
    },
    // ── Survivor scenario ──
    // At eventAge, one spouse passes — chosen by `whoFirst` ('wife' or 'me').
    // The deceased's income ends, the surviving spouse keeps the LARGER of
    // the two SS checks (SSA survivor rule), and household living expenses
    // scale by expenseFactor (typically 0.70–0.80 for one person).
    //
    // wifeLifeExpectancy is ONLY used when whoFirst === 'me' to extend the
    // simulation past my life expectancy (wife survives alone). Otherwise
    // we assume both reach my life expectancy together.
    survivor: {
      enabled: false,
      eventAge: 80,
      whoFirst: 'wife',
      expenseFactor: 0.75,
      wifeLifeExpectancy: 92,
    },
    // ── Monte Carlo ──
    // Re-runs the simulation N times with randomized annual returns
    // (normal distribution around your growth rates) to estimate the
    // probability your plan survives. Volatility = standard deviation
    // of returns in percentage points.
    monteCarlo: {
      enabled: false,
      runs: 500,
      volatility: 15,
    },
    // ── Saved scenarios (up to 5) ──
    // Each filled slot snapshots ALL planning inputs at the moment Save was
    // clicked (excluding the scenarios array itself, to avoid recursion).
    // Empty slots are stored as null. Persisted in data.json so they
    // survive across sessions.
    scenarios: [null, null, null, null, null],
  };
}

function emptyBracket() {
  return {
    housing: 0, auto: 0, grocery: 0, insurance: 0,
    medical: 0, other: 0, tripsPerYear: 0, costPerTrip: 0,
    // Other monthly income that applies during this age range (rental income,
    // part-time work in retirement, pension, royalty, side hustle). Counted
    // as income, not subtracted from expenses.
    additionalIncome: 0,
  };
}

// Blank IRA row, matching the default shape in defaultInputs(). Used by the
// "Add IRA" button so any number of accounts can be tracked.
function emptyIRA() {
  return {
    nickname: '', balance: 0, monthlyContrib: 0, growthRate: 7.0,
    stopContribAge: 65, accountType: 'traditional', withdrawalTaxRate: 22,
    earliestWithdrawalAge: 60,
  };
}

// Blank-row factories for the other unlimited collections, each matching the
// shape used in defaultInputs(). Used by the "Add …" buttons.
function emptyK401() {
  return {
    nickname: '', balance: 0, monthlyContrib: 0, companyMonthlyMatch: 0,
    growthRate: 7.0, stopContribAge: 65, accountType: 'traditional',
    withdrawalTaxRate: 22, earliestWithdrawalAge: 60,
  };
}
function emptyOneTime() {
  return { enabled: true, description: '', age: 0, amount: 0 };
}
function emptyLoan() {
  return { enabled: true, description: '', person: 'self', age: 0, amount: 0, durationYears: 0, apr: 0 };
}
function emptyVehicle() {
  return { description: 'car', person: 'self', age: 0, cost: 0, down: 0, monthsToPay: 0, apr: 0 };
}
function emptyBracketRow() {
  return { fromAge: 0, toAge: 0, ...emptyBracket() };
}

// Tiny formatter used inline next to the SS dropdown.
function formatAdjusted(fraAmount, age) {
  const f = SS_FACTORS[age] ?? 1;
  const v = Math.round((Number(fraAmount) || 0) * f);
  return `$${v.toLocaleString('en-US')}`;
}

// ── Primitive field components ────────────────────────────────────────────────
// NumberField renders an empty string when the underlying value is 0/null/undefined
// so the user can type freely without a leading "0" sitting in the box. The
// onChange still writes 0 to state when the field is cleared, so calculations
// always have a number to work with.
function NumberField({ label, value, onChange, hint, step = 1, required, placeholder }) {
  const display =
    value === 0 || value === null || value === undefined || value === '' ? '' : value;
  return (
    <label className={`field${required ? ' required' : ''}`}>
      <span className="field-label">
        {label}{required && <span className="req-star"> *</span>}
        {hint && <em className="hint"> — {hint}</em>}
      </span>
      <input
        type="number"
        step={step}
        value={display}
        placeholder={placeholder ?? '0'}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </label>
  );
}

// Generic single-select dropdown. `options` is an array of { value, label }.
// On change, we look up the matching option and pass its ORIGINAL value back
// (preserving string vs number type). Without this, picking "Roth" would
// become Number('roth') = NaN and snap back to the first option.
function SelectField({ label, value, onChange, options, hint, required }) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return (
    <label className={`field${required ? ' required' : ''}`}>
      <span className="field-label">
        {label}{required && <span className="req-star"> *</span>}
        {hint && <em className="hint"> — {hint}</em>}
      </span>
      <select
        value={stringValue}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          onChange(match ? match.value : raw);
        }}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}

// ── Social Security adjustment factors ────────────────────────────────────────
// Assumes Full Retirement Age (FRA) = 67, which applies to anyone born in 1960
// or later. Numbers below come straight from SSA's benefit-by-claim-age table.
// The user inputs their estimated FRA-67 benefit; we multiply by the factor
// for the age they actually file.
export const SS_FACTORS = {
  62: 0.70,   // -30% (earliest filing age)
  63: 0.75,
  64: 0.80,
  65: 0.8667,
  66: 0.9333,
  67: 1.00,   // Full Retirement Age
  68: 1.08,   // +8% per year of delay
  69: 1.16,
  70: 1.24,   // +24% (latest age that yields a credit)
};

export const SS_AGE_OPTIONS = Object.entries(SS_FACTORS).map(([age, factor]) => {
  const a = Number(age);
  const pct = Math.round((factor - 1) * 100);
  const sign = pct > 0 ? `+${pct}%` : pct < 0 ? `${pct}%` : 'full';
  return { value: a, label: `Age ${a}  (${sign})` };
});

function TextField({ label, value, onChange, hint }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em className="hint"> — {hint}</em>}
      </span>
      <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function DateField({ label, value, onChange, required }) {
  return (
    <label className={`field${required ? ' required' : ''}`}>
      <span className="field-label">
        {label}{required && <span className="req-star"> *</span>}
      </span>
      <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function makeSetter(setData, path) {
  return (value) => {
    setData((prev) => {
      const next = structuredClone(prev);
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      cur[path[path.length - 1]] = value;
      return next;
    });
  };
}

// (SaveBadge removed: the save button itself shows the saved state inline,
// so the layout doesn't shift when status changes.)

// ── Main form ─────────────────────────────────────────────────────────────────
export default function InputForm({
  data, setData,
  onSave, onCalculate,
  saving, saveStatus,
  validationErrors,
  scenarioHandlers,
  onImportData,
}) {
  const t = useT();
  const set = (path) => makeSetter(setData, path);
  const scenarios = data.scenarios || [null, null, null, null, null];

  // Public (GitHub Pages) build → data lives in the browser only. Show a
  // privacy banner + export/import controls so users can back up their data.
  const browserMode = isBrowserStorage();
  const importInputRef = useRef(null);
  const handleImportFile = (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    importDataFromFile(file)
      .then((parsed) => onImportData && onImportData(parsed))
      .catch((err) => alert('Import failed: ' + err.message));
    ev.target.value = ''; // allow re-importing the same file later
  };

  // Generic add/remove for the unlimited collections. `key` is the field on
  // `data` (e.g. 'iras'); `factory` produces a blank row to append.
  const addRow = (key, factory) => () =>
    setData((prev) => ({ ...prev, [key]: [...(prev[key] || []), factory()] }));
  const removeRow = (key) => (idx) =>
    setData((prev) => ({ ...prev, [key]: (prev[key] || []).filter((_, i) => i !== idx) }));

  const addIRA = addRow('iras', emptyIRA);
  const removeIRA = removeRow('iras');
  const addK401 = addRow('k401s', emptyK401);
  const removeK401 = removeRow('k401s');
  const addOneTimeExpense = addRow('oneTimeExpenses', emptyOneTime);
  const removeOneTimeExpense = removeRow('oneTimeExpenses');
  const addOneTimeIncome = addRow('oneTimeIncomes', emptyOneTime);
  const removeOneTimeIncome = removeRow('oneTimeIncomes');
  const addLoan = addRow('loans', emptyLoan);
  const removeLoan = removeRow('loans');
  const addVehicle = addRow('vehicles', emptyVehicle);
  const removeVehicle = removeRow('vehicles');
  const addBracket = addRow('expenseBrackets', emptyBracketRow);
  const removeBracket = removeRow('expenseBrackets');
  // Duplicate: insert a deep copy of bracket `idx` immediately after it, so you
  // can clone a filled-in age range and just tweak the ages/amounts.
  const duplicateBracket = (idx) =>
    setData((prev) => {
      const arr = [...prev.expenseBrackets];
      arr.splice(idx + 1, 0, { ...prev.expenseBrackets[idx] });
      return { ...prev, expenseBrackets: arr };
    });

  return (
    <div className="input-form">
      <h1>{t('app.title')}</h1>
      {browserMode ? (
        <>
          <p className="subtitle">{t('app.subtitle.browser')}</p>
          <div className="data-toolbar">
            <button type="button" className="btn-data" onClick={() => exportDataToFile(data)}>
              {t('toolbar.export')}
            </button>
            <button type="button" className="btn-data" onClick={() => importInputRef.current?.click()}>
              {t('toolbar.import')}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <span className="data-toolbar-note">{t('toolbar.note')}</span>
          </div>
        </>
      ) : (
        <p className="subtitle">{t('app.subtitle.local')}</p>
      )}

      {/* ── Saved scenarios bar (top of form) ── */}
      <div className="scenario-bar">
        <div className="scenario-bar-title">
          📁 Saved Scenarios <em className="hint">— snapshot the current inputs to a slot, then load or compare later</em>
        </div>
        <div className="scenario-cards">
          {scenarios.map((sc, i) => (
            <ScenarioCard
              key={i}
              slotIdx={i}
              scenario={sc}
              handlers={scenarioHandlers}
            />
          ))}
        </div>
      </div>

      {/* ── Validation errors ── */}
      {validationErrors.length > 0 && (
        <div className="validation-box">
          <strong>Please fix the following before calculating:</strong>
          <ul>
            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── GROUP: You & Income ── */}
      <h2 className="form-group-header">{t('group.youIncome')}</h2>

      {/* ── Personal Info ── */}
      <details open>
        <summary>{t('sec.personal')}</summary>
        <p className="section-note">
          Inflation is applied automatically to all future expenses and incomes.
          Enter all dollar amounts in <strong>today's dollars</strong>; the
          simulator will inflate them year-by-year.
        </p>
        <div className="grid-2">
          <DateField label="My date of birth" value={data.personal.myDOB}
            onChange={set(['personal', 'myDOB'])} required />
          <DateField label="Wife's date of birth" value={data.personal.wifeDOB}
            onChange={set(['personal', 'wifeDOB'])} required />
          <NumberField label="Life expectancy (age)" value={data.personal.lifeExpectancy}
            onChange={set(['personal', 'lifeExpectancy'])} required
            hint="when the simulation ends. Without a survivor scenario, both spouses are assumed to reach this age together" />
          <NumberField label="Annual inflation rate (%)" value={data.personal.inflationRate}
            onChange={set(['personal', 'inflationRate'])} step={0.1} />
          <NumberField label="Emergency fund (do not draw below)"
            value={data.personal.emergencyFund}
            onChange={set(['personal', 'emergencyFund'])}
            hint="bank withdrawals stop at this floor; shortfalls then pull from IRA/401k" />
          <SelectField label="Auto-deplete retirement accounts"
            value={data.personal.autoDepleteRetirement ? 1 : 0}
            onChange={(v) => set(['personal', 'autoDepleteRetirement'])(Boolean(v))}
            options={[
              { value: 0, label: 'No — only withdraw on shortfall (default)' },
              { value: 1, label: 'Yes — proactively drain to $0 by life exp' },
            ]}
            hint="Yes targets $0 balance by life expectancy using the annuity formula; net withdrawals land in bank" />
        </div>
      </details>

      {/* ── Income ── */}
      <details open>
        <summary>{t('sec.income')}</summary>
        <p className="section-note">
          Enter <strong>monthly take-home (after-tax)</strong> income. The simulation
          multiplies by 12 internally and adjusts for inflation each year.<br />
          <strong>Each year these are subtracted from total income</strong> to compute
          net cash flow: living expenses, travel, mortgage P&amp;I, property tax,
          maintenance, UL insurance premiums, all IRA contributions, and Roth 401k
          contributions. Surplus flows into Bank&nbsp;1; deficit is pulled from banks
          (down to your emergency fund), then IRAs, then 401k. Traditional 401k
          contributions are <em>not</em> deducted because they're already excluded
          from your after-tax take-home before you reported it.
        </p>
        <div className="grid-2">
          <NumberField label="My monthly after-tax income" value={data.income.myIncome}
            onChange={set(['income', 'myIncome'])} hint="net of taxes and deductions" />
          <NumberField label="Wife's monthly after-tax income" value={data.income.wifeIncome}
            onChange={set(['income', 'wifeIncome'])} hint="net of taxes and deductions" />
          <NumberField label="My retirement age" value={data.income.myRetirementAge}
            onChange={set(['income', 'myRetirementAge'])} required
            hint="income stops; calculation also finds earliest possible age" />
          <NumberField label="Wife's retirement age" value={data.income.wifeRetirementAge}
            onChange={set(['income', 'wifeRetirementAge'])} />
          <NumberField label="Annual income growth rate (%)"
            value={data.income.incomeGrowthRate}
            onChange={set(['income', 'incomeGrowthRate'])}
            step={0.1}
            hint="how much your salary grows year-over-year. Set = inflation for COLA-matching raises; 0 for no raises; >inflation for career growth" />
        </div>
      </details>

      {/* ── GROUP: Savings & Investments ── */}
      <h2 className="form-group-header">{t('group.savings')}</h2>

      {/* ── Banks ── */}
      <details>
        <summary>{t('sec.banks')}</summary>

        {/* ── Auto-invest excess cash ──
            Sweep idle bank cash above a threshold into investments earning a
            higher return. The estimate below is based on your CURRENT bank
            total; the simulation applies it year-by-year. */}
        {(() => {
          const bankTotalNow = (data.banks || []).reduce((s, b) => s + (Number(b.balance) || 0), 0);
          const inv = data.bankInvest || {};
          const threshold = Number(inv.threshold) || 0;
          const rate = Number(inv.returnRate) || 0;
          const excess = Math.max(0, bankTotalNow - threshold);
          const estIncome = excess * (rate / 100);
          const fmt = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
          return (
            <div className="card" style={{ borderColor: inv.enabled ? '#2ea043' : undefined }}>
              <h4 style={{ marginBottom: 10 }}>
                💹 Auto-invest excess cash{' '}
                {inv.enabled
                  ? <span className="hint">— active: excess above the threshold earns the return below</span>
                  : <span className="hint">— enable to invest idle cash above a threshold</span>}
              </h4>
              <div className="grid-3">
                <SelectField label="Enable auto-invest"
                  value={inv.enabled ? 1 : 0}
                  onChange={(v) => set(['bankInvest', 'enabled'])(Boolean(v))}
                  options={[{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }]} />
                <NumberField label="Invest bank total above ($)"
                  value={inv.threshold}
                  onChange={set(['bankInvest', 'threshold'])}
                  hint="keep this much in cash; invest the rest" />
                <NumberField label="Expected annual return (%)"
                  value={inv.returnRate}
                  onChange={set(['bankInvest', 'returnRate'])}
                  step={0.1}
                  hint="return earned on the invested excess" />
              </div>
              <div className="bracket-totals" style={{ marginTop: 12 }}>
                <div className="bracket-totals-row">
                  <span>Current bank total</span>
                  <span className="amount">{fmt(bankTotalNow)}</span>
                </div>
                <div className="bracket-totals-row">
                  <span>Investable excess (above {fmt(threshold)})</span>
                  <span className="amount">{fmt(excess)}</span>
                </div>
                <div className="bracket-totals-row bracket-totals-grandtotal income-row">
                  <span>Estimated annual interest income (@ {rate}%)</span>
                  <span className="amount">{fmt(estIncome)}</span>
                </div>
                <div className="bracket-totals-sub">
                  <em>Estimate uses your current bank total. The projection recomputes
                  this each year from that year's start-of-year bank balance.</em>
                </div>
              </div>
            </div>
          );
        })()}

        {data.banks.map((b, i) => (
          <div key={i} className="card">
            <h4>Bank Account {i + 1} <em className="hint">(leave blank if unused)</em></h4>
            <div className="grid-3">
              <TextField label="Nickname" value={b.nickname}
                onChange={set(['banks', i, 'nickname'])} />
              <NumberField label="Current balance" value={b.balance}
                onChange={set(['banks', i, 'balance'])} />
              <NumberField label="Annual growth rate (%)" value={b.growthRate}
                onChange={set(['banks', i, 'growthRate'])} step={0.1} />
            </div>
          </div>
        ))}
      </details>

      {/* ── Universal Life ── */}
      <details>
        <summary>{t('sec.ul')}</summary>
        <div className="card">
          <div className="grid-2">
            <NumberField label="Current surrender value" value={data.ul.surrenderValue}
              onChange={set(['ul', 'surrenderValue'])} />
            <NumberField label="Monthly premium" value={data.ul.monthlyPremium}
              onChange={set(['ul', 'monthlyPremium'])}
              hint="full amount deducted from monthly income" />
            <NumberField label="Monthly insurance fee" value={data.ul.monthlyFee}
              onChange={set(['ul', 'monthlyFee'])}
              hint="cost/fee portion of the premium; the rest funds the cash value and compounds at the growth rate" />
            <NumberField label="Annual growth rate (%)" value={data.ul.growthRate}
              onChange={set(['ul', 'growthRate'])} step={0.1} />
            <NumberField label="Cancel policy at age" value={data.ul.cancelAge}
              onChange={set(['ul', 'cancelAge'])}
              hint="surrender value added to liquid assets" />
          </div>
          {(() => {
            const prem = Number(data.ul.monthlyPremium) || 0;
            const fee = Number(data.ul.monthlyFee) || 0;
            const toCash = Math.max(0, prem - fee);
            const fmt = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
            if (prem <= 0) return null;
            return (
              <div className="bracket-totals" style={{ marginTop: 12 }}>
                <div className="bracket-totals-row">
                  <span>Monthly premium (from take-home)</span>
                  <span className="amount">{fmt(prem)}</span>
                </div>
                <div className="bracket-totals-row">
                  <span>− Insurance fee (cost of coverage)</span>
                  <span className="amount">−{fmt(fee)}</span>
                </div>
                <div className="bracket-totals-row bracket-totals-subtotal income-row">
                  <span>→ Into cash value (compounds at {Number(data.ul.growthRate) || 0}%)</span>
                  <span className="amount">{fmt(toCash)}/mo · {fmt(toCash * 12)}/yr</span>
                </div>
                {fee > prem && (
                  <div className="bracket-totals-sub" style={{ color: 'var(--red)' }}>
                    ⚠ Fee exceeds premium — nothing is added to the cash value.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </details>

      {/* ── IRAs ── */}
      <details>
        <summary>{t('sec.iras')}</summary>
        <p className="section-note">
          <strong>Traditional</strong>: contributions are post-tax (already excluded
          from your take-home if you're auto-funding it), withdrawals are taxed. RMDs
          required starting at age 73.<br />
          <strong>Roth</strong>: contributions and withdrawals are both tax-free in retirement. No RMDs.<br />
          Add as many accounts as you need — each gets its own column in the results table.<br />
          <strong>⚠ Tax is a flat estimate:</strong> withdrawals use the single
          "withdrawal tax rate" you enter below — the simulator does <em>not</em>
          model progressive tax brackets. A large one-year withdrawal (e.g. cashing
          out a big chunk after 59½) would in reality be taxed much higher as it pushes
          you into top brackets, so this tool understates the cost of lump-sum
          withdrawals. Spreading withdrawals over many years is more tax-efficient.
        </p>
        {data.iras.map((a, i) => (
          <div key={i} className="card">
            <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>IRA {i + 1} <em className="hint">(leave blank if unused)</em></span>
              {data.iras.length > 1 && (
                <button
                  type="button"
                  className="btn-danger-sm"
                  onClick={() => removeIRA(i)}
                  title="Remove this IRA account"
                >
                  🗑 Remove
                </button>
              )}
            </h4>
            <div className="grid-3">
              <TextField label="Nickname" value={a.nickname}
                onChange={set(['iras', i, 'nickname'])} />
              <NumberField label="Current balance" value={a.balance}
                onChange={set(['iras', i, 'balance'])} />
              <SelectField label="Account type"
                value={a.accountType ?? 'traditional'}
                onChange={(v) => set(['iras', i, 'accountType'])(v)}
                options={[
                  { value: 'traditional', label: 'Traditional (taxed on withdrawal)' },
                  { value: 'roth', label: 'Roth (tax-free withdrawal)' },
                ]} />
              <NumberField label="Monthly contribution" value={a.monthlyContrib}
                onChange={set(['iras', i, 'monthlyContrib'])}
                hint="deducted from monthly income" />
              <NumberField label="Annual growth rate (%)" value={a.growthRate}
                onChange={set(['iras', i, 'growthRate'])} step={0.1} />
              <NumberField label="Stop contribution at age" value={a.stopContribAge}
                onChange={set(['iras', i, 'stopContribAge'])} />
              <NumberField label="Earliest withdrawal age" value={a.earliestWithdrawalAge}
                onChange={set(['iras', i, 'earliestWithdrawalAge'])}
                hint="IRS rule: 59½ to avoid 10% penalty; default 60. Engine blocks draws before this age" />
              <NumberField label="Withdrawal tax rate (%)" value={a.withdrawalTaxRate}
                onChange={set(['iras', i, 'withdrawalTaxRate'])}
                step={0.5}
                hint="flat effective fed+state rate applied to every withdrawal (no bracket modeling); ignored for Roth" />
            </div>
          </div>
        ))}
        <button type="button" className="btn-primary-sm" onClick={addIRA}
          style={{ marginTop: 4 }}>
          ＋ Add IRA
        </button>
      </details>

      {/* ── 401ks ── */}
      <details>
        <summary>{t('sec.k401s')}</summary>
        <p className="section-note">
          <strong>Traditional 401k</strong>: pre-tax payroll deduction — NOT subtracted
          again from your after-tax take-home; withdrawals are taxed. RMDs at 73.<br />
          <strong>Roth 401k</strong>: post-tax payroll deduction — IS subtracted from
          take-home; withdrawals tax-free. No RMDs (as of 2024).<br />
          <strong>Company match</strong> is added to the balance but doesn't affect cash flow.<br />
          Add as many accounts as you need — each gets its own column in the results table.<br />
          <strong>⚠ Tax is a flat estimate:</strong> withdrawals use the single
          "withdrawal tax rate" you enter below — the simulator does <em>not</em>
          model progressive tax brackets. A large one-year withdrawal (e.g. cashing
          out a big chunk after 59½) would in reality be taxed much higher as it pushes
          you into top brackets, so this tool understates the cost of lump-sum
          withdrawals. Spreading withdrawals over many years is more tax-efficient.
        </p>
        {data.k401s.map((a, i) => (
          <div key={i} className="card">
            <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>401k {i + 1} <em className="hint">(leave blank if unused)</em></span>
              {data.k401s.length > 1 && (
                <button type="button" className="btn-danger-sm" onClick={() => removeK401(i)}
                  title="Remove this 401k account">🗑 Remove</button>
              )}
            </h4>
            <div className="grid-3">
              <TextField label="Nickname" value={a.nickname}
                onChange={set(['k401s', i, 'nickname'])} />
              <NumberField label="Current balance" value={a.balance}
                onChange={set(['k401s', i, 'balance'])} />
              <SelectField label="Account type"
                value={a.accountType ?? 'traditional'}
                onChange={(v) => set(['k401s', i, 'accountType'])(v)}
                options={[
                  { value: 'traditional', label: 'Traditional (pre-tax)' },
                  { value: 'roth', label: 'Roth (post-tax)' },
                ]} />
              <NumberField label="My monthly contribution ($)" value={a.monthlyContrib}
                onChange={set(['k401s', i, 'monthlyContrib'])}
                hint="comes out of monthly take-home (Roth) or pre-tax (Traditional)" />
              <NumberField label="Company monthly match ($)" value={a.companyMonthlyMatch}
                onChange={set(['k401s', i, 'companyMonthlyMatch'])}
                hint="employer's $ contribution per month — does NOT come from your income" />
              <NumberField label="Annual growth rate (%)" value={a.growthRate}
                onChange={set(['k401s', i, 'growthRate'])} step={0.1} />
              <NumberField label="Stop contribution at age" value={a.stopContribAge}
                onChange={set(['k401s', i, 'stopContribAge'])} />
              <NumberField label="Earliest withdrawal age" value={a.earliestWithdrawalAge}
                onChange={set(['k401s', i, 'earliestWithdrawalAge'])}
                hint="IRS rule: 59½ to avoid 10% penalty (55 if separated from this employer). Default 60" />
              <NumberField label="Withdrawal tax rate (%)" value={a.withdrawalTaxRate}
                onChange={set(['k401s', i, 'withdrawalTaxRate'])}
                step={0.5}
                hint="flat effective fed+state rate applied to every withdrawal (no bracket modeling); ignored for Roth" />
            </div>
          </div>
        ))}
        <button type="button" className="btn-primary-sm" onClick={addK401}
          style={{ marginTop: 4 }}>
          ＋ Add 401k
        </button>
      </details>

      {/* ── Social Security (last in Savings & Investments) ── */}
      <details>
        <summary>{t('sec.ss')}</summary>
        <p className="section-note">
          Enter the monthly benefit your SSA statement projects at <strong>Full Retirement
          Age (67)</strong>. Choosing a different claim age automatically scales the
          benefit using SSA's standard reduction / delayed-credit table:
          age 62 = 70%, 65 = 86.7%, 67 = 100%, 70 = 124%.<br />
          <strong>Spousal benefit is applied automatically</strong>: if one spouse's own
          benefit is less than 50% of the other's <em>FRA</em> benefit, SSA pays their
          own benefit first, then adds a <strong>spousal top-off</strong> to bring the
          total up to that 50% mark. The 50% target is locked to the higher earner's
          age-67 amount (delaying their claim past FRA does not raise it), and the
          top-off is reduced if the receiving spouse claims early (~32.5% at 62). The
          top-off only starts once the higher earner has actually filed. So when both
          file at FRA and the lower earner qualifies, the household total is up to 150%
          of the higher earner's FRA benefit.
        </p>
        <div className="card">
          <h4>Mine</h4>
          <div className="grid-2">
            <NumberField label="Estimated monthly benefit at FRA (67)"
              value={data.ss.mySSAmount}
              onChange={set(['ss', 'mySSAmount'])} />
            <SelectField label="Benefit start age"
              value={data.ss.mySSAge}
              onChange={set(['ss', 'mySSAge'])}
              options={SS_AGE_OPTIONS}
              hint={`adjusted: ${formatAdjusted(data.ss.mySSAmount, data.ss.mySSAge)} /mo`} />
          </div>
        </div>
        <div className="card">
          <h4>Wife's</h4>
          <div className="grid-2">
            <NumberField label="Estimated monthly benefit at FRA (67)"
              value={data.ss.wifeSSAmount}
              onChange={set(['ss', 'wifeSSAmount'])} />
            <SelectField label="Benefit start age"
              value={data.ss.wifeSSAge}
              onChange={set(['ss', 'wifeSSAge'])}
              options={SS_AGE_OPTIONS}
              hint={`adjusted: ${formatAdjusted(data.ss.wifeSSAmount, data.ss.wifeSSAge)} /mo`} />
          </div>
        </div>
      </details>

      {/* ── GROUP: Home & Property ── */}
      <h2 className="form-group-header">{t('group.home')}</h2>

      {/* ── Real Estate ── */}
      <details>
        <summary>{t('sec.realEstate')}</summary>
        <div className="card">
          <div className="grid-2">
            <NumberField label="Estimated current value" value={data.realEstate.value}
              onChange={set(['realEstate', 'value'])} />
            <NumberField label="Current loan balance" value={data.realEstate.loanBalance}
              onChange={set(['realEstate', 'loanBalance'])} />
            <NumberField label="APR (%)" value={data.realEstate.apr}
              onChange={set(['realEstate', 'apr'])} step={0.01} />
            <NumberField label="Monthly mortgage payment (P&I)"
              value={data.realEstate.monthlyPayment}
              onChange={set(['realEstate', 'monthlyPayment'])}
              hint="0 if paid off" />
            <NumberField label="Extra monthly principal" value={data.realEstate.extraPrincipal}
              onChange={set(['realEstate', 'extraPrincipal'])} />
            <NumberField label="Annual appreciation rate (%)" value={data.realEstate.appreciationRate}
              onChange={set(['realEstate', 'appreciationRate'])} step={0.1} />
            <NumberField label="Age to sell house" value={data.realEstate.sellAge}
              onChange={set(['realEstate', 'sellAge'])}
              hint="net equity deposited to liquid assets" />
            <NumberField label="Home sale fee (%)" value={data.realEstate.saleFeeRate}
              onChange={set(['realEstate', 'saleFeeRate'])}
              step={0.1}
              hint="one-time selling cost as % of sale price (realtor + closing, ~5–6%); deducted from proceeds when sold" />
            <NumberField label="Maintenance rate (%)"
              value={data.realEstate.maintenanceRate}
              onChange={set(['realEstate', 'maintenanceRate'])}
              step={0.1}
              hint="annual % of home value (rule of thumb 1%). Property tax is assumed escrowed in your mortgage payment." />
          </div>
        </div>
      </details>

      {/* ── Home Rental Option ── */}
      <details>
        <summary>{t('sec.rental')}</summary>
        <p className="section-note">
          Instead of selling outright, rent the house out starting on your
          <strong> retirement birthday</strong> (age {data.income.myRetirementAge || '—'}).
          The house keeps appreciating, you collect rent income, but you incur higher
          maintenance and one-time setup costs. Mortgage P&amp;I continues normally.<br />
          <strong>When rental is enabled, Real Estate → "Age to sell house" is
          ignored.</strong> Use the rental section's own <em>"Sell rental at age"</em>
          field instead — set it to 0 to hold the rental through life expectancy,
          or to a specific age to sell after renting for a while.
        </p>
        <div className="card">
          <div className="grid-2">
            <SelectField label="Enable rental option"
              value={data.rental?.enabled ? 1 : 0}
              onChange={(v) => set(['rental', 'enabled'])(Boolean(v))}
              options={[{ value: 0, label: 'No (sell-only or keep)' }, { value: 1, label: 'Yes' }]} />
            <NumberField label="Start renting at age"
              value={data.rental?.startAge}
              onChange={set(['rental', 'startAge'])}
              hint={`0 = your retirement age (${data.income.myRetirementAge || '—'}). Set e.g. 60 to rent out earlier while still working.`} />
            <NumberField label="One-time setup cost (today's $)"
              value={data.rental?.oneTimeSetupCost}
              onChange={set(['rental', 'oneTimeSetupCost'])}
              hint="initial repairs, agent fees, vacancy buffer — hits the year rental starts" />
            <NumberField label="Estimated monthly rent income"
              value={data.rental?.monthlyRentIncome}
              onChange={set(['rental', 'monthlyRentIncome'])}
              hint="net of estimated taxes (in today's dollars; grows annually per rate below)" />
            <NumberField label="Annual rent increase rate (%)"
              value={data.rental?.annualRentIncrease}
              onChange={set(['rental', 'annualRentIncrease'])}
              step={0.1}
              hint="rents often grow faster than CPI in strong markets, slower in soft ones — typical 2–4%" />
            <NumberField label="Rental maintenance rate (%)"
              value={data.rental?.monthlyMaintenanceRate}
              onChange={set(['rental', 'monthlyMaintenanceRate'])}
              step={0.1}
              hint="annual % of home value; rentals typically 1.5–3% (turnover + wear)" />
            <NumberField label="Extra monthly principal during rental"
              value={data.rental?.extraPrincipalDuringRental}
              onChange={set(['rental', 'extraPrincipalDuringRental'])}
              hint="redirect rent income to faster payoff; replaces Real Estate's extra principal during rental phase" />
            <NumberField label="Sell rental at age"
              value={data.rental?.sellAge}
              onChange={set(['rental', 'sellAge'])}
              hint="0 = never sell (hold through life expectancy). Otherwise rental ends and house sells at this age; net equity goes to bank." />
          </div>
        </div>
      </details>

      {/* ── New Home Purchase ── */}
      <details>
        <summary>{t('sec.newHome')}</summary>
        <p className="section-note">
          Buy a new primary residence at a chosen age — e.g. while you rent out the
          current house. The <strong>price is what you actually pay that year</strong>
          (nominal). The down payment leaves your bank; a new mortgage starts; the home
          appreciates and accrues maintenance; its equity counts toward net worth.
          Monthly payment is auto-calculated from price, down, APR and term.
        </p>
        <div className="card">
          <div className="grid-2">
            <SelectField label="Enable new home purchase"
              value={data.newHome?.enabled ? 1 : 0}
              onChange={(v) => set(['newHome', 'enabled'])(Boolean(v))}
              options={[{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }]} />
            <NumberField label="Purchase at age"
              value={data.newHome?.purchaseAge}
              onChange={set(['newHome', 'purchaseAge'])} />
            <NumberField label="Purchase price (nominal at that age)"
              value={data.newHome?.price}
              onChange={set(['newHome', 'price'])}
              hint="what you pay when you buy (e.g. 1,200,000)" />
            <NumberField label="Down payment"
              value={data.newHome?.downPayment}
              onChange={set(['newHome', 'downPayment'])}
              hint="cash from bank at purchase; rest is financed" />
            <NumberField label="Mortgage APR (%)"
              value={data.newHome?.apr}
              onChange={set(['newHome', 'apr'])} step={0.01} />
            <NumberField label="Mortgage term (years)"
              value={data.newHome?.loanTermYears}
              onChange={set(['newHome', 'loanTermYears'])} />
            <NumberField label="Appreciation rate (%/yr)"
              value={data.newHome?.appreciationRate}
              onChange={set(['newHome', 'appreciationRate'])} step={0.1} />
            <NumberField label="Maintenance rate (%/yr of value)"
              value={data.newHome?.maintenanceRate}
              onChange={set(['newHome', 'maintenanceRate'])} step={0.1} />
            <NumberField label="Sell new home at age"
              value={data.newHome?.sellAge}
              onChange={set(['newHome', 'sellAge'])}
              hint="0 = never sell (hold through life expectancy)" />
            <NumberField label="Sale fee rate (%)"
              value={data.newHome?.saleFeeRate}
              onChange={set(['newHome', 'saleFeeRate'])} step={0.1}
              hint="realtor + closing, deducted from proceeds when sold" />
          </div>
          {/* Live monthly payment preview */}
          {(() => {
            const financed = Math.max(0, (Number(data.newHome?.price) || 0) - (Number(data.newHome?.downPayment) || 0));
            const term = Number(data.newHome?.loanTermYears) || 0;
            const mo = financed > 0 && term > 0 ? calcLoanPayment(financed, term, Number(data.newHome?.apr) || 0) : 0;
            const tot = financed > 0 && term > 0 ? calcTotalInterest(financed, term, Number(data.newHome?.apr) || 0) : 0;
            return mo > 0 ? (
              <p className="section-note" style={{ marginTop: 10, marginBottom: 0 }}>
                Financed: <strong>${Math.round(financed).toLocaleString('en-US')}</strong> ·
                Monthly P&amp;I: <strong style={{ color: '#5b21b6' }}>${Math.round(mo).toLocaleString('en-US')}</strong> ·
                Total interest: <strong style={{ color: '#b45309' }}>${Math.round(tot).toLocaleString('en-US')}</strong>
              </p>
            ) : null;
          })()}
        </div>
      </details>

      {/* ── GROUP: Spending & One-Time Events ── */}
      <h2 className="form-group-header">{t('group.spending')}</h2>

      {/* ── Expense Brackets ── */}
      <details>
        <summary>{t('sec.brackets')} <em className="hint">{t('sec.required')}</em></summary>
        <p className="section-note">
          Define as many custom age ranges as you need. Inflation is applied automatically.
          If ranges overlap, the first match wins. If there's a gap, the nearest
          earlier bracket carries forward.
        </p>

        {/* ── Relocation cost adjustment ──
            Full relocation controls live here (the standalone Japan Relocation
            section was removed). When enabled, from the move age onward: living
            + travel costs scale by the multiplier, and retirement-account
            withdrawals use the relocation withdrawal tax rate. Each bracket
            below shows its cost before vs. after the move. */}
        <div className="card" style={{ borderColor: data.japan?.enabled ? '#db2777' : undefined }}>
          <h4 style={{ marginBottom: 10 }}>
            🌏 Relocation cost adjustment{' '}
            {data.japan?.enabled
              ? <span className="hint">— active: each bracket below shows before/after</span>
              : <span className="hint">— enable to apply a cost-of-living + tax change at the move age</span>}
          </h4>
          <div className="grid-2">
            <SelectField label="Enable relocation scenario"
              value={data.japan.enabled ? 1 : 0}
              onChange={(v) => set(['japan', 'enabled'])(Boolean(v))}
              options={[{ value: 0, label: 'No (stay put)' }, { value: 1, label: 'Yes' }]} />
            <NumberField label="Age when I move"
              value={data.japan.moveAge}
              onChange={set(['japan', 'moveAge'])}
              hint="from this age, living + travel scale by the multiplier and the withdrawal tax rate applies" />
            <NumberField label="Cost-of-living multiplier"
              value={data.japan.costMultiplier}
              onChange={set(['japan', 'costMultiplier'])}
              step={0.05}
              hint="1.0 = same as now; 0.9 ≈ 10% cheaper; 0.75 ≈ 25% cheaper" />
            <NumberField label="Withdrawal tax rate after move (%)"
              value={data.japan.withdrawalTaxRate}
              onChange={set(['japan', 'withdrawalTaxRate'])}
              step={0.5}
              hint="replaces each account's US rate after the move; ≈ 20% common for Japan" />
          </div>
          <p className="section-note" style={{ margin: '10px 0 0' }}>
            <strong>House sale:</strong> set Real Estate → "Age to sell house" to the year
            you plan to sell (often aligned to your move age). The simulator follows that field.
          </p>
        </div>

        {data.expenseBrackets.map((b, i) => (
          <BracketEditor
            key={i}
            index={i}
            bracket={b}
            setBracket={set(['expenseBrackets', i])}
            data={data}
            japan={data.japan}
            onDuplicate={() => duplicateBracket(i)}
            onRemove={data.expenseBrackets.length > 1 ? () => removeBracket(i) : null}
          />
        ))}
        <button type="button" className="btn-primary-sm" onClick={addBracket}
          style={{ marginTop: 4 }}>
          ＋ Add age range
        </button>
      </details>

      {/* ── One-Time Expenses ── */}
      <details>
        <summary>{t('sec.oneTimeExp')}</summary>
        <p className="section-note">
          Plan for big lumpy costs — wedding gifts, a new car, kitchen renovation,
          a special trip, college tuition, RV. Enter amounts in today's dollars
          (inflation is applied automatically to the year it happens). These come
          out of bank accounts first; if banks run low, the engine taps IRA/401k
          per the usual waterfall.
        </p>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setData((prev) => ({
              ...prev,
              oneTimeExpenses: [...prev.oneTimeExpenses].sort((a, b) => {
                // Empty rows (no amount OR no age) go to the bottom.
                const aEmpty = !Number(a.amount) || !Number(a.age);
                const bEmpty = !Number(b.amount) || !Number(b.age);
                if (aEmpty && bEmpty) return 0;
                if (aEmpty) return 1;
                if (bEmpty) return -1;
                return (Number(a.age) || 0) - (Number(b.age) || 0);
              }),
            }))}
            title="Reorder the list ascending by age. Empty rows move to the bottom."
          >
            ↑ Sort by Age
          </button>
        </div>
        <div className="onetime-table">
          <div className="onetime-header">
            <div title="Include in calculation?">Use</div>
            <div>Description</div>
            <div>My Age</div>
            <div>Amount (today's $)</div>
            <div></div>
          </div>
          {data.oneTimeExpenses.map((e, i) => {
            const enabled = e.enabled !== false;
            // Inflate the today's-dollar amount to the purchase year, matching the
            // engine: amount × (1 + inflationRate)^(age − currentAge).
            const myCurrentAge = ageFromDOB(data.personal.myDOB);
            const yearsOut = (Number(e.age) || 0) - myCurrentAge;
            const inflatedAmount =
              Number(e.amount) > 0 && Number(e.age) > 0 && yearsOut > 0
                ? Number(e.amount) *
                  Math.pow(1 + (Number(data.personal.inflationRate) || 0) / 100, yearsOut)
                : null;
            return (
              <div key={i} className={`onetime-row${enabled ? '' : ' onetime-row-disabled'}`}>
                <select
                  className="onetime-enabled"
                  value={enabled ? 'yes' : 'no'}
                  onChange={(ev) => set(['oneTimeExpenses', i, 'enabled'])(ev.target.value === 'yes')}
                  title="Yes = include; No = ignore but keep the values"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <input
                  type="text"
                  placeholder={`e.g. ${[
                    'Wedding gift', 'New car', 'Kitchen reno', 'Family trip',
                    'College tuition', 'RV purchase', 'Roof replacement', 'Boat',
                    'Down payment', 'Solar panels', 'HVAC replacement', 'Bathroom reno',
                    'Anniversary trip', 'Grandkid gift', 'Major medical', 'Long-term care',
                    'Charity donation', 'Second home', 'New car #2', 'Final expenses',
                  ][i] || ''}`}
                  value={e.description}
                  onChange={(ev) => set(['oneTimeExpenses', i, 'description'])(ev.target.value)}
                />
                <input
                  type="number"
                  placeholder="age"
                  value={e.age === 0 ? '' : e.age}
                  onChange={(ev) => set(['oneTimeExpenses', i, 'age'])(ev.target.value === '' ? 0 : Number(ev.target.value))}
                />
                <div className="onetime-amount-cell">
                  <input
                    type="number"
                    placeholder="0"
                    value={e.amount === 0 ? '' : e.amount}
                    onChange={(ev) => set(['oneTimeExpenses', i, 'amount'])(ev.target.value === '' ? 0 : Number(ev.target.value))}
                  />
                  {inflatedAmount !== null && (
                    <span
                      className="onetime-inflated"
                      style={{ display: 'block', textAlign: 'right', fontSize: '11px', color: 'var(--muted)', marginTop: 2, paddingRight: 8 }}
                      title={`Inflation-adjusted to age ${e.age} at ${data.personal.inflationRate || 0}%/yr`}
                    >
                      ≈ ${Math.round(inflatedAmount).toLocaleString('en-US')} at age {e.age}
                    </span>
                  )}
                </div>
                <button type="button" className="onetime-remove"
                  onClick={() => removeOneTimeExpense(i)}
                  title="Remove this row">🗑</button>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-primary-sm" onClick={addOneTimeExpense}
          style={{ marginTop: 8 }}>
          ＋ Add expense
        </button>
      </details>

      {/* ── One-Time Incomes ── */}
      <details>
        <summary>{t('sec.oneTimeInc')}</summary>
        <p className="section-note">
          Big lumpy windfalls — inheritance, sale of a business or asset, lawsuit
          settlement, signing bonus. Amounts in today's dollars (inflated to the
          year they land). Deposited into Bank&nbsp;1 in that year.
        </p>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setData((prev) => ({
              ...prev,
              oneTimeIncomes: [...prev.oneTimeIncomes].sort((a, b) => {
                const aEmpty = !Number(a.amount) || !Number(a.age);
                const bEmpty = !Number(b.amount) || !Number(b.age);
                if (aEmpty && bEmpty) return 0;
                if (aEmpty) return 1;
                if (bEmpty) return -1;
                return (Number(a.age) || 0) - (Number(b.age) || 0);
              }),
            }))}
            title="Reorder ascending by age. Empty rows move to the bottom."
          >
            ↑ Sort by Age
          </button>
        </div>
        <div className="onetime-table">
          <div className="onetime-header">
            <div title="Include in calculation?">Use</div>
            <div>Description</div>
            <div>My Age</div>
            <div>Amount (today's $)</div>
            <div></div>
          </div>
          {data.oneTimeIncomes.map((e, i) => {
            const enabled = e.enabled !== false;
            return (
              <div key={i} className={`onetime-row${enabled ? '' : ' onetime-row-disabled'}`}>
                <select
                  className="onetime-enabled"
                  value={enabled ? 'yes' : 'no'}
                  onChange={(ev) => set(['oneTimeIncomes', i, 'enabled'])(ev.target.value === 'yes')}
                  title="Yes = include; No = ignore but keep the values"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <input
                  type="text"
                  placeholder={`e.g. ${[
                    'Inheritance', 'Sale of business', 'Lawsuit settlement',
                    'Signing bonus', 'Stock vesting',
                  ][i] || ''}`}
                  value={e.description}
                  onChange={(ev) => set(['oneTimeIncomes', i, 'description'])(ev.target.value)}
                />
                <input
                  type="number"
                  placeholder="age"
                  value={e.age === 0 ? '' : e.age}
                  onChange={(ev) => set(['oneTimeIncomes', i, 'age'])(ev.target.value === '' ? 0 : Number(ev.target.value))}
                />
                <input
                  type="number"
                  placeholder="0"
                  value={e.amount === 0 ? '' : e.amount}
                  onChange={(ev) => set(['oneTimeIncomes', i, 'amount'])(ev.target.value === '' ? 0 : Number(ev.target.value))}
                />
                <button type="button" className="onetime-remove"
                  onClick={() => removeOneTimeIncome(i)}
                  title="Remove this row">🗑</button>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-primary-sm" onClick={addOneTimeIncome}
          style={{ marginTop: 8 }}>
          ＋ Add income
        </button>
      </details>

      {/* ── Loans ── */}
      <details>
        <summary>{t('sec.loans')}</summary>
        <p className="section-note">
          Personal loans, HELOC, education loans, etc. The principal is deposited
          into Bank 1 at the start age (so use this in conjunction with a one-time
          expense if the loan funds a purchase). Monthly payments are
          auto-calculated from amount, duration, and APR using the standard
          amortization formula — shown live in the rightmost column.
        </p>
        <div className="loan-table">
          <div className="loan-header">
            <div title="Include in calculation?">Use</div>
            <div>Description</div>
            <div>Person</div>
            <div>Age</div>
            <div>Amount</div>
            <div>Years</div>
            <div>APR (%)</div>
            <div>Monthly</div>
            <div>Total Interest</div>
            <div></div>
          </div>
          {data.loans.map((loan, i) => {
            const enabled = loan.enabled !== false; // default true
            const monthly = calcLoanPayment(loan.amount, loan.durationYears, loan.apr);
            const totalInterest = calcTotalInterest(loan.amount, loan.durationYears, loan.apr);
            return (
              <div key={i} className={`loan-row${enabled ? '' : ' loan-row-disabled'}`}>
                <select
                  value={enabled ? 'yes' : 'no'}
                  onChange={(ev) => set(['loans', i, 'enabled'])(ev.target.value === 'yes')}
                  title="Yes = include this loan in the simulation; No = ignore but keep the values"
                  className="loan-enabled"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <input type="text"
                  placeholder={`e.g. ${['Kids college', 'Kitchen HELOC', 'Personal loan', 'Bridge loan', 'Family loan'][i] || ''}`}
                  value={loan.description}
                  onChange={(ev) => set(['loans', i, 'description'])(ev.target.value)} />
                <select
                  value={loan.person || 'self'}
                  onChange={(ev) => set(['loans', i, 'person'])(ev.target.value)}>
                  <option value="self">Self</option>
                  <option value="wife">Wife</option>
                </select>
                <input type="number" placeholder="age"
                  value={loan.age === 0 ? '' : loan.age}
                  onChange={(ev) => set(['loans', i, 'age'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <input type="number" placeholder="amount"
                  value={loan.amount === 0 ? '' : loan.amount}
                  onChange={(ev) => set(['loans', i, 'amount'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <input type="number" placeholder="years"
                  value={loan.durationYears === 0 ? '' : loan.durationYears}
                  onChange={(ev) => set(['loans', i, 'durationYears'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <input type="number" step="0.01" placeholder="apr"
                  value={loan.apr === 0 ? '' : loan.apr}
                  onChange={(ev) => set(['loans', i, 'apr'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <div className="loan-monthly">
                  {monthly > 0 ? `$${Math.round(monthly).toLocaleString('en-US')}` : '—'}
                </div>
                <div className="loan-interest" title="Total interest paid over the loan's life (monthly × months − principal)">
                  {totalInterest > 0 ? `$${Math.round(totalInterest).toLocaleString('en-US')}` : '—'}
                </div>
                <button type="button" className="row-remove"
                  onClick={() => removeLoan(i)} title="Remove this loan">🗑</button>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-primary-sm" onClick={addLoan}
          style={{ marginTop: 8 }}>
          ＋ Add loan
        </button>
      </details>

      {/* ── Vehicle Purchases ── */}
      <details>
        <summary>{t('sec.vehicles')}</summary>
        <p className="section-note">
          Plan for cars and motorcycles. Enter <strong>cost, down, months, and APR</strong> —
          the monthly payment is auto-calculated using the standard amortization
          formula on the financed amount (cost − down). All amounts are in today's
          dollars; inflation is locked at the purchase year (payments stay constant
          in nominal terms once you buy).
        </p>
        <div className="vehicle-table">
          <div className="vehicle-header">
            <div>Description</div>
            <div>Person</div>
            <div>Age</div>
            <div>Cost</div>
            <div>Down</div>
            <div>Months</div>
            <div>APR (%)</div>
            <div>Monthly</div>
            <div>Total Interest</div>
            <div></div>
          </div>
          {data.vehicles.map((v, i) => {
            const financed = Math.max(0, (Number(v.cost) || 0) - (Number(v.down) || 0));
            const months = Number(v.monthsToPay) || 0;
            const apr = Number(v.apr) || 0;
            const monthly = financed > 0 && months > 0
              ? calcLoanPayment(financed, months / 12, apr)
              : 0;
            const totalInterest = financed > 0 && months > 0
              ? calcTotalInterest(financed, months / 12, apr)
              : 0;
            return (
              <div key={i} className="vehicle-row">
                <select
                  value={v.description || 'car'}
                  onChange={(ev) => set(['vehicles', i, 'description'])(ev.target.value)}
                >
                  <option value="car">🚗 Car</option>
                  <option value="motorcycle">🏍️ Motorcycle</option>
                </select>
                <select
                  value={v.person || 'self'}
                  onChange={(ev) => set(['vehicles', i, 'person'])(ev.target.value)}
                >
                  <option value="self">Self</option>
                  <option value="wife">Wife</option>
                </select>
                <input type="number" placeholder="age"
                  value={v.age === 0 ? '' : v.age}
                  onChange={(ev) => set(['vehicles', i, 'age'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <input type="number" placeholder="cost"
                  value={v.cost === 0 ? '' : v.cost}
                  onChange={(ev) => set(['vehicles', i, 'cost'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <input type="number" placeholder="down"
                  value={v.down === 0 ? '' : v.down}
                  onChange={(ev) => set(['vehicles', i, 'down'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <input type="number" placeholder="months"
                  value={v.monthsToPay === 0 ? '' : v.monthsToPay}
                  onChange={(ev) => set(['vehicles', i, 'monthsToPay'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <input type="number" step="0.01" placeholder="apr"
                  value={v.apr === 0 ? '' : v.apr}
                  onChange={(ev) => set(['vehicles', i, 'apr'])(ev.target.value === '' ? 0 : Number(ev.target.value))} />
                <div className="vehicle-monthly" title="Auto-calculated: cost − down financed over months at APR">
                  {monthly > 0 ? `$${Math.round(monthly).toLocaleString('en-US')}` : '—'}
                </div>
                <div className="vehicle-interest" title="Total interest paid over the loan's life (monthly × months − financed)">
                  {totalInterest > 0 ? `$${Math.round(totalInterest).toLocaleString('en-US')}` : '—'}
                </div>
                <button type="button" className="row-remove"
                  onClick={() => removeVehicle(i)} title="Remove this vehicle">🗑</button>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-primary-sm" onClick={addVehicle}
          style={{ marginTop: 8 }}>
          ＋ Add vehicle
        </button>
      </details>

      {/* Japan Relocation section removed — its controls (enable, move age,
          cost multiplier, withdrawal tax rate) now live in the Relocation cost
          adjustment card inside Monthly Living Costs by Age Range. */}

      {/* ── GROUP: Scenarios & Risk ── */}
      <h2 className="form-group-header">{t('group.scenarios')}</h2>

      {/* ── Survivor scenario ── */}
      <details>
        <summary>{t('sec.survivor')}</summary>
        <p className="section-note">
          Models the financial impact when one spouse passes away. The surviving
          spouse keeps the LARGER of the two Social Security checks (SSA survivor
          rule), the deceased's income stops, and living expenses scale down for
          one person.
        </p>
        <div className="card">
          <div className="grid-2">
            <SelectField label="Enable survivor scenario"
              value={data.survivor.enabled ? 1 : 0}
              onChange={(v) => set(['survivor', 'enabled'])(Boolean(v))}
              options={[{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }]} />
            <SelectField label="Who passes first"
              value={data.survivor.whoFirst ?? 'wife'}
              onChange={set(['survivor', 'whoFirst'])}
              options={[
                { value: 'wife', label: 'Wife passes first (typical actuarial case)' },
                { value: 'me',   label: 'I pass first' },
              ]} />
            <NumberField label="My age when event occurs"
              value={data.survivor.eventAge}
              onChange={set(['survivor', 'eventAge'])}
              hint="age YOU would be when this happens (works for either case)" />
            <NumberField label="Expense factor (single household)"
              value={data.survivor.expenseFactor}
              onChange={set(['survivor', 'expenseFactor'])}
              step={0.05}
              hint="0.75 = 75% of couple's expenses; rule of thumb 0.70–0.80" />
            <NumberField label="Wife's life expectancy (age)"
              value={data.survivor.wifeLifeExpectancy}
              onChange={set(['survivor', 'wifeLifeExpectancy'])}
              hint="only used if 'I pass first' — sim extends until wife reaches this age" />
          </div>
        </div>
      </details>

      {/* ── Monte Carlo ── */}
      <details>
        <summary>{t('sec.monteCarlo')}</summary>
        <p className="section-note">
          Re-runs the simulation many times with randomized returns to estimate the
          probability your plan survives. A "85% success rate" means 85% of randomized
          scenarios kept you funded through life expectancy.
        </p>
        <div className="card">
          <div className="grid-2">
            <SelectField label="Enable Monte Carlo"
              value={data.monteCarlo.enabled ? 1 : 0}
              onChange={(v) => set(['monteCarlo', 'enabled'])(Boolean(v))}
              options={[{ value: 0, label: 'No (deterministic only)' }, { value: 1, label: 'Yes' }]} />
            <NumberField label="Number of runs"
              value={data.monteCarlo.runs}
              onChange={set(['monteCarlo', 'runs'])}
              hint="500 is a good balance of accuracy and speed" />
            <NumberField label="Annual return volatility (% stddev)"
              value={data.monteCarlo.volatility}
              onChange={set(['monteCarlo', 'volatility'])}
              step={0.5}
              hint="historical: ~15% for stocks, ~5% for bonds, ~10% balanced" />
          </div>
        </div>
      </details>

      {/* ── Action buttons ──
          The save button shows its current state INSIDE the button (same width)
          so layout doesn't shift between "Save" / "Saving…" / "Saved". */}
      <div className="actions">
        <button
          className={`btn-save ${saveStatus === 'ok' ? 'is-saved' : ''} ${saveStatus === 'error' ? 'is-error' : ''}`}
          disabled={saving}
          onClick={onSave}
          title="Save inputs to data.json without running the calculation"
        >
          {saving
            ? t('btn.saving')
            : saveStatus === 'ok'
              ? t('btn.saved')
              : saveStatus === 'error'
                ? t('btn.retry')
                : t('btn.save')}
        </button>
        <button
          className="btn-calculate primary"
          onClick={onCalculate}
          title="Validate inputs and show the Results screen — keyboard shortcut: Ctrl + → or Alt + →"
        >
          {t('btn.calculate')} <span className="kbd-hint">Ctrl / Alt + →</span>
        </button>
      </div>
    </div>
  );
}

// ScenarioCard: one of 5 slots. Empty slot = "+ Save current here" button.
// Filled slot = name, note, action buttons. Inline form for save/rename.
function ScenarioCard({ slotIdx, scenario, handlers }) {
  // Local UI mode: 'view' | 'new' | 'rename'
  const [mode, setMode] = useState('view');
  const [draftName, setDraftName] = useState('');
  const [draftNote, setDraftNote] = useState('');

  const startNew = () => {
    setDraftName(`Scenario ${slotIdx + 1}`);
    setDraftNote('');
    setMode('new');
  };
  const startRename = () => {
    setDraftName(scenario.name || '');
    setDraftNote(scenario.note || '');
    setMode('rename');
  };
  const commit = () => {
    if (mode === 'new') {
      handlers.save(slotIdx, draftName.trim(), draftNote.trim());
    } else if (mode === 'rename') {
      handlers.editMeta(slotIdx, draftName.trim(), draftNote.trim());
    }
    setMode('view');
  };
  const cancel = () => setMode('view');

  const onLoad = () => {
    if (window.confirm(`Load "${scenario.name}"? Your current unsaved changes will be replaced. (Already-saved scenarios are unaffected.)`)) {
      handlers.load(slotIdx);
    }
  };
  const onUpdate = () => {
    if (window.confirm(`Overwrite "${scenario.name}" with the current inputs?`)) {
      handlers.update(slotIdx);
    }
  };
  const onDelete = () => {
    if (window.confirm(`Delete "${scenario.name}"? This can't be undone.`)) {
      handlers.delete(slotIdx);
    }
  };

  // ── Empty slot ──
  if (!scenario && mode === 'view') {
    return (
      <div className="scenario-card scenario-empty" onClick={startNew}>
        <div className="scenario-plus">+</div>
        <div className="scenario-empty-label">Save current as Scenario {slotIdx + 1}</div>
      </div>
    );
  }

  // ── Editing (new or rename) ──
  if (mode === 'new' || mode === 'rename') {
    return (
      <div className="scenario-card scenario-editing">
        <input
          type="text"
          className="scenario-name-input"
          placeholder="Name (e.g. Baseline)"
          value={draftName}
          autoFocus
          onChange={(e) => setDraftName(e.target.value)}
        />
        <textarea
          className="scenario-note-input"
          placeholder="Note — what's specific about this scenario? (line breaks OK)"
          rows={4}
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
        />
        <div className="scenario-actions">
          <button className="btn-primary-sm" onClick={commit}>
            {mode === 'new' ? '💾 Save' : '✓ Apply'}
          </button>
          <button onClick={cancel}>Cancel</button>
        </div>
      </div>
    );
  }

  // ── Filled slot in view mode ──
  const savedLabel = scenario.savedAt
    ? new Date(scenario.savedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  return (
    <div className="scenario-card scenario-filled">
      <div className="scenario-name">{scenario.name || `Scenario ${slotIdx + 1}`}</div>
      {scenario.note && <div className="scenario-note" title={scenario.note}>{scenario.note}</div>}
      <div className="scenario-actions">
        <button className="btn-primary-sm" onClick={onLoad} title="Replace current inputs with this scenario">
          ↻ Load
        </button>
        <button onClick={onUpdate} title="Save current inputs into this slot">
          ⇡ Update
        </button>
        <button onClick={startRename} title="Rename / edit note">
          ✎ Edit
        </button>
        <button onClick={onDelete} className="btn-danger-sm" title="Delete this scenario">
          🗑
        </button>
      </div>
      {savedLabel && <div className="scenario-saved-at">Saved {savedLabel}</div>}
    </div>
  );
}

function BracketEditor({ index, bracket, setBracket, data, japan, onDuplicate, onRemove }) {
  const f = (key) => (v) => setBracket({ ...bracket, [key]: v });
  const from = Number(bracket.fromAge) || 0;
  const to = Number(bracket.toAge) || 0;
  const rangeLabel =
    from > 0 && to > 0
      ? `Ages ${from}–${to}`
      : from > 0
        ? `Ages ${from}+`
        : `Bracket ${index + 1}`;

  // ── Bracket-specific totals (the costs entered in this bracket) ──────
  const monthlyExpenses =
    (Number(bracket.housing) || 0) +
    (Number(bracket.auto) || 0) +
    (Number(bracket.grocery) || 0) +
    (Number(bracket.insurance) || 0) +
    (Number(bracket.medical) || 0) +
    (Number(bracket.other) || 0);
  const monthlyTravel =
    ((Number(bracket.tripsPerYear) || 0) * (Number(bracket.costPerTrip) || 0)) / 12;
  const bracketSubtotal = monthlyExpenses + monthlyTravel;
  const otherIncome = Number(bracket.additionalIncome) || 0;
  const fmt$ = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

  // ── Relocation before/after (living + travel only, matching the engine) ──
  // The engine scales living + travel by costMultiplier for years on/after the
  // move age. We show the post-move bracket subtotal whenever the move age
  // falls at or before the end of this bracket's range.
  const relocEnabled = !!(japan && japan.enabled);
  const moveAge = Number(japan?.moveAge) || 0;
  const costMult = Number(japan?.costMultiplier) || 1;
  // Does the move happen within (or before) this bracket, and does it actually
  // change the number? (multiplier ≠ 1 and there are living/travel costs)
  const relocAffectsBracket =
    relocEnabled && moveAge > 0 && to > 0 && moveAge <= to &&
    costMult !== 1 && bracketSubtotal > 0;
  // If the move happens partway through this bracket, the early years are at
  // full cost and later years are scaled — useful to flag.
  const relocMidBracket = relocAffectsBracket && moveAge > from;
  const bracketSubtotalAfter = bracketSubtotal * costMult;

  // ── Ongoing monthly costs that ALSO apply during this bracket's range ─
  // (mortgage, UL premium, IRA/Roth-401k contributions). Each is included
  // only if it overlaps the bracket's age range. If it ends mid-bracket
  // we annotate "(until age X)" so the user understands the cost drops off.
  // Pre-tax 401k contributions are EXCLUDED because they come out before
  // take-home, so they don't reduce cash flow from the bracket's perspective.
  const ongoingCosts = [];
  if (data && from > 0) {
    const myRetire = Number(data.income?.myRetirementAge) || 999;

    // Mortgage P&I + extra principal — both come out of take-home each month
    // until the house is sold (or the loan is paid off; the simulation
    // handles payoff precisely, this display assumes "until sellAge").
    const mortgage = Number(data.realEstate?.monthlyPayment) || 0;
    const extraPrincipal = Number(data.realEstate?.extraPrincipal) || 0;
    const totalMortgage = mortgage + extraPrincipal;
    const sellAge = Number(data.realEstate?.sellAge) || 0;
    if (totalMortgage > 0) {
      const stopAge = sellAge > 0 ? sellAge : 999;
      if (stopAge > from) {
        const annotation = stopAge <= to ? ` (until age ${stopAge})` : '';
        const label = extraPrincipal > 0
          ? `Mortgage P&I + extra principal${annotation}`
          : `Mortgage P&I${annotation}`;
        ongoingCosts.push({ label, amount: totalMortgage });
      }
    }

    // UL premium
    const ulPremium = Number(data.ul?.monthlyPremium) || 0;
    const ulCancel = Number(data.ul?.cancelAge) || 0;
    if (ulPremium > 0) {
      const stopAge = ulCancel > 0 ? ulCancel : 999;
      if (stopAge > from) {
        const annotation = stopAge <= to ? ` (until age ${stopAge})` : '';
        ongoingCosts.push({ label: `UL premium${annotation}`, amount: ulPremium });
      }
    }

    // IRA contributions (always from take-home, both Traditional and Roth)
    (data.iras || []).forEach((ira, i) => {
      const contrib = Number(ira.monthlyContrib) || 0;
      if (contrib <= 0) return;
      const stopAge = Math.min(Number(ira.stopContribAge) || 0, myRetire);
      if (stopAge > from) {
        const annotation = stopAge <= to ? ` (until age ${stopAge})` : '';
        const name = ira.nickname ? `IRA: ${ira.nickname}` : `IRA ${i + 1}`;
        ongoingCosts.push({ label: `${name} contribution${annotation}`, amount: contrib });
      }
    });

    // 401k Roth contributions only (Traditional is pre-tax — already excluded
    // from your after-tax take-home).
    (data.k401s || []).forEach((k, i) => {
      const contrib = Number(k.monthlyContrib) || 0;
      if (contrib <= 0) return;
      const isRoth = (k.accountType || 'traditional') === 'roth';
      if (!isRoth) return;
      const stopAge = Math.min(Number(k.stopContribAge) || 0, myRetire);
      if (stopAge > from) {
        const annotation = stopAge <= to ? ` (until age ${stopAge})` : '';
        const name = k.nickname ? `401k Roth: ${k.nickname}` : `401k ${i + 1} (Roth)`;
        ongoingCosts.push({ label: `${name} contribution${annotation}`, amount: contrib });
      }
    });

    // Rental phase income (if enabled and overlaps this bracket).
    // Rental start age = MY retirement age (auto). Rental END age =
    // rental.sellAge (0 means never, hold through life expectancy).
    const rental = data.rental || { enabled: false };
    if (rental.enabled) {
      const rentStart = myRetire;
      const rentSell = Number(rental.sellAge) || 0;
      const rentEnd = rentSell > 0 ? rentSell : 999;
      if (rentStart > 0 && rentStart <= to && rentEnd > from) {
        const rentMonthly = Number(rental.monthlyRentIncome) || 0;
        if (rentMonthly > 0) {
          const startAnnotation = rentStart > from ? ` (starts age ${rentStart})` : '';
          const endAnnotation = rentEnd <= to ? ` (ends age ${rentEnd})` : '';
          ongoingCosts.push({
            label: `🏘️ Rental income${startAnnotation}${endAnnotation}`,
            amount: -rentMonthly, // negative because it's INCOME, reduces net outflow
          });
        }
      }
    }

    // Loan monthly payments — for each loan whose term overlaps this bracket.
    // Disabled loans (enabled === false) are skipped entirely.
    (data.loans || []).forEach((loan) => {
      if (loan.enabled === false) return;
      const principal = Number(loan.amount) || 0;
      const startAge = Number(loan.age) || 0;
      const durationYears = Number(loan.durationYears) || 0;
      const apr = Number(loan.apr) || 0;
      if (principal <= 0 || startAge <= 0 || durationYears <= 0) return;
      const monthly = calcLoanPayment(principal, durationYears, apr);
      if (monthly <= 0) return;
      const endAge = startAge + durationYears - 1;
      if (startAge <= to && endAge >= from) {
        const label = loan.description || `Loan`;
        const startAnnotation = startAge > from ? ` (starts age ${startAge})` : '';
        const endAnnotation = endAge <= to ? ` (ends age ${endAge})` : '';
        ongoingCosts.push({
          label: `🏦 ${label}${startAnnotation}${endAnnotation}`,
          amount: monthly,
        });
      }
    });

    // Vehicle loan payments — auto-calculated monthly from cost/down/months/APR.
    (data.vehicles || []).forEach((v) => {
      const cost = Number(v.cost) || 0;
      const down = Number(v.down) || 0;
      const purchaseAge = Number(v.age) || 0;
      const months = Number(v.monthsToPay) || 0;
      const apr = Number(v.apr) || 0;
      if (purchaseAge <= 0 || months <= 0) return;
      const financed = Math.max(0, cost - down);
      const monthly = financed > 0
        ? calcLoanPayment(financed, months / 12, apr)
        : 0;
      if (monthly <= 0) return;
      const yearsOfLoan = Math.ceil(months / 12);
      const endAge = purchaseAge + yearsOfLoan - 1;
      if (purchaseAge <= to && endAge >= from) {
        const icon = v.description === 'motorcycle' ? '🏍️' : '🚗';
        const owner = v.person === 'wife' ? 'wife' : 'self';
        const startAnnotation = purchaseAge > from ? ` (starts age ${purchaseAge})` : '';
        const endAnnotation = endAge <= to ? ` (ends age ${endAge})` : '';
        ongoingCosts.push({
          label: `${icon} Vehicle loan — ${owner}${startAnnotation}${endAnnotation}`,
          amount: monthly,
        });
      }
    });
  }
  const ongoingSubtotal = ongoingCosts.reduce((s, c) => s + c.amount, 0);
  const totalMonthly = bracketSubtotal + ongoingSubtotal;
  const netMonthly = totalMonthly - otherIncome;

  // ── After-relocation full total ──
  // Only living + travel are scaled by the multiplier (matching the engine);
  // ongoing costs (mortgage, contributions, loans, vehicles) and other income
  // are unchanged by the move, so they carry over at full value.
  const totalMonthlyAfter = bracketSubtotalAfter + ongoingSubtotal;
  const netMonthlyAfter = totalMonthlyAfter - otherIncome;

  return (
    <div className="card">
      <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{rangeLabel}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {onDuplicate && (
            <button type="button" className="btn-primary-sm" onClick={onDuplicate}
              title="Insert a copy of this age range below">⧉ Duplicate</button>
          )}
          {onRemove && (
            <button type="button" className="btn-danger-sm" onClick={onRemove}
              title="Remove this age range">🗑 Remove</button>
          )}
        </span>
      </h4>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <NumberField label="From age" value={bracket.fromAge}
          onChange={f('fromAge')} hint="inclusive" />
        <NumberField label="To age" value={bracket.toAge}
          onChange={f('toAge')}
          hint="inclusive — 'to 55' covers the whole year you're 55; start the next range at 56" />
      </div>
      <div className="grid-3">
        <NumberField label="Housing (mo)"   value={bracket.housing}     onChange={f('housing')} />
        <NumberField label="Auto (mo)"      value={bracket.auto}        onChange={f('auto')} />
        <NumberField label="Grocery (mo)"   value={bracket.grocery}     onChange={f('grocery')} />
        <NumberField label="Insurance (mo)" value={bracket.insurance}   onChange={f('insurance')} />
        <NumberField label="Medical (mo)"   value={bracket.medical}     onChange={f('medical')} />
        <NumberField label="Other (mo)"     value={bracket.other}       onChange={f('other')} />
        <NumberField label="Trips/year"     value={bracket.tripsPerYear} onChange={f('tripsPerYear')} />
        <NumberField label="Cost/trip"      value={bracket.costPerTrip} onChange={f('costPerTrip')} />
      </div>
      <div className="grid-2" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #ddd' }}>
        <NumberField
          label="💼 Other monthly income (in this age range)"
          value={bracket.additionalIncome}
          onChange={f('additionalIncome')}
          hint="pension, rental, part-time, side hustle — counted as income for this bracket"
        />
      </div>
      {/* Live totals (recomputed on every keystroke) */}
      <div className="bracket-totals">
        <div className="bracket-totals-row">
          <span>Monthly expenses (housing + auto + grocery + ins + medical + other)</span>
          <span className="amount">{fmt$(monthlyExpenses)}</span>
        </div>
        <div className="bracket-totals-row">
          <span>Monthly travel ({Number(bracket.tripsPerYear) || 0} trips × {fmt$(Number(bracket.costPerTrip) || 0)} ÷ 12)</span>
          <span className="amount">{fmt$(monthlyTravel)}</span>
        </div>
        <div className="bracket-totals-row bracket-totals-subtotal">
          <span>Bracket subtotal{relocAffectsBracket ? ' (before relocation)' : ''}</span>
          <span className="amount">{fmt$(bracketSubtotal)}</span>
        </div>

        {relocAffectsBracket && (
          <div className="bracket-totals-row bracket-totals-subtotal" style={{ color: '#831843' }}>
            <span>
              🌏 Bracket subtotal after relocation (× {costMult})
              {relocMidBracket ? ` — applies from age ${moveAge}` : ''}
            </span>
            <span className="amount">{fmt$(bracketSubtotalAfter)}</span>
          </div>
        )}

        {ongoingCosts.length > 0 && (
          <>
            <div className="bracket-totals-divider">
              <span>Ongoing monthly costs active in this range</span>
            </div>
            {ongoingCosts.map((c, i) => (
              <div key={i} className="bracket-totals-row ongoing-row">
                <span>{c.label}</span>
                <span className="amount">{fmt$(c.amount)}</span>
              </div>
            ))}
            <div className="bracket-totals-row bracket-totals-subtotal">
              <span>Ongoing subtotal</span>
              <span className="amount">{fmt$(ongoingSubtotal)}</span>
            </div>
          </>
        )}

        <div className="bracket-totals-row bracket-totals-grandtotal">
          <span>TOTAL monthly cost{relocAffectsBracket ? ' (before relocation)' : ''}</span>
          <span className="amount">{fmt$(totalMonthly)}</span>
        </div>

        {relocAffectsBracket && (
          <div className="bracket-totals-row bracket-totals-grandtotal" style={{ color: '#831843', borderTopColor: '#db2777' }}>
            <span>
              🌏 TOTAL monthly cost after relocation
              {relocMidBracket ? ` — from age ${moveAge}` : ''}
              <br /><em className="hint" style={{ fontWeight: 400 }}>
                living + travel × {costMult}; ongoing costs unchanged
              </em>
            </span>
            <span className="amount">{fmt$(totalMonthlyAfter)}</span>
          </div>
        )}

        {otherIncome > 0 && (
          <>
            <div className="bracket-totals-row income-row">
              <span>− Other monthly income</span>
              <span className="amount">−{fmt$(otherIncome)}</span>
            </div>
            <div className="bracket-totals-row bracket-totals-net">
              <span>Net monthly outflow{relocAffectsBracket ? ' (before relocation)' : ''}</span>
              <span className="amount">{fmt$(netMonthly)}</span>
            </div>
            {relocAffectsBracket && (
              <div className="bracket-totals-row bracket-totals-net" style={{ color: '#831843', borderTopColor: '#db2777' }}>
                <span>🌏 Net monthly outflow after relocation</span>
                <span className="amount">{fmt$(netMonthlyAfter)}</span>
              </div>
            )}
          </>
        )}

        <div className="bracket-totals-sub">
          Annual equivalent: {fmt$(totalMonthly * 12)} total cost
          {otherIncome > 0 && <> · {fmt$(otherIncome * 12)} income · {fmt$(netMonthly * 12)} net</>}
          {relocAffectsBracket && (
            <> · <strong style={{ color: '#831843' }}>after relocation: {fmt$(totalMonthlyAfter * 12)} total cost
            {otherIncome > 0 && <> · {fmt$(netMonthlyAfter * 12)} net</>}</strong></>
          )}
          {ongoingCosts.some((c) => c.label.includes('until age')) && (
            <> · <strong>Note:</strong> some ongoing costs end mid-bracket (see "until age X" annotations) — your actual cost drops at those ages.</>
          )}
          <br /><em>(today's dollars; inflation and mid-bracket drop-offs are applied year-by-year in the simulation)</em>
        </div>
      </div>
    </div>
  );
}
