// =====================================================================
// Input diff helper — compares two snapshots of the user's inputs and
// returns a list of meaningful changes with human-friendly labels.
//
// Used by ResultsScreen to show "What changed since your last calculation?"
// =====================================================================

// Top-level scalar fields get explicit labels for readability.
const FIELD_LABELS = {
  'personal.myDOB': 'My date of birth',
  'personal.wifeDOB': "Wife's date of birth",
  'personal.lifeExpectancy': 'Life expectancy (age)',
  'personal.inflationRate': 'Inflation rate (%)',
  'personal.emergencyFund': 'Emergency fund',
  'personal.autoDepleteRetirement': 'Auto-deplete retirement accounts',

  'income.myIncome': 'My monthly after-tax income',
  'income.wifeIncome': "Wife's monthly after-tax income",
  'income.myRetirementAge': 'My retirement age',
  'income.wifeRetirementAge': "Wife's retirement age",
  'income.incomeGrowthRate': 'Annual income growth rate (%)',

  'bankInvest.enabled': 'Auto-invest excess cash: enabled',
  'bankInvest.threshold': 'Auto-invest excess cash: threshold',
  'bankInvest.returnRate': 'Auto-invest excess cash: expected return (%)',

  'ul.surrenderValue': 'UL: current surrender value',
  'ul.monthlyPremium': 'UL: monthly premium',
  'ul.monthlyFee': 'UL: monthly insurance fee',
  'ul.growthRate': 'UL: annual growth rate (%)',
  'ul.cancelAge': 'UL: cancel age',

  'realEstate.value': 'Real estate: current value',
  'realEstate.loanBalance': 'Real estate: loan balance',
  'realEstate.apr': 'Real estate: APR (%)',
  'realEstate.monthlyPayment': 'Real estate: monthly mortgage (P&I)',
  'realEstate.extraPrincipal': 'Real estate: extra monthly principal',
  'realEstate.appreciationRate': 'Real estate: appreciation rate (%)',
  'realEstate.sellAge': 'Real estate: sell age',
  'realEstate.saleFeeRate': 'Real estate: home sale fee (%)',
  'realEstate.maintenanceRate': 'Real estate: maintenance rate (%)',

  'ss.mySSAmount': 'My SS monthly benefit (at FRA)',
  'ss.mySSAge': 'My SS claim age',
  'ss.wifeSSAmount': "Wife's SS monthly benefit (at FRA)",
  'ss.wifeSSAge': "Wife's SS claim age",

  'japan.enabled': 'Japan move: enabled',
  'japan.moveAge': 'Japan move: age',
  'japan.costMultiplier': 'Japan move: cost-of-living multiplier',
  'japan.withdrawalTaxRate': 'Japan move: withdrawal tax rate (%)',

  'survivor.enabled': 'Survivor scenario: enabled',
  'survivor.whoFirst': 'Survivor scenario: who passes first',
  'survivor.eventAge': 'Survivor scenario: event age',
  'survivor.expenseFactor': 'Survivor scenario: expense factor',
  'survivor.wifeLifeExpectancy': "Survivor scenario: wife's life expectancy",

  'rental.enabled': 'Rental option: enabled',
  'rental.oneTimeSetupCost': 'Rental option: one-time setup cost',
  'rental.monthlyRentIncome': 'Rental option: monthly rent income',
  'rental.annualRentIncrease': 'Rental option: annual rent increase (%)',
  'rental.monthlyMaintenanceRate': 'Rental option: maintenance rate (%)',
  'rental.extraPrincipalDuringRental': 'Rental option: extra principal during rental',
  'rental.sellAge': 'Rental option: sell rental at age',

  'monteCarlo.enabled': 'Monte Carlo: enabled',
  'monteCarlo.runs': 'Monte Carlo: runs',
  'monteCarlo.volatility': 'Monte Carlo: volatility (%)',
};

const ARRAY_LABELS = {
  banks: 'Bank',
  iras: 'IRA',
  k401s: '401k',
  expenseBrackets: 'Expense bracket',
  oneTimeExpenses: 'One-time expense',
  oneTimeIncomes: 'One-time income',
  vehicles: 'Vehicle',
  loans: 'Loan',
};

