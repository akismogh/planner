// =====================================================================
// Input diff helper — compares two snapshots of the user's inputs and
// returns a list of meaningful changes with human-friendly labels.
//
// Used by ResultsScreen to show "What changed since your last calculation?"
// =====================================================================

// Top-level scalar fields get explicit labels for readability.
const FIELD_LABELS = {
  'personal.myDOB': 'My date of birth',
  'personal.spouseDOB': "Spouse's date of birth",
  'personal.lifeExpectancy': 'Life expectancy (age)',
  'personal.inflationRate': 'Inflation rate (%)',
  'personal.emergencyFund': 'Emergency fund',
  'personal.autoDepleteRetirement': 'Auto-deplete retirement accounts',

  'income.myIncome': 'My monthly income (pre-tax)',
  'income.myTaxRate': 'My effective tax rate (%)',
  'income.spouseIncome': "Spouse's monthly income (pre-tax)",
  'income.spouseTaxRate': "Spouse's effective tax rate (%)",
  'income.myRetirementAge': 'My retirement age',
  'income.spouseRetirementAge': "Spouse's retirement age",
  'income.spouseRetireWithMe': 'Spouse retires when I do',
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
  'ss.spouseSSAmount': "Spouse's SS monthly benefit (at FRA)",
  'ss.spouseSSAge': "Spouse's SS claim age",

  'japan.enabled': 'Japan move: enabled',
  'japan.moveAge': 'Japan move: age',
  'japan.costMultiplier': 'Japan move: cost-of-living multiplier',
  'japan.withdrawalTaxRate': 'Japan move: withdrawal tax rate (%)',

  'survivor.enabled': 'Survivor scenario: enabled',
  'survivor.whoFirst': 'Survivor scenario: who passes first',
  'survivor.eventAge': 'Survivor scenario: event age',
  'survivor.expenseFactor': 'Survivor scenario: expense factor',
  'survivor.spouseLifeExpectancy': "Survivor scenario: spouse's life expectancy",

  'rental.enabled': 'Rental option: enabled',
  'rental.startAge': 'Rental option: start renting at age',
  'rental.oneTimeSetupCost': 'Rental option: one-time setup cost',
  'rental.monthlyRentIncome': 'Rental option: monthly rent income',
  'rental.annualRentIncrease': 'Rental option: annual rent increase (%)',
  'rental.monthlyMaintenanceRate': 'Rental option: maintenance rate (%)',
  'rental.extraPrincipalDuringRental': 'Rental option: extra principal during rental',
  'rental.sellAge': 'Rental option: sell rental at age',

  'newHome.enabled': 'New home: enabled',
  'newHome.purchaseAge': 'New home: purchase age',
  'newHome.price': 'New home: purchase price',
  'newHome.downPayment': 'New home: down payment',
  'newHome.apr': 'New home: mortgage APR (%)',
  'newHome.loanTermYears': 'New home: mortgage term (years)',
  'newHome.appreciationRate': 'New home: appreciation rate (%)',
  'newHome.maintenanceRate': 'New home: maintenance rate (%)',
  'newHome.sellAge': 'New home: sell at age',
  'newHome.saleFeeRate': 'New home: sale fee rate (%)',

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

// ── Japanese label maps (mirror the English ones above) ──
const FIELD_LABELS_JA = {
  'personal.myDOB': '自分の生年月日',
  'personal.spouseDOB': '配偶者の生年月日',
  'personal.lifeExpectancy': '想定寿命（年齢）',
  'personal.inflationRate': 'インフレ率（%）',
  'personal.emergencyFund': '緊急予備資金',
  'personal.autoDepleteRetirement': '退職口座を計画的に取り崩す',

  'income.myIncome': '自分の月収（税引前）',
  'income.myTaxRate': '自分の実効税率（%）',
  'income.spouseIncome': '配偶者の月収（税引前）',
  'income.spouseTaxRate': '配偶者の実効税率（%）',
  'income.myRetirementAge': '自分の退職年齢',
  'income.spouseRetirementAge': '配偶者の退職年齢',
  'income.spouseRetireWithMe': '配偶者は自分と同時に退職',
  'income.incomeGrowthRate': '年間収入成長率（%）',

  'bankInvest.enabled': '余剰資金の自動運用：有効',
  'bankInvest.threshold': '余剰資金の自動運用：しきい値',
  'bankInvest.returnRate': '余剰資金の自動運用：期待利回り（%）',

  'ul.surrenderValue': 'UL：現在の解約返戻金',
  'ul.monthlyPremium': 'UL：毎月の保険料',
  'ul.monthlyFee': 'UL：毎月の保険費用',
  'ul.growthRate': 'UL：年間成長率（%）',
  'ul.cancelAge': 'UL：解約年齢',

  'realEstate.value': '不動産：現在価値',
  'realEstate.loanBalance': '不動産：ローン残高',
  'realEstate.apr': '不動産：金利 APR（%）',
  'realEstate.monthlyPayment': '不動産：毎月の住宅ローン（元利）',
  'realEstate.extraPrincipal': '不動産：毎月の繰上返済',
  'realEstate.appreciationRate': '不動産：値上がり率（%）',
  'realEstate.sellAge': '不動産：売却年齢',
  'realEstate.saleFeeRate': '不動産：売却手数料（%）',
  'realEstate.maintenanceRate': '不動産：維持費率（%）',

  'ss.mySSAmount': '自分のSS月額給付（FRA時点）',
  'ss.mySSAge': '自分のSS受給開始年齢',
  'ss.spouseSSAmount': '配偶者のSS月額給付（FRA時点）',
  'ss.spouseSSAge': '配偶者のSS受給開始年齢',

  'japan.enabled': '日本移住：有効',
  'japan.moveAge': '日本移住：年齢',
  'japan.costMultiplier': '日本移住：生活費の係数',
  'japan.withdrawalTaxRate': '日本移住：引き出し税率（%）',

  'survivor.enabled': '遺族シナリオ：有効',
  'survivor.whoFirst': '遺族シナリオ：先に亡くなるのは',
  'survivor.eventAge': '遺族シナリオ：発生年齢',
  'survivor.expenseFactor': '遺族シナリオ：支出係数',
  'survivor.spouseLifeExpectancy': '遺族シナリオ：配偶者の想定寿命',

  'rental.enabled': '賃貸オプション：有効',
  'rental.startAge': '賃貸オプション：賃貸開始年齢',
  'rental.oneTimeSetupCost': '賃貸オプション：一時的な初期費用',
  'rental.monthlyRentIncome': '賃貸オプション：毎月の家賃収入',
  'rental.annualRentIncrease': '賃貸オプション：年間家賃上昇率（%）',
  'rental.monthlyMaintenanceRate': '賃貸オプション：維持費率（%）',
  'rental.extraPrincipalDuringRental': '賃貸オプション：賃貸中の繰上返済',
  'rental.sellAge': '賃貸オプション：賃貸物件の売却年齢',

  'newHome.enabled': '新居：有効',
  'newHome.purchaseAge': '新居：購入年齢',
  'newHome.price': '新居：購入価格',
  'newHome.downPayment': '新居：頭金',
  'newHome.apr': '新居：住宅ローン金利（%）',
  'newHome.loanTermYears': '新居：ローン期間（年）',
  'newHome.appreciationRate': '新居：値上がり率（%）',
  'newHome.maintenanceRate': '新居：維持費率（%）',
  'newHome.sellAge': '新居：売却年齢',
  'newHome.saleFeeRate': '新居：売却手数料率（%）',

  'monteCarlo.enabled': 'モンテカルロ：有効',
  'monteCarlo.runs': 'モンテカルロ：試行回数',
  'monteCarlo.volatility': 'モンテカルロ：ボラティリティ（%）',
};

const ARRAY_LABELS_JA = {
  banks: '銀行口座',
  iras: 'IRA',
  k401s: '401k',
  expenseBrackets: '年齢帯',
  oneTimeExpenses: '一時支出',
  oneTimeIncomes: '一時収入',
  vehicles: '車両',
  loans: 'ローン',
};

const SUBFIELD_LABELS_JA = {
  nickname: 'ニックネーム',
  balance: '残高',
  growthRate: '成長率（%）',
  monthlyContrib: '毎月の積立額',
  stopContribAge: '積立停止年齢',
  earliestWithdrawalAge: '最早引き出し年齢',
  accountType: '口座タイプ',
  withdrawalTaxRate: '引き出し税率（%）',
  companyMonthlyMatch: '会社の毎月マッチ',
  fromAge: '開始年齢',
  toAge: '終了年齢',
  housing: '住居費（月）',
  auto: '自動車（月）',
  grocery: '食費（月）',
  insurance: '保険（月）',
  medical: '医療（月）',
  other: 'その他（月）',
  tripsPerYear: '旅行回数/年',
  costPerTrip: '1回あたり費用',
  additionalIncome: 'その他の月収',
  description: '内容',
  age: '年齢',
  amount: '金額',
  person: '対象者',
  cost: 'コスト',
  down: '頭金',
  monthsToPay: '支払月数',
  durationYears: '期間（年）',
  apr: '金利 APR（%）',
};

// Known string-enum values, localized for the Before/After columns.
const VALUE_LABELS_JA = {
  self: '本人', spouse: '配偶者', me: '自分',
  traditional: 'Traditional', roth: 'Roth',
  car: '車', motorcycle: 'バイク',
};

// Convert a dotted/bracketed path like "iras[0].balance" to a readable label.
export function friendlyLabel(path, lang = 'en') {
  const ja = lang === 'ja';
  const fieldLabels = ja ? FIELD_LABELS_JA : FIELD_LABELS;
  if (fieldLabels[path]) return fieldLabels[path];

  // Pattern: arrName[idx].field
  const arrMatch = path.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
  if (arrMatch) {
    const [, arrName, idx, field] = arrMatch;
    const arrLabel = (ja ? ARRAY_LABELS_JA : ARRAY_LABELS)[arrName] || arrName;
    const fieldLabel = (ja ? SUBFIELD_LABELS_JA : SUBFIELD_LABELS)[field] || field;
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
const TOGGLEABLE_FEATURES = ['survivor', 'japan', 'monteCarlo', 'rental', 'newHome'];

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
export function formatDiffValue(v, lang = 'en') {
  const ja = lang === 'ja';
  if (v === null || v === undefined || v === '') return ja ? '（空）' : '(empty)';
  if (typeof v === 'boolean') return ja ? (v ? 'はい' : 'いいえ') : (v ? 'Yes' : 'No');
  if (typeof v === 'number') {
    // Distinguish money-ish values: heuristically, if abs > 100, show with commas.
    if (Math.abs(v) >= 100) return v.toLocaleString('en-US');
    return String(v);
  }
  if (ja && VALUE_LABELS_JA[v]) return VALUE_LABELS_JA[v];
  return String(v);
}