const SUBFIELD_LABELS = {
  nickname: 'nickname',
  balance: 'balance',
  growthRate: 'growth rate (%)',
  monthlyContrib: 'monthly contribution',
  stopContribAge: 'stop contribution age',
  earliestWithdrawalAge: 'earliest withdrawal age',
  accountType: 'account type',
  withdrawalTaxRate: 'withdrawal tax rate (%)',
  companyMonthlyMatch: 'company monthly match',
  fromAge: 'from age',
  toAge: 'to age',
  housing: 'housing (mo)',
  auto: 'auto (mo)',
  grocery: 'grocery (mo)',
  insurance: 'insurance (mo)',
  medical: 'medical (mo)',
  other: 'other (mo)',
  tripsPerYear: 'trips/year',
  costPerTrip: 'cost/trip',
  additionalIncome: 'other monthly income',
  description: 'description',
  age: 'age',
  amount: 'amount',
  // vehicles
  person: 'person',
  cost: 'cost',
  down: 'down payment',
  monthsToPay: 'months to pay',
  // loans / vehicles
  durationYears: 'duration (years)',
  apr: 'APR (%)',
};

// Convert a dotted/bracketed path like "iras[0].balance" to a readable label.
export function friendlyLabel(path) {
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];

  // Pattern: arrName[idx].field
  const arrMatch = path.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
  if (arrMatch) {
    const [, arrName, idx, field] = arrMatch;
    const arrLabel = ARRAY_LABELS[arrName] || arrName;
    const fieldLabel = SUBFIELD_LABELS[field] || field;
    return `${arrLabel} ${Number(idx) + 1} → ${fieldLabel}`;
  }
  return path;
}

// Top-level keys ALWAYS skipped when diffing.
//   - scenarios: storage for saved snapshots, not current planning inputs.
const STATIC_IGNORE_KEYS = new Set(['scenarios']);

// Feature groups that should be suppressed when `enabled === false` in BOTH
// snapshots. Sub-field changes (eventAge, expenseFactor, ...) don't actually
// move the result when the feature is disabled, so showing them as
// "input changes" is confusing.
const TOGGLEABLE_FEATURES = ['survivor', 'japan', 'monteCarlo', 'rental'];

// Deep walk two objects and return a list of every leaf-level difference.
// Each entry: { path, prev, curr }.
export function diffInputs(prev, curr) {
  const changes = [];
  const ignored = new Set(STATIC_IGNORE_KEYS);
  TOGGLEABLE_FEATURES.forEach((k) => {
    const a = prev?.[k];
    const b = curr?.[k];
    if (a?.enabled === false && b?.enabled === false) ignored.add(k);
  });
  const stripIgnored = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const out = { ...obj };
    ignored.forEach((k) => delete out[k]);
    return out;
  };
  walk(stripIgnored(prev), stripIgnored(curr), '', changes);
  return changes;
}

function walk(a, b, path, out) {
  // Both undefined → no change
  if (a === undefined && b === undefined) return;
  // One side undefined → treat as change
  if (a === undefined || b === undefined) {
    if (typeof a === 'object' || typeof b === 'object') {
      // Recurse into the side that exists
      const obj = a ?? b;
      if (Array.isArray(obj)) {
        const max = obj.length;
        for (let i = 0; i < max; i++) {
          walk(a?.[i], b?.[i], path ? `${path}[${i}]` : `[${i}]`, out);
        }
        return;
      }
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          walk(a?.[k], b?.[k], path ? `${path}.${k}` : k, out);
        }
        return;
      }
    }
    out.push({ path, prev: a, curr: b });
    return;
  }
  // Both null or both leaves
  if (a === null || b === null || typeof a !== 'object') {
    if (a !== b) out.push({ path, prev: a, curr: b });
    return;
  }
  // Both arrays
  if (Array.isArray(a) || Array.isArray(b)) {
    const max = Math.max(a?.length || 0, b?.length || 0);
    for (let i = 0; i < max; i++) {
      walk(a?.[i], b?.[i], path ? `${path}[${i}]` : `[${i}]`, out);
    }
    return;
  }
  // Both objects
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    walk(a[k], b[k], path ? `${path}.${k}` : k, out);
  }
}

// Pretty-format a value for display in the diff list.
export function formatDiffValue(v) {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') {
    // Distinguish money-ish values: heuristically, if abs > 100, show with commas.
    if (Math.abs(v) >= 100) return v.toLocaleString('en-US');
    return String(v);
  }
  return String(v);
}
