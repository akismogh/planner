// =====================================================================
// Retirement simulation engine — Phase 2
//
// Big features added in this version:
//   • Pre-tax (Traditional) vs post-tax (Roth) account handling
//   • Withdrawal tax — taxable accounts get "grossed up" on withdrawal
//   • Required Minimum Distributions (RMDs) starting at age 73
//   • 401k employer match
//   • Property tax + home maintenance auto-derived from current home value
//   • Emergency-fund floor on bank withdrawals
//   • Japan relocation scenario (cost-of-living + Japan tax model)
//   • Survivor scenario (wife predeceases; expenses + SS adjust)
//   • Monte Carlo: randomized returns across many runs for success probability
//
// All dollar inputs are in TODAY'S dollars. The engine applies inflation
// year-over-year automatically. Income is MONTHLY after-tax; SS is the
// projected MONTHLY benefit at FRA-67.
// =====================================================================

// ── Social Security factors (FRA = 67) ────────────────────────────────
// Own-benefit adjustment by claim age. Below FRA reduces, above adds
// delayed retirement credits up to age 70.
const SS_FACTORS = {
  62: 0.70,    63: 0.75,   64: 0.80,   65: 0.8667, 66: 0.9333,
  67: 1.00,    68: 1.08,   69: 1.16,   70: 1.24,
};
function ssFactor(age) {
  if (age <= 62) return SS_FACTORS[62];
  if (age >= 70) return SS_FACTORS[70];
  return SS_FACTORS[age] ?? 1;
}

// Spousal-benefit adjustment by the SPOUSE's claim age (not the worker's).
// Capped at 50% of the worker's PIA at FRA. NO delayed credits — claiming
// after FRA does NOT boost the spousal benefit beyond 50%.
// Formula: SSA reduces by 25/36 of 1% per month for the first 36 months
// before FRA, then 5/12 of 1% per additional month.
//   62 (60 mo early): 0.50 × 0.65   = 0.3250
//   63 (48 mo early): 0.50 × 0.70   = 0.3500
//   64 (36 mo early): 0.50 × 0.75   = 0.3750
//   65 (24 mo early): 0.50 × 0.8333 = 0.4167
//   66 (12 mo early): 0.50 × 0.9167 = 0.4583
//   67+ (FRA or later):              = 0.5000
const SPOUSAL_FACTORS = {
  62: 0.325, 63: 0.350, 64: 0.375, 65: 0.4167, 66: 0.4583,
  67: 0.500, 68: 0.500, 69: 0.500, 70: 0.500,
};
function spousalFactor(age) {
  if (age <= 62) return SPOUSAL_FACTORS[62];
  if (age >= 67) return 0.50;
  return SPOUSAL_FACTORS[age] ?? 0.50;
}

// Early-claim reduction applied to the spousal "excess" top-off (NOT the whole
// benefit). At FRA the excess is paid in full (factor 1.0); claiming at 62
// reduces it to ~0.65. Derived from SPOUSAL_FACTORS ÷ 0.50 so the two stay
// consistent: spousalExcessFactor(62) = 0.325/0.50 = 0.65, (67+) = 1.0.
function spousalExcessFactor(age) {
  return spousalFactor(age) / 0.50;
}

// ── IRS Uniform Lifetime Table (RMD divisors) ────────────────────────────
// Used to compute Required Minimum Distributions starting at age 73.
// RMD = prior-year-end balance / divisor. Ages > 100 use the 100 row.
const RMD_DIVISORS = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
  87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5,  95: 8.9,  96: 8.4,  97: 7.8,  98: 7.3,  99: 6.8, 100: 6.4,
};
function rmdDivisor(age) {
  if (age < 73) return null;
  if (age >= 100) return RMD_DIVISORS[100];
  return RMD_DIVISORS[age];
}

// ── DOB → age helper ────────────────────────────────────────────────────
export function ageFromDOB(dobStr) {
  if (!dobStr) return 0;
  const dob = new Date(dobStr);
  if (isNaN(dob)) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age--;
  return age;
}

// ── Expense bracket selector ────────────────────────────────────────────
// Brackets are now an array of user-defined { fromAge, toAge, ...costs }.
// Strategy:
//   1. First match wins (if multiple cover this age).
//   2. If no range covers the age, fall back to the closest earlier bracket
//      (so gaps inherit from the previous bracket).
//   3. If nothing at all is defined, return a zero bracket.
const EMPTY_BRACKET = {
  housing: 0, auto: 0, grocery: 0, insurance: 0, medical: 0,
  other: 0, tripsPerYear: 0, costPerTrip: 0,
};
function bracketForAge(age, brackets) {
  if (!Array.isArray(brackets) || brackets.length === 0) return EMPTY_BRACKET;
  for (const b of brackets) {
    const from = Number(b.fromAge) || 0;
    const to = Number(b.toAge) || 0;
    if (from > 0 && to > 0 && age >= from && age <= to) return b;
  }
  // Gap fallback: pick the bracket with the largest fromAge that is <= age.
  const sorted = [...brackets]
    .filter((b) => (Number(b.fromAge) || 0) > 0)
    .sort((a, b) => (Number(a.fromAge) || 0) - (Number(b.fromAge) || 0));
  let chosen = null;
  for (const b of sorted) {
    if (age >= (Number(b.fromAge) || 0)) chosen = b;
  }
  return chosen ?? sorted[0] ?? EMPTY_BRACKET;
}
function bracketMonthlyTotal(b) {
  return (Number(b.housing) || 0) + (Number(b.auto) || 0) +
         (Number(b.grocery) || 0) + (Number(b.insurance) || 0) +
         (Number(b.medical) || 0) + (Number(b.other) || 0);
}
function bracketAnnualTravel(b) {
  return (Number(b.tripsPerYear) || 0) * (Number(b.costPerTrip) || 0);
}

// ── Active-account filter ────────────────────────────────────────────────
// Returns only the rows the user actually filled in (positive balance or
// positive contribution). Original array index is preserved so UI column
// alignment stays correct.
function activeAccounts(arr, hasContrib = false) {
  return (arr || [])
    .map((a, idx) => ({ ...a, _idx: idx }))
    .filter((a) => {
      const bal = Number(a.balance) || 0;
      const contrib = hasContrib ? Number(a.monthlyContrib) || 0 : 0;
      return bal > 0 || contrib > 0;
    });
}

// ── Standard loan amortization payment ──────────────────────────────────
// P × [r(1+r)^n] / [(1+r)^n − 1], where r = APR/12/100, n = years × 12.
// If APR = 0, returns P/n (interest-free). Used by the Loan section to
// display the calculated monthly payment + drive cash flow.
export function calcLoanPayment(principal, durationYears, apr) {
  const P = Number(principal) || 0;
  const Y = Number(durationYears) || 0;
  const A = Number(apr) || 0;
  if (P <= 0 || Y <= 0) return 0;
  const n = Y * 12;
  if (A <= 0) return P / n;
  const r = A / 100 / 12;
  return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Total interest paid over the life of the loan = monthly × months − principal.
// Useful for comparing "shorter term vs lower rate" trade-offs.
export function calcTotalInterest(principal, durationYears, apr) {
  const P = Number(principal) || 0;
  const Y = Number(durationYears) || 0;
  if (P <= 0 || Y <= 0) return 0;
  const monthly = calcLoanPayment(P, Y, apr);
  return Math.max(0, monthly * Y * 12 - P);
}

// ── Box-Muller normal random sample ──────────────────────────────────────
function normalSample(mean, stddev) {
  const u1 = Math.max(Math.random(), 1e-9); // avoid log(0)
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// ── Per-account effective withdrawal tax rate ────────────────────────────
// In Japan, all withdrawals use the Japan rate. In the US, traditional accounts
// use the account's own rate; Roth pays 0.
function effectiveWithdrawalRate(account, isInJapan, japanRate) {
  if ((account.accountType ?? 'traditional') === 'roth') return 0;
  if (isInJapan) return (Number(japanRate) || 0) / 100;
  return (Number(account.withdrawalTaxRate) || 0) / 100;
}

// ──────────────────────────────────────────────────────────────────────────
// MAIN SIMULATION
// ──────────────────────────────────────────────────────────────────────────
// `overrides.myRetirementAge` lets the "possible retirement age" search
// reuse this engine. `options.randomize` switches to Monte Carlo mode.
export function simulate(inputs, overrides = {}, options = {}) {
  const myCurrentAge = ageFromDOB(inputs.personal.myDOB);
  const spouseCurrentAge = ageFromDOB(inputs.personal.spouseDOB);
  const lifeExpectancy = Number(inputs.personal.lifeExpectancy) || 90;
  // Wife's life expectancy lives INSIDE the survivor scenario and is only
  // used when whoFirst === 'me' (wife outlives me). Otherwise the sim ends
  // at my life expectancy — we assume both spouses reach it together.
  const spouseLifeExpectancy =
    Number(inputs.survivor?.spouseLifeExpectancy) || lifeExpectancy + 2;
  const inflation = (Number(inputs.personal.inflationRate) || 0) / 100;
  const emergencyFund = Number(inputs.personal.emergencyFund) || 0;

  // Auto-invest excess bank cash: each year, any bank total above `threshold`
  // earns an extra `returnRate` as investment income (added to total income).
  // Threshold is nominal (not inflated), matching the emergency-fund floor.
  const bankInvest = inputs.bankInvest || { enabled: false };
  const bankInvestEnabled = !!bankInvest.enabled;
  const bankInvestThreshold = Number(bankInvest.threshold) || 0;
  const bankInvestRate = (Number(bankInvest.returnRate) || 0) / 100;

  const myRetireAge = overrides.myRetirementAge ?? Number(inputs.income.myRetirementAge);
  let spouseRetireAge = overrides.spouseRetirementAge ?? Number(inputs.income.spouseRetirementAge);
  // Option: spouse retires at the SAME TIME as me rather than at their own
  // fixed age. "Same time" = the spouse's age in the year I reach my
  // retirement age, derived from the age gap between us. This tracks any
  // change to my retirement age automatically (incl. the possible-retirement
  // search, which passes overrides.myRetirementAge above).
  if (inputs.income?.spouseRetireWithMe && spouseCurrentAge > 0) {
    spouseRetireAge = myRetireAge - (myCurrentAge - spouseCurrentAge);
  }

  // Income (salary) growth is separate from price inflation. Default 3% =
  // raises that just keep pace with typical inflation. The user can set
  // this to 0 (no raises) or higher (career growth).
  const incomeGrowth = (Number(inputs.income.incomeGrowthRate) ?? inflation * 100) / 100;

  // Japan + survivor + monte carlo configs
  const japan = inputs.japan || { enabled: false };
  const survivor = inputs.survivor || { enabled: false };
  const mc = options.randomize ? { volatility: Number(options.volatility) || 15 } : null;

  // Asset state — only "active" accounts participate
  const banks = activeAccounts(inputs.banks);
  const iras = activeAccounts(inputs.iras, true);
  const k401s = activeAccounts(inputs.k401s, true);
  let bankBalances = banks.map((b) => Number(b.balance) || 0);
  let iraBalances = iras.map((a) => Number(a.balance) || 0);
  let k401Balances = k401s.map((a) => Number(a.balance) || 0);

  // UL insurance
  const ulEnabled =
    (Number(inputs.ul.surrenderValue) || 0) > 0 || (Number(inputs.ul.monthlyPremium) || 0) > 0;
  let ulValue = ulEnabled ? Number(inputs.ul.surrenderValue) || 0 : 0;
  let ulCancelled = !ulEnabled;
  const ulCancelAge = Number(inputs.ul.cancelAge) || 0;
  const ulGrowth = (Number(inputs.ul.growthRate) || 0) / 100;
  const ulPremiumMonthly = Number(inputs.ul.monthlyPremium) || 0;
  // Fee/cost-of-insurance portion of the premium. The remainder
  // (premium − fee) funds the cash (surrender) value and compounds at ulGrowth.
  const ulFeeMonthly = Number(inputs.ul.monthlyFee) || 0;
  const ulToCashMonthly = Math.max(0, ulPremiumMonthly - ulFeeMonthly);

  // Real estate
  const reEnabled = (Number(inputs.realEstate.value) || 0) > 0;
  let homeValue = reEnabled ? Number(inputs.realEstate.value) || 0 : 0;
  let loanBalance = reEnabled ? Number(inputs.realEstate.loanBalance) || 0 : 0;
  let houseSold = !reEnabled;
  const reAppr = (Number(inputs.realEstate.appreciationRate) || 0) / 100;
  const reAPR = (Number(inputs.realEstate.apr) || 0) / 100;
  const reMonthlyPI = Number(inputs.realEstate.monthlyPayment) || 0;
  const reExtra = Number(inputs.realEstate.extraPrincipal) || 0;
  const reSellAge = Number(inputs.realEstate.sellAge) || 0;
  // One-time selling cost as a fraction of the sale price (realtor + closing).
  const saleFeeRate = (Number(inputs.realEstate.saleFeeRate) || 0) / 100;
  // Property tax is assumed escrowed into the monthly mortgage payment, so
  // we don't compute it separately. Maintenance is still tracked as a %
  // of the current home value each year.
  const maintenanceRate = (Number(inputs.realEstate.maintenanceRate) || 0) / 100;

  // ── Rental option ─────────────────────────────────────────────────────
  // When enabled, the house becomes a rental starting on MY RETIREMENT
  // BIRTHDAY (auto-derived). The realEstate.sellAge is IGNORED — rental
  // uses its own `sellAge` (0 = never sell, hold through life expectancy).
  // Rent grows at its OWN rate (annualRentIncrease) — typically different
  // from CPI inflation. Applied year-over-year from today.
  const rental = inputs.rental || { enabled: false };
  // Rental start age: defaults to retirement age, but `rental.startAge` (> 0)
  // overrides it — e.g. rent the house out at 60 while still working to 65.
  const rentalStartAge = Number(rental.startAge) > 0 ? Number(rental.startAge) : myRetireAge;
  const rentalSellAge = Number(rental.sellAge) || 0;
  const rentalMonthlyIncome = Number(rental.monthlyRentIncome) || 0;
  const rentIncreaseRate = (Number(rental.annualRentIncrease) || 0) / 100;
  const rentalMaintRate = (Number(rental.monthlyMaintenanceRate) || 0) / 100;
  const rentalExtraPI = Number(rental.extraPrincipalDuringRental) || 0;
  const rentalSetupCost = Number(rental.oneTimeSetupCost) || 0;
  let rentalSetupCharged = false; // ensures one-time cost only hits once

  // ── New Home purchase (second property / move-up home) ───────────────────
  // Buy a new primary residence at `purchaseAge`: the down payment leaves the
  // bank that year, a new mortgage starts (P&I from cash flow), the home
  // appreciates and accrues maintenance, and its equity is added to net worth.
  // Independent of `realEstate` (which can simultaneously become a rental).
  const newHome = inputs.newHome || { enabled: false };
  const nhEnabled = !!newHome.enabled && (Number(newHome.price) || 0) > 0;
  const nhPurchaseAge = Number(newHome.purchaseAge) || 0;
  const nhPrice = Number(newHome.price) || 0;
  const nhDown = Number(newHome.downPayment) || 0;
  const nhAPR = (Number(newHome.apr) || 0) / 100;
  const nhTermYears = Number(newHome.loanTermYears) || 0;
  const nhAppr = (Number(newHome.appreciationRate) || 0) / 100;
  const nhMaintRate = (Number(newHome.maintenanceRate) || 0) / 100;
  const nhSellAge = Number(newHome.sellAge) || 0;
  const nhSaleFeeRate = (Number(newHome.saleFeeRate) || 0) / 100;
  let nhValue = 0;          // current appreciated value (0 until purchased)
  let nhLoan = 0;           // outstanding mortgage balance
  let nhMonthlyPI = 0;      // fixed P&I once purchased
  let nhPurchased = false;
  let nhSold = false;

  // Social security FRA-67 monthly benefits
  const mySSAge = Number(inputs.ss.mySSAge) || 0;
  const mySSMonthly = Number(inputs.ss.mySSAmount) || 0;
  const spouseSSAge = Number(inputs.ss.spouseSSAge) || 0;
  const spouseSSMonthly = Number(inputs.ss.spouseSSAmount) || 0;

  // Output accumulators
  const yearly = [];
  let moneyRunOutAge = null;
  let japanMoveTriggered = false;
  let survivorTriggered = false;
  // Cash Position — per-year view (Option B). Each year independently
  // shows: (bank_at_start + RMD) × (1 + bank_growth) + netCashFlow.
  //   - Positive: bank covers this year's needs
  //   - Negative: this year's shortfall (how much short the bank fell)
  // NEXT year starts fresh from the actual bank (which the engine refills
  // via IRA/401k drawdowns). So the line oscillates around the "year-by-year
  // bank deficit" rather than compounding into a giant cumulative number.
  const avgBankGrowth = banks.length > 0
    ? banks.reduce((s, b) => s + (Number(b.growthRate) || 0), 0) / banks.length / 100
    : 0;
  const baseYear = new Date().getFullYear();
  // Effective simulation length:
  //   - If survivor scenario = "me first": run until WIFE reaches her life
  //     expectancy. Year offset = wifeLifeExp - spouseCurrentAge.
  //   - Otherwise: run until MY life expectancy.
  // We pick the LARGER so the result covers the longest-living spouse.
  const myYears = Math.max(0, lifeExpectancy - myCurrentAge + 1);
  const spouseYears = spouseCurrentAge > 0
    ? Math.max(0, spouseLifeExpectancy - spouseCurrentAge + 1)
    : 0;
  const survivorMeFirst = survivor.enabled && survivor.whoFirst === 'me';
  const totalYears = survivorMeFirst && spouseYears > 0
    ? spouseYears
    : myYears;

  // Helper: apply growth, possibly randomized for Monte Carlo runs.
  // Volatility is asset-class-aware:
  //   - 'none'  : bank, UL (deterministic — these don't swing in real life)
  //   - 'half'  : real estate (~5–8% historical, less volatile than stocks)
  //   - 'full'  : IRA, 401k (stock-heavy by default — matches user's volatility)
  // This makes Monte Carlo realistic: a bank doesn't lose 13% in a bad year.
  const grow = (balance, ratePct, volClass = 'full') => {
    if (!mc || volClass === 'none') return balance * (1 + ratePct / 100);
    const mean = ratePct / 100;
    const stddevPct = volClass === 'half' ? mc.volatility / 2 : mc.volatility;
    const stddev = stddevPct / 100;
    const actual = Math.max(-0.5, normalSample(mean, stddev));
    return balance * (1 + actual);
  };

  // ── Year-by-year loop ──────────────────────────────────────────────────
  for (let yo = 0; yo < totalYears; yo++) {
    const myAge = myCurrentAge + yo;
    const spouseAge = spouseCurrentAge + yo;
    const calYear = baseYear + yo;
    const infl = Math.pow(1 + inflation, yo);

    // Scenario flags
    const isInJapan = japan.enabled && myAge >= (Number(japan.moveAge) || 0);
    const isPostSurvivor = survivor.enabled && myAge >= (Number(survivor.eventAge) || 0);
    const colMult = isInJapan ? (Number(japan.costMultiplier) || 1) : 1;
    const survivorMult = isPostSurvivor ? (Number(survivor.expenseFactor) || 1) : 1;
    const japanWithdrawalRate = Number(japan.withdrawalTaxRate) || 0;

    // Track triggers (for flagging in the table)
    const flagJapanMove = isInJapan && !japanMoveTriggered;
    const flagSurvivor = isPostSurvivor && !survivorTriggered;
    if (flagJapanMove) japanMoveTriggered = true;
    if (flagSurvivor) survivorTriggered = true;

    // Snapshot the bank balance at the START of the year (before RMD,
    // growth, or any cash-flow events). Used later to compute the
    // per-year Cash Position metric (Option B).
    const bankAtStart = bankBalances.reduce((a, b) => a + b, 0);

    // Per-year retirement-account income (gross withdrawals), split by source
    // account type so the chart tooltip can show IRA vs 401k income each year.
    // Accumulated across RMDs, scheduled auto-deplete, and shortfall draws.
    let iraIncomeGross = 0;
    let k401IncomeGross = 0;

    // Investment income from auto-investing bank cash above the threshold.
    // Based on the START-of-year bank total (before this year's flows) to avoid
    // a circular dependency between income and the bank balance it feeds.
    const investIncome = bankInvestEnabled && bankAtStart > bankInvestThreshold
      ? (bankAtStart - bankInvestThreshold) * bankInvestRate
      : 0;

    // ── STEP 1: RMDs (forced withdrawals from Traditional accounts) ────
    let rmdGross = 0;
    let rmdTaxesPaid = 0;
    let rmdNetToBank = 0;
    const divisor = rmdDivisor(myAge);
    if (divisor) {
      const takeRMD = (balances, accounts) => {
        let g = 0;
        for (let i = 0; i < balances.length; i++) {
          if ((accounts[i].accountType ?? 'traditional') !== 'traditional') continue;
          if (balances[i] <= 0) continue;
          const rmd = balances[i] / divisor;
          balances[i] -= rmd;
          const rate = effectiveWithdrawalRate(accounts[i], isInJapan, japanWithdrawalRate);
          const tax = rmd * rate;
          rmdGross += rmd;
          rmdTaxesPaid += tax;
          rmdNetToBank += rmd - tax;
          g += rmd;
        }
        return g;
      };
      iraIncomeGross += takeRMD(iraBalances, iras);
      k401IncomeGross += takeRMD(k401Balances, k401s);
      if (bankBalances.length > 0 && rmdNetToBank > 0) {
        bankBalances[0] += rmdNetToBank;
      }
    }

    // ── STEP 1.5: Auto-deplete scheduled withdrawals ─────────────────────
    // When user enables this strategy, proactively withdraw from each
    // active retirement account using the standard annuity formula:
    //   PMT = balance × r / (1 - (1+r)^-n)
    // where r = account growth rate, n = remaining years to life expectancy.
    // Each year recalibrates against the current balance + remaining years,
    // so balance naturally hits ~$0 right at life expectancy. The withdrawal
    // is in ADDITION to (not instead of) any RMD already taken above.
    let autoDepGross = 0;
    let autoDepTax = 0;
    let autoDepToBank = 0;
    if (
      inputs.personal?.autoDepleteRetirement &&
      myAge >= myRetireAge
    ) {
      const remainingYears = Math.max(1, lifeExpectancy - myAge);
      const scheduleWithdraw = (balances, accounts) => {
        let g = 0;
        for (let i = 0; i < balances.length; i++) {
          if (balances[i] <= 0) continue;
          const earliest = Number(accounts[i].earliestWithdrawalAge) || 0;
          if (earliest > 0 && myAge < earliest) continue;
          const r = (Number(accounts[i].growthRate) || 0) / 100;
          let ann;
          if (r <= 0 || remainingYears <= 1) {
            ann = balances[i] / remainingYears;
          } else {
            ann = (balances[i] * r) / (1 - Math.pow(1 + r, -remainingYears));
          }
          ann = Math.min(ann, balances[i]);
          if (ann <= 0) continue;
          balances[i] -= ann;
          const rate = effectiveWithdrawalRate(accounts[i], isInJapan, japanWithdrawalRate);
          const tax = ann * rate;
          autoDepGross += ann;
          autoDepTax += tax;
          autoDepToBank += ann - tax;
          g += ann;
        }
        return g;
      };
      iraIncomeGross += scheduleWithdraw(iraBalances, iras);
      k401IncomeGross += scheduleWithdraw(k401Balances, k401s);
      if (bankBalances.length > 0 && autoDepToBank > 0) {
        bankBalances[0] += autoDepToBank;
      }
    }

    // ── STEP 2: Income ────────────────────────────────────────────────
    // Survivor handling: which spouse passes is configurable. Deceased
    // spouse's income/SS stops; surviving spouse keeps the LARGER of the
    // two SS checks (SSA survivor benefit rule).
    const whoFirst = survivor.whoFirst || 'spouse';
    const isSpouseDeceased = isPostSurvivor && whoFirst === 'spouse';
    const isMeDeceased = isPostSurvivor && whoFirst === 'me';

    // Working income grows by `incomeGrowth` per year (NOT necessarily the
    // same as price inflation). SS keeps using the inflation factor because
    // SSA actually applies COLA increases tied to CPI.
    // Income inputs are PRE-TAX (gross). Multiply by (1 − taxRate) to get
    // spendable take-home. The simulator's cash flow uses take-home.
    const incomeFactor = Math.pow(1 + incomeGrowth, yo);
    const myAfterTaxFactor = 1 - (Number(inputs.income.myTaxRate) || 0) / 100;
    const spouseAfterTaxFactor = 1 - (Number(inputs.income.spouseTaxRate) || 0) / 100;
    const myIncome = isMeDeceased
      ? 0
      : (myAge < myRetireAge ? (Number(inputs.income.myIncome) || 0) * 12 * incomeFactor * myAfterTaxFactor : 0);
    const spouseIncome = isSpouseDeceased
      ? 0
      : (spouseAge < spouseRetireAge ? (Number(inputs.income.spouseIncome) || 0) * 12 * incomeFactor * spouseAfterTaxFactor : 0);

    // Each spouse's OWN benefit (with their own claim-age adjustment).
    const myOwn =
      !isMeDeceased && myAge >= mySSAge && mySSAge > 0
        ? mySSMonthly * ssFactor(mySSAge) * 12 * infl
        : 0;
    const spouseOwn =
      !isSpouseDeceased && spouseAge >= spouseSSAge && spouseSSAge > 0
        ? spouseSSMonthly * ssFactor(spouseSSAge) * 12 * infl
        : 0;

    // SPOUSAL BENEFIT RULE (only applies while both alive AND both filed):
    // SSA pays a spouse their OWN benefit first, then adds a "spousal top-off"
    // (the excess) to bring their total up to 50% of the OTHER spouse's benefit.
    // Three rules captured here:
    //   1. Anchored to FRA: the 50% target uses the worker's FRA amount
    //      (mySSMonthly / spouseSSMonthly are the FRA-67 inputs). Delaying the
    //      worker's own claim past FRA does NOT raise the spousal maximum.
    //   2. Early-claim penalty: the excess is reduced if the RECEIVING spouse
    //      claims before their own FRA (~0.65× at 62 → ~32.5% of worker FRA).
    //   3. Activation trigger: no spousal until the worker has filed (and the
    //      receiving spouse has filed their own) — enforced by `bothFiled`.
    // The excess is computed on PIAs (FRA amounts): 0.5×worker − own, floored
    // at 0, then reduced for early claiming and added on top of the own check.
    const bothAlive = !isMeDeceased && !isSpouseDeceased;
    const bothFiled =
      bothAlive &&
      myAge >= mySSAge && mySSAge > 0 &&
      spouseAge >= spouseSSAge && spouseSSAge > 0;
    const spouseSpousalExcess = bothFiled
      ? Math.max(0, 0.50 * mySSMonthly - spouseSSMonthly) * spousalExcessFactor(spouseSSAge) * 12 * infl
      : 0;
    const mySpousalExcess = bothFiled
      ? Math.max(0, 0.50 * spouseSSMonthly - mySSMonthly) * spousalExcessFactor(mySSAge) * 12 * infl
      : 0;

    // Total = own (reduced for own claim age) + spousal top-off excess.
    let mySS = myOwn + mySpousalExcess;
    let spouseSS = spouseOwn + spouseSpousalExcess;

    // SURVIVOR BENEFIT: surviving spouse keeps the LARGER of the two own
    // benefits (the spousal rule no longer applies once one spouse is gone).
    if (isPostSurvivor) {
      // Recompute each spouse's OWN benefit ignoring the deceased flag, so
      // we can determine the larger of the two for inheritance purposes.
      const myOwnIfAlive = myAge >= mySSAge && mySSAge > 0
        ? mySSMonthly * ssFactor(mySSAge) * 12 * infl : 0;
      const spouseOwnIfAlive = spouseAge >= spouseSSAge && spouseSSAge > 0
        ? spouseSSMonthly * ssFactor(spouseSSAge) * 12 * infl : 0;
      const inheritedBenefit = Math.max(myOwnIfAlive, spouseOwnIfAlive);
      if (isSpouseDeceased) {
        mySS = inheritedBenefit;
        spouseSS = 0;
      } else if (isMeDeceased) {
        spouseSS = inheritedBenefit;
        mySS = 0;
      }
    }

    // ── STEP 3: Expenses + bracket-specific extra income ──────────────
    const bracket = bracketForAge(myAge, inputs.expenseBrackets);
    const livingMonthly = bracketMonthlyTotal(bracket) * infl * colMult * survivorMult;
    const livingAnnual = livingMonthly * 12;
    const travelAnnual = bracketAnnualTravel(bracket) * infl * colMult * survivorMult;
    // Bracket-defined "other income" (pension, rental, part-time, etc.) is
    // inflated and added to total income. NOT scaled by survivor factor —
    // a pension or rental keeps paying regardless of survivor status.
    const bracketIncomeAnnual = (Number(bracket.additionalIncome) || 0) * 12 * infl;

    // One-time large incomes scheduled for this age (inheritance, sale, etc.).
    // Same shape as one-time expenses but counted as income.
    let oneTimeIncomeTotal = 0;
    const oneTimeIncomesThisYear = [];
    (inputs.oneTimeIncomes || []).forEach((e) => {
      if (e.enabled === false) return; // explicitly disabled — skip
      const amt = Number(e.amount) || 0;
      const ageMatch = Number(e.age) || 0;
      if (amt <= 0 || ageMatch <= 0) return;
      if (ageMatch !== myAge) return;
      const inflated = amt * infl;
      oneTimeIncomeTotal += inflated;
      oneTimeIncomesThisYear.push({ description: e.description || '(no label)', amount: inflated });
    });

    // Rental income — applies once the house enters its rental phase.
    // Rent compounds at its own annualRentIncrease rate (NOT the general
    // CPI inflation factor), starting from today (year offset 0).
    const isInRentalPhase =
      rental.enabled && !houseSold && rentalStartAge > 0 && myAge >= rentalStartAge;
    const rentGrowthFactor = Math.pow(1 + rentIncreaseRate, yo);
    const rentalIncomeAnnual = isInRentalPhase
      ? rentalMonthlyIncome * 12 * rentGrowthFactor
      : 0;

    // ── Loans ────────────────────────────────────────────────────────
    // At start age: loan principal is deposited to bank (treated as a
    // positive cash flow — folded into netCashFlow below).
    // During loan term: monthly payment is fixed nominal (locked at start
    // year's inflation factor), deducted as an expense every year.
    let loanProceedsThisYear = 0;
    let loanPaymentThisYear = 0;
    const loansActiveThisYear = [];
    (inputs.loans || []).forEach((loan) => {
      // Per-loan enabled toggle — `enabled === false` skips this loan
      // entirely (no proceeds, no payments). Missing/true = active.
      if (loan.enabled === false) return;
      const startAge = Number(loan.age) || 0;
      const principal = Number(loan.amount) || 0;
      const durationYears = Number(loan.durationYears) || 0;
      const apr = Number(loan.apr) || 0;
      if (startAge <= 0 || principal <= 0 || durationYears <= 0) return;
      const startOffset = startAge - myCurrentAge;
      if (startOffset < 0) return;
      const startInfl = Math.pow(1 + inflation, startOffset);
      const inflatedPrincipal = principal * startInfl;
      const monthlyPayment = calcLoanPayment(inflatedPrincipal, durationYears, apr);
      if (myAge === startAge) {
        loanProceedsThisYear += inflatedPrincipal;
      }
      const loanEndAge = startAge + durationYears;
      if (yo >= startOffset && myAge < loanEndAge) {
        loanPaymentThisYear += monthlyPayment * 12;
        loansActiveThisYear.push({
          description: loan.description || `Loan`,
          monthly: monthlyPayment,
        });
      }
    });

    // ── Vehicle purchases ────────────────────────────────────────────
    // For each vehicle: down payment hits the purchase year (in nominal
    // dollars at that year); monthly loan payments span monthsToPay months
    // starting from that year. Both inflated by the PURCHASE year's factor
    // (loan payments are nominally constant once the loan locks in).
    let vehicleDownThisYear = 0;
    let vehicleAnnualPayment = 0;
    const vehiclesActiveThisYear = [];
    (inputs.vehicles || []).forEach((v) => {
      const purchaseAge = Number(v.age) || 0;
      const cost = Number(v.cost) || 0;
      const down = Number(v.down) || 0;
      const monthsToPay = Number(v.monthsToPay) || 0;
      const apr = Number(v.apr) || 0;
      if (purchaseAge <= 0) return;
      if (cost <= 0 && down <= 0) return;
      const purchaseYearOffset = purchaseAge - myCurrentAge;
      if (purchaseYearOffset < 0) return;
      const purchaseInfl = Math.pow(1 + inflation, purchaseYearOffset);
      // Auto-calc monthly from financed amount = max(0, cost - down).
      const financed = Math.max(0, cost - down);
      const monthlyAmount = (financed > 0 && monthsToPay > 0)
        ? calcLoanPayment(financed, monthsToPay / 12, apr)
        : 0;
      // Down at purchase year (inflated to that year)
      if (myAge === purchaseAge && down > 0) {
        vehicleDownThisYear += down * purchaseInfl;
      }
      // Monthly loan payments during loan term
      if (monthlyAmount > 0 && monthsToPay > 0 && yo >= purchaseYearOffset) {
        const monthsAfterPurchase = (yo - purchaseYearOffset) * 12;
        const remainingMonths = monthsToPay - monthsAfterPurchase;
        const paymentsThisYear = Math.max(0, Math.min(12, remainingMonths));
        if (paymentsThisYear > 0) {
          vehicleAnnualPayment += monthlyAmount * paymentsThisYear * purchaseInfl;
          vehiclesActiveThisYear.push({
            description: v.description || 'car',
            person: v.person || 'self',
            monthly: monthlyAmount,
          });
        }
      }
    });
    const vehicleTotalThisYear = vehicleDownThisYear + vehicleAnnualPayment;

    const totalIncome =
      myIncome + spouseIncome + mySS + spouseSS +
      bracketIncomeAnnual + oneTimeIncomeTotal + rentalIncomeAnnual +
      investIncome;

    // Mortgage (simulate 12 months of amortization with extra principal).
    // During the rental phase, the rental-specific extra principal REPLACES
    // the primary-residence one — typical use is "redirect rent into payoff".
    let mortgagePayment = 0;
    if (!houseSold && loanBalance > 0 && reMonthlyPI > 0) {
      const monthlyRate = reAPR / 12;
      const effectiveExtra = isInRentalPhase ? rentalExtraPI : reExtra;
      for (let m = 0; m < 12; m++) {
        if (loanBalance <= 0) break;
        const interest = loanBalance * monthlyRate;
        let principal = reMonthlyPI - interest + effectiveExtra;
        if (principal < 0) principal = 0;
        if (principal > loanBalance) principal = loanBalance;
        mortgagePayment += interest + principal;
        loanBalance -= principal;
      }
    }

    // Maintenance — rentals use a HIGHER rate (turnover, wear, vacancy fixes).
    let maintenanceAnnual = 0;
    if (!houseSold) {
      const effectiveRate = isInRentalPhase ? rentalMaintRate : maintenanceRate;
      maintenanceAnnual = homeValue * effectiveRate;
    }

    // Rental one-time setup cost — hits exactly the year rental starts.
    let rentalSetupThisYear = 0;
    if (
      rental.enabled && !houseSold && rentalStartAge > 0 &&
      myAge === rentalStartAge && !rentalSetupCharged && rentalSetupCost > 0
    ) {
      rentalSetupThisYear = rentalSetupCost * infl;
      rentalSetupCharged = true;
    }

    // ── New Home: purchase event + ongoing mortgage / maintenance ─────
    // The entered price is the NOMINAL price at the purchase age (what you
    // actually pay then). Down payment leaves the bank that year; the new
    // mortgage's P&I and maintenance are recurring expenses; appreciation is
    // applied in the growth step below; equity is added to net worth.
    let nhDownThisYear = 0;
    let nhMortgageThisYear = 0;
    let nhMaintThisYear = 0;
    let nhPurchasedThisYear = false;
    if (nhEnabled && !nhPurchased && nhPurchaseAge > 0 && myAge >= nhPurchaseAge) {
      nhValue = nhPrice;
      nhLoan = Math.max(0, nhPrice - nhDown);
      nhMonthlyPI = nhTermYears > 0 ? calcLoanPayment(nhLoan, nhTermYears, Number(newHome.apr) || 0) : 0;
      nhDownThisYear = nhDown;
      nhPurchased = true;
      nhPurchasedThisYear = true;
    }
    if (nhPurchased && !nhSold && nhLoan > 0 && nhMonthlyPI > 0) {
      const r = nhAPR / 12;
      for (let m = 0; m < 12; m++) {
        if (nhLoan <= 0) break;
        const interest = nhLoan * r;
        let principal = nhMonthlyPI - interest;
        if (principal < 0) principal = 0;
        if (principal > nhLoan) principal = nhLoan;
        nhMortgageThisYear += interest + principal;
        nhLoan -= principal;
      }
    }
    if (nhPurchased && !nhSold) {
      nhMaintThisYear = nhValue * nhMaintRate;
    }

    // UL premium. The FULL premium leaves take-home (an expense). The portion
    // net of the insurance fee (ulToCashMonthly) is added to the cash value
    // BELOW, just before growth, so it compounds at ulGrowth like the rest of
    // the surrender value. Premiums only apply while the policy is active and
    // before the cancel age.
    let ulPremiumAnnual = 0;
    let ulToCashAnnual = 0;
    if (!ulCancelled && myAge < ulCancelAge && ulPremiumMonthly > 0) {
      ulPremiumAnnual = ulPremiumMonthly * 12;
      ulToCashAnnual = ulToCashMonthly * 12;
    }

    // One-time large expenses scheduled for this age (wedding, car, reno…).
    // Amount is in today's dollars; inflated to nominal at this age.
    // Multiple expenses at the same age are summed. Skip rows with no amount.
    let oneTimeExpenseTotal = 0;
    const oneTimeExpensesThisYear = [];
    (inputs.oneTimeExpenses || []).forEach((e) => {
      if (e.enabled === false) return; // explicitly disabled — skip
      const amt = Number(e.amount) || 0;
      const ageMatch = Number(e.age) || 0;
      if (amt <= 0 || ageMatch <= 0) return;
      if (ageMatch !== myAge) return;
      const inflated = amt * infl;
      oneTimeExpenseTotal += inflated;
      oneTimeExpensesThisYear.push({ description: e.description || '(no label)', amount: inflated });
    });

    // ── STEP 4: Contributions ────────────────────────────────────────
    // Pre-tax 401k contributions DON'T reduce after-tax take-home — they
    // were already excluded before the user reported it. Post-tax (Roth)
    // 401k DOES reduce take-home. IRAs are funded from take-home in both
    // Traditional and Roth cases (you write a check from your bank).
    let iraContribImpactOnCashflow = 0;
    let k401ContribImpactOnCashflow = 0;
    let iraContribToBalance = iras.map(() => 0);
    let k401ContribToBalance = k401s.map(() => 0);

    iras.forEach((a, i) => {
      const stopAge = Math.min(Number(a.stopContribAge) || 0, myRetireAge);
      if (myAge >= stopAge) return;
      const c = (Number(a.monthlyContrib) || 0) * 12;
      iraContribToBalance[i] = c;
      iraContribImpactOnCashflow += c; // both Trad + Roth IRAs come from take-home
    });

    k401s.forEach((a, i) => {
      const stopAge = Math.min(Number(a.stopContribAge) || 0, myRetireAge);
      if (myAge >= stopAge) return;
      // Your monthly contribution (× 12) plus the employer's monthly match (× 12).
      // Match is in dollars — does NOT come from your take-home.
      const myAnnual = (Number(a.monthlyContrib) || 0) * 12;
      const matchAnnual = (Number(a.companyMonthlyMatch) || 0) * 12;
      k401ContribToBalance[i] = myAnnual + matchAnnual;
      if ((a.accountType ?? 'traditional') === 'roth') {
        // Roth 401k: post-tax — your share affects take-home
        k401ContribImpactOnCashflow += myAnnual;
      }
      // Traditional 401k: pre-tax — already excluded from after-tax take-home,
      // so it doesn't reduce cash flow again. Employer match never reduces
      // cash flow regardless of account type.
    });

    const totalCashflowImpactingContribs =
      iraContribImpactOnCashflow + k401ContribImpactOnCashflow;

    // ── STEP 5: Net cash flow (base, before life-event proceeds) ──────
    // House sale + UL surrender proceeds are folded in AFTER step 8 so they
    // show up as positive cash spikes on the chart line and are deposited
    // via the surplus path (instead of being directly added to bank).
    const totalExpenses =
      livingAnnual + travelAnnual + mortgagePayment +
      maintenanceAnnual + ulPremiumAnnual + oneTimeExpenseTotal +
      rentalSetupThisYear + vehicleTotalThisYear + loanPaymentThisYear +
      nhDownThisYear + nhMortgageThisYear + nhMaintThisYear;
    const operatingNetCashFlow =
      totalIncome - totalExpenses - totalCashflowImpactingContribs;

    // ── STEP 6 + 7: Apply contributions, then grow, using a HALF-YEAR
    // convention for the year's contributions. ──────────────────────────
    // Contributions arrive monthly through the year, so on average each
    // dollar is invested for ~half the year and earns ~half the annual
    // return in its contribution year. We model that exactly with:
    //   end = (balance + contribution/2) × (1 + r) + contribution/2
    // i.e. the prior balance earns a full year of growth; the year's
    // contributions earn half. Routing the first half through grow() keeps
    // Monte Carlo randomization intact. (The old code added the FULL
    // contribution before a full year of growth, overstating returns.)
    bankBalances = bankBalances.map((b, i) =>
      grow(b, Number(banks[i].growthRate) || 0, 'none')
    );
    // UL cash value: the post-fee premium (ulToCashAnnual) is this year's
    // contribution, given the same half-year treatment.
    if (!ulCancelled) {
      const half = ulToCashAnnual / 2;
      ulValue = grow(ulValue + half, ulGrowth * 100, 'none') + half;
    }
    iraBalances = iraBalances.map((b, i) => {
      const half = iraContribToBalance[i] / 2;
      return grow(b + half, Number(iras[i].growthRate) || 0, 'full') + half;
    });
    k401Balances = k401Balances.map((b, i) => {
      const half = k401ContribToBalance[i] / 2;
      return grow(b + half, Number(k401s[i].growthRate) || 0, 'full') + half;
    });
    if (!houseSold) homeValue = grow(homeValue, reAppr * 100, 'half');
    // New home appreciates each year it's owned (same half-year convention).
    if (nhPurchased && !nhSold) nhValue = grow(nhValue, nhAppr * 100, 'half');

    // ── STEP 8: Life events ───────────────────────────────────────────
    // Track proceeds separately (don't dump into bank yet) so we can fold
    // them into the displayed netCashFlow — making the cash-flow line on
    // the chart actually show the spike when a sale happens.
    let ulCancelledThisYear = false;
    let ulSurrenderProceeds = 0;
    if (!ulCancelled && ulCancelAge > 0 && myAge >= ulCancelAge) {
      ulSurrenderProceeds = ulValue;
      ulValue = 0;
      ulCancelled = true;
      ulCancelledThisYear = true;
    }

    // House sale trigger:
    //   - Rental DISABLED: use Real Estate's sellAge
    //   - Rental ENABLED: use rental.sellAge (0 = never sell, hold forever)
    let houseSoldThisYear = false;
    let houseSaleProceeds = 0;
    let houseSaleFee = 0;
    const triggerHouseSale = !houseSold && (
      (!rental.enabled && reSellAge > 0 && myAge >= reSellAge) ||
      (rental.enabled && rentalSellAge > 0 && myAge >= rentalSellAge)
    );
    if (triggerHouseSale) {
      // Selling cost is a % of the sale price (current home value), deducted
      // from proceeds along with paying off any remaining loan.
      houseSaleFee = homeValue * saleFeeRate;
      houseSaleProceeds = homeValue - loanBalance - houseSaleFee;
      houseSold = true;
      houseSoldThisYear = true;
      loanBalance = 0;
    }

    // New home sale (optional). At nhSellAge, sell the new home: proceeds =
    // value − remaining loan − sale fee, deposited to bank that year.
    let nhSoldThisYear = false;
    let nhSaleProceeds = 0;
    if (nhPurchased && !nhSold && nhSellAge > 0 && myAge >= nhSellAge) {
      const fee = nhValue * nhSaleFeeRate;
      nhSaleProceeds = nhValue - nhLoan - fee;
      nhSold = true;
      nhSoldThisYear = true;
      nhLoan = 0;
    }

    // ── STEP 9: Apply net cash flow ──────────────────────────────────
    // Combine operating cash flow with one-time life-event proceeds so the
    // displayed `netCashFlow` shows the full year's cash story (including
    // sale + UL surrender). The waterfall logic is unchanged.
    const netCashFlow =
      operatingNetCashFlow + houseSaleProceeds + ulSurrenderProceeds +
      loanProceedsThisYear + nhSaleProceeds;
    let totalWithdrawalGross = 0;
    let totalWithdrawalTax = 0;
    if (netCashFlow >= 0) {
      if (bankBalances.length > 0) bankBalances[0] += netCashFlow;
      else bankBalances.push(netCashFlow);
    } else {
      let shortfall = -netCashFlow;

      // Step 9a: Pull from banks, but never below collective emergency fund.
      const drainBanksTo = (floor) => {
        for (let i = 0; i < bankBalances.length && shortfall > 0; i++) {
          const totalBank = bankBalances.reduce((a, b) => a + b, 0);
          const available = Math.max(0, totalBank - floor);
          if (available <= 0) break;
          const take = Math.min(bankBalances[i], shortfall, available);
          bankBalances[i] -= take;
          shortfall -= take;
        }
      };
      drainBanksTo(emergencyFund);

      // (The bank-shortfall bankruptcy check moved BELOW — we now key
      // `moneyRunOutAge` off the unclamped `virtualBank` going negative,
      // so the chart's orange line and the Money Lasts indicator are
      // guaranteed to flip on the SAME year.)

      // Step 9b: Pull from IRAs/401ks (gross up for tax).
      // Skip any account whose earliestWithdrawalAge hasn't been reached —
      // the IRS imposes a 10% penalty on Traditional 401k/IRA before 59½,
      // so the user-configured age (default 60) acts as a hard floor.
      // RMDs are NOT subject to this — they're forced by law from 73 and
      // are handled in STEP 1 above.
      const drainTaxable = (balances, accounts) => {
        let g = 0;
        for (let i = 0; i < balances.length && shortfall > 0; i++) {
          if (balances[i] <= 0) continue;
          const earliest = Number(accounts[i].earliestWithdrawalAge) || 0;
          if (earliest > 0 && myAge < earliest) continue;
          const rate = effectiveWithdrawalRate(accounts[i], isInJapan, japanWithdrawalRate);
          const grossNeeded = shortfall / Math.max(1 - rate, 0.01);
          const take = Math.min(balances[i], grossNeeded);
          balances[i] -= take;
          const tax = take * rate;
          shortfall -= take - tax;
          totalWithdrawalGross += take;
          totalWithdrawalTax += tax;
          g += take;
        }
        return g;
      };
      iraIncomeGross += drainTaxable(iraBalances, iras);
      k401IncomeGross += drainTaxable(k401Balances, k401s);

      // Step 9c: As a final fallback, dip into the emergency fund itself
      // rather than fail outright. Mark money-run-out the year banks hit 0.
      if (shortfall > 0) {
        const totalBank = bankBalances.reduce((a, b) => a + b, 0);
        if (totalBank > 0) {
          for (let i = 0; i < bankBalances.length && shortfall > 0; i++) {
            const take = Math.min(bankBalances[i], shortfall);
            bankBalances[i] -= take;
            shortfall -= take;
          }
        }
        if (shortfall > 0 && moneyRunOutAge === null) {
          moneyRunOutAge = myAge;
        }
      }
    }

    // ── STEP 10: Build output row ─────────────────────────────────────
    const padTo3 = (arr, source) => {
      const out = [null, null, null];
      arr.forEach((v, i) => {
        const origIdx = source[i]._idx;
        if (origIdx < 3) out[origIdx] = v;
      });
      return out;
    };
    const bankCols = padTo3(bankBalances, banks);

    // IRAs and 401ks support an UNLIMITED number of accounts, so instead of
    // fixed ira1/2/3 + k401_1/2/3 columns we emit one entry per original slot
    // (in form order). Inactive slots get a null balance so the table can render
    // a blank cell while keeping column↔form alignment. Nicknames are repeated
    // on each row so ResultsTable (which only receives `rows`) can label them.
    const buildAccountCols = (sourceArr, activeArr, balances) => {
      const cols = (sourceArr || []).map((acc) => ({
        nickname: acc.nickname || '',
        balance: null,
      }));
      activeArr.forEach((a, i) => {
        if (a._idx < cols.length) cols[a._idx].balance = balances[i];
      });
      return cols;
    };
    const iraAccounts = buildAccountCols(inputs.iras, iras, iraBalances);
    const k401Accounts = buildAccountCols(inputs.k401s, k401s, k401Balances);

    const bankTotal = bankBalances.reduce((a, b) => a + b, 0);
    const netHomeEquity = houseSold ? 0 : homeValue - loanBalance;
    const newHomeEquity = (nhPurchased && !nhSold) ? nhValue - nhLoan : 0;
    const totalAssets =
      bankTotal +
      ulValue +
      iraBalances.reduce((a, b) => a + b, 0) +
      k401Balances.reduce((a, b) => a + b, 0);
    // Net worth includes BOTH home equities (current house + new home).
    const cumulativeNetWorth = totalAssets + netHomeEquity + newHomeEquity;

    yearly.push({
      year: calYear,
      myAge,
      spouseAge,
      myIncome,
      spouseIncome,
      mySS,
      spouseSS,
      bracketIncome: bracketIncomeAnnual,
      oneTimeIncome: oneTimeIncomeTotal,
      oneTimeIncomesThisYear,
      rentalIncome: rentalIncomeAnnual,
      rentalSetup: rentalSetupThisYear,
      totalIncome,
      bank1: bankCols[0], bank2: bankCols[1], bank3: bankCols[2],
      bankTotal,
      ulValue: ulCancelled ? 0 : ulValue,
      iraAccounts,
      k401Accounts,
      realEstateValue: houseSold ? 0 : homeValue,
      loanBalance: houseSold ? 0 : loanBalance,
      netHomeEquity,
      newHomeValue: (nhPurchased && !nhSold) ? nhValue : 0,
      newHomeLoan: (nhPurchased && !nhSold) ? nhLoan : 0,
      newHomeEquity,
      newHomeMortgage: nhMortgageThisYear,
      newHomeMaintenance: nhMaintThisYear,
      newHomeDown: nhDownThisYear,
      totalAssets,
      livingAnnual,
      travelAnnual,
      mortgagePayment,
      maintenanceAnnual,
      ulPremium: ulPremiumAnnual,
      oneTimeExpense: oneTimeExpenseTotal,
      oneTimeExpensesThisYear,
      vehicleExpense: vehicleTotalThisYear,
      vehiclesActiveThisYear,
      loanProceeds: loanProceedsThisYear,
      loanPayment: loanPaymentThisYear,
      loansActiveThisYear,
      totalExpenses,
      rmdGross,
      rmdTaxesPaid,
      // Per-year retirement-account income (gross) split by account type, plus
      // auto-invest income — all surfaced in the chart tooltip.
      iraIncome: iraIncomeGross,
      k401Income: k401IncomeGross,
      investIncome,
      autoDepGross,
      autoDepTax,
      autoDepToBank,
      withdrawalGross: totalWithdrawalGross,
      withdrawalTax: totalWithdrawalTax,
      taxesPaid: rmdTaxesPaid + totalWithdrawalTax + autoDepTax,
      houseSaleProceeds,
      houseSaleFee,
      ulSurrenderProceeds,
      operatingNetCashFlow,
      netCashFlow,
      // Cash Position — per-year view (Option B). Each year is independent.
      // Formula: (bank_start + RMD) × (1 + bank_growth) + netCashFlow.
      // This is a BANK-ONLY diagnostic: it shows whether the bank alone could
      // cover the year, ignoring IRA/401k drawdowns. A negative value just
      // means the bank was topped up from retirement accounts that year — it
      // does NOT mean you're out of money. So it must NOT set moneyRunOutAge;
      // genuine insolvency (banks AND IRA/401k exhausted) is detected in
      // STEP 9c above. (Previously this line wrongly flagged "money ran out"
      // in any year the bank dipped, even when usable retirement assets
      // covered the shortfall — especially with auto-deplete OFF.)
      cumulativeNetCashFlow:
        (bankAtStart + rmdNetToBank) * (1 + avgBankGrowth) + netCashFlow,
      cumulativeNetWorth,
      // Highlight flags
      flagRetireMe: myAge === myRetireAge,
      flagRetireSpouse: spouseAge === spouseRetireAge,
      flagSSStartMe: mySSAge > 0 && myAge === mySSAge,
      flagSSStartSpouse: spouseSSAge > 0 && spouseAge === spouseSSAge,
      flagHouseSold: houseSoldThisYear,
      flagULCancelled: ulCancelledThisYear,
      flagJapanMove,
      flagSurvivor,
      flagRMDStart: myAge === 73 && divisor !== null,
      flagOneTime: oneTimeExpenseTotal > 0,
      flagOneTimeIn: oneTimeIncomeTotal > 0,
      flagRentalStart: rental.enabled && myAge === rentalStartAge && rentalStartAge > 0,
      flagNewHome: nhPurchasedThisYear,
      flagNewHomeSold: nhSoldThisYear,
      flagVehiclePurchase: vehicleDownThisYear > 0,
      flagLoanStart: loanProceedsThisYear > 0,
      flagMoneyOut: moneyRunOutAge !== null && myAge === moneyRunOutAge,
    });
  }

  return { yearly, moneyRunOutAge };
}

// ──────────────────────────────────────────────────────────────────────────
// EARLIEST POSSIBLE RETIREMENT AGE — brute force search.
// ──────────────────────────────────────────────────────────────────────────
export function findPossibleRetirementAge(inputs) {
  const myCurrentAge = ageFromDOB(inputs.personal.myDOB);
  const lifeExpectancy = Number(inputs.personal.lifeExpectancy) || 90;
  for (let candidate = myCurrentAge; candidate <= lifeExpectancy; candidate++) {
    const sim = simulate(inputs, { myRetirementAge: candidate });
    if (sim.moneyRunOutAge === null) return candidate;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// RECOMMENDATIONS — when the deterministic plan fails (money runs out before
// life expectancy), try several common "what-if" adjustments and report
// which ones would fix it, with concrete numeric impact. No AI involved —
// pure deterministic re-simulation.
// ──────────────────────────────────────────────────────────────────────────
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function generateRecommendations(inputs, lang = 'en') {
  const main = simulate(inputs);
  if (main.moneyRunOutAge === null) return []; // plan already succeeds — no fixes needed

  const ja = lang === 'ja';
  const lifeExp = inputs.personal.lifeExpectancy;
  // Shared "Money lasts through age X" impact line, localized.
  const lastsStr = ja ? `資金が${lifeExp}歳まで持ちます` : `Money lasts through age ${lifeExp}`;
  const baselineFailureAge = main.moneyRunOutAge;
  const recs = [];

  // ── Lever 1: Delay retirement ──────────────────────────────────────────
  const possibleAge = findPossibleRetirementAge(inputs);
  const currentRetire = Number(inputs.income.myRetirementAge);
  if (possibleAge !== null && possibleAge > currentRetire) {
    const delay = possibleAge - currentRetire;
    recs.push({
      title: ja ? `退職を${delay}年遅らせる` : `Delay retirement by ${delay} year${delay > 1 ? 's' : ''}`,
      detail: ja
        ? `${currentRetire}歳ではなく${possibleAge}歳で退職します。就労年が1年増えるごとに貯蓄が増え、取り崩し期間も短くなります — 通常もっとも効果の大きい改善策です。`
        : `Retire at age ${possibleAge} instead of ${currentRetire}. Each extra working year adds savings AND shortens the drawdown period — usually the highest-impact fix.`,
      impact: lastsStr,
      kind: 'success',
    });
  }

  // ── Lever 2: Reduce living expenses ────────────────────────────────────
  // Binary search for the smallest % cut that makes the plan succeed.
  let lo = 1, hi = 60, found = null;
  for (let i = 0; i < 8 && lo <= hi; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const adj = deepClone(inputs);
    adj.expenseBrackets = (adj.expenseBrackets || []).map((b) => ({
      ...b,
      housing: (Number(b.housing) || 0) * (1 - mid / 100),
      auto: (Number(b.auto) || 0) * (1 - mid / 100),
      grocery: (Number(b.grocery) || 0) * (1 - mid / 100),
      insurance: (Number(b.insurance) || 0) * (1 - mid / 100),
      medical: (Number(b.medical) || 0) * (1 - mid / 100),
      other: (Number(b.other) || 0) * (1 - mid / 100),
      costPerTrip: (Number(b.costPerTrip) || 0) * (1 - mid / 100),
    }));
    const sim = simulate(adj);
    if (sim.moneyRunOutAge === null) { found = mid; hi = mid - 1; }
    else { lo = mid + 1; }
  }
  if (found !== null) {
    recs.push({
      title: ja ? `生活費を${found}%削減する` : `Cut living expenses by ${found}%`,
      detail: ja
        ? `すべての年齢帯で、住居・自動車・食費・保険・医療・その他・旅行費を${found}%削減します。プランが寿命まで持つために必要な最小の削減幅です。`
        : `Reduce housing, auto, grocery, insurance, medical, other, and travel costs by ${found}% across ALL age brackets. Smallest cut that makes the plan survive life expectancy.`,
      impact: lastsStr,
      kind: 'success',
    });
  } else {
    recs.push({
      title: ja ? `生活費を50%以上削減する` : `Cut living expenses by 50%+`,
      detail: ja
        ? `支出を50%削減してもプラン単独では成立しません — 他の改善策との併用が必要と思われます。`
        : `Even cutting expenses 50% won't save the plan on its own — likely needs to be combined with other fixes.`,
      kind: 'warning',
    });
  }

  // ── Lever 3: Delay Social Security to 70 ───────────────────────────────
  if (Number(inputs.ss.mySSAge) < 70 || Number(inputs.ss.spouseSSAge) < 70) {
    const adj = deepClone(inputs);
    adj.ss.mySSAge = 70;
    adj.ss.spouseSSAge = 70;
    const sim = simulate(adj);
    if (sim.moneyRunOutAge === null) {
      recs.push({
        title: ja ? `社会保障（SS）を70歳まで遅らせる` : `Delay Social Security to age 70`,
        detail: ja
          ? `夫婦とも早期ではなく70歳でSSを受給します。月額給付が最大24%増えます。注意：70歳までの期間は他の資産で生活費を賄う必要があります。`
          : `Both spouses claim SS at 70 instead of earlier. Boosts monthly benefits by up to 24%. Note: you'd need other assets to bridge the gap until 70.`,
        impact: lastsStr,
        kind: 'success',
      });
    } else if (sim.moneyRunOutAge > baselineFailureAge) {
      const extra = sim.moneyRunOutAge - baselineFailureAge;
      recs.push({
        title: ja ? `社会保障（SS）を70歳まで遅らせる` : `Delay Social Security to age 70`,
        detail: ja
          ? `プランを完全には解決しませんが、資金が持続する期間が${extra}年延びます。他の改善策と組み合わせると有効です。`
          : `Doesn't fully fix the plan, but extends funded years by ${extra}. Useful when combined with another fix.`,
        impact: ja
          ? `資金が尽きる年齢が${baselineFailureAge}歳から${sim.moneyRunOutAge}歳に延びます`
          : `Money runs out at age ${sim.moneyRunOutAge} instead of ${baselineFailureAge}`,
        kind: 'partial',
      });
    }
  }

  // ── Lever 4: Boost monthly savings ─────────────────────────────────────
  // Find smallest extra $/month into the first IRA (or 401k) that fixes it.
  const findFirstAccount = () => {
    const ira = inputs.iras.findIndex((a) => (Number(a.balance) || 0) > 0 || (Number(a.monthlyContrib) || 0) > 0);
    if (ira >= 0) return { type: 'iras', idx: ira };
    const k = inputs.k401s.findIndex((a) => (Number(a.balance) || 0) > 0 || (Number(a.monthlyContrib) || 0) > 0);
    if (k >= 0) return { type: 'k401s', idx: k };
    return null;
  };
  const target = findFirstAccount();
  if (target) {
    let savLo = 100, savHi = 5000, savFound = null;
    for (let i = 0; i < 8 && savLo <= savHi; i++) {
      const mid = Math.floor((savLo + savHi) / 2);
      const adj = deepClone(inputs);
      adj[target.type][target.idx].monthlyContrib =
        (Number(adj[target.type][target.idx].monthlyContrib) || 0) + mid;
      const sim = simulate(adj);
      if (sim.moneyRunOutAge === null) { savFound = mid; savHi = mid - 100; }
      else { savLo = mid + 100; }
    }
    if (savFound !== null) {
      const accountLabel = target.type === 'iras' ? `IRA ${target.idx + 1}` : `401k ${target.idx + 1}`;
      recs.push({
        title: ja
          ? `毎月 $${savFound.toLocaleString()} 多く貯蓄する`
          : `Save an extra $${savFound.toLocaleString()}/month`,
        detail: ja
          ? `${accountLabel} への毎月の拠出を $${savFound.toLocaleString()} 増やします。残りの就労期間の複利効果で不足を埋めます。`
          : `Increase your monthly contribution to ${accountLabel} by $${savFound.toLocaleString()}. Compounding over remaining working years closes the gap.`,
        impact: lastsStr,
        kind: 'success',
      });
    }
  }

  return recs;
}

// ──────────────────────────────────────────────────────────────────────────
// OPTIMIZATIONS — for SUCCESSFUL plans. Sweeps timing decisions (house sale
// age, UL cancel age, SS claim age) and reports which timing maximizes
// total wealth at life expectancy. Pure local computation.
// ──────────────────────────────────────────────────────────────────────────
export function generateOptimizations(inputs, lang = 'en') {
  const baseline = simulate(inputs);
  if (baseline.moneyRunOutAge !== null) return []; // only meaningful for successful plans

  const ja = lang === 'ja';
  const lifeExp = Number(inputs.personal.lifeExpectancy) || 90;
  // "+$X at age Y" impact line, localized.
  const impactStr = (gain) =>
    ja ? `+${formatGain(gain)}（${lifeExp}歳時点）` : `+${formatGain(gain)} at age ${lifeExp}`;
  const baselineLast = baseline.yearly[baseline.yearly.length - 1];
  const baselineNW = baselineLast ? baselineLast.cumulativeNetWorth : 0;

  // Helper: try a single mutation; return the resulting ending net worth,
  // or null if it caused the plan to fail.
  const tryWith = (mutate) => {
    const adj = deepClone(inputs);
    mutate(adj);
    const sim = simulate(adj);
    if (sim.moneyRunOutAge !== null) return null;
    const last = sim.yearly[sim.yearly.length - 1];
    return last ? last.cumulativeNetWorth : 0;
  };

  // Minimum gain (in dollars) needed before we surface a suggestion.
  // Filters out trivially-close alternatives where it's "basically the same."
  const MIN_GAIN = Math.max(10000, baselineNW * 0.02);

  const opts = [];

  // ── 1. House sale age ────────────────────────────────────────────────
  if ((Number(inputs.realEstate.value) || 0) > 0) {
    const currentSell = Number(inputs.realEstate.sellAge) || 0;
    let bestAge = currentSell;
    let bestNW = baselineNW;
    // Sweep ages in 5-year steps, plus a "never sell" option.
    const candidates = [55, 60, 65, 70, 75, 80, 85, 90];
    candidates.forEach((age) => {
      if (age >= lifeExp) return;
      const nw = tryWith((adj) => { adj.realEstate.sellAge = age; });
      if (nw !== null && nw > bestNW) { bestNW = nw; bestAge = age; }
    });
    // Also try "never sell" (sellAge past life expectancy)
    const nwNever = tryWith((adj) => { adj.realEstate.sellAge = lifeExp + 5; });
    if (nwNever !== null && nwNever > bestNW) { bestNW = nwNever; bestAge = 'never'; }

    if (bestAge !== currentSell && bestNW - baselineNW >= MIN_GAIN) {
      const gain = bestNW - baselineNW;
      const currentLabelEn = currentSell > 0 ? `at ${currentSell}` : 'never';
      const currentClauseJa = currentSell > 0
        ? `現在のプランでは家を${currentSell}歳で売却します。`
        : `現在のプランでは家を売却しない設定です。`;
      opts.push({
        title: ja
          ? (bestAge === 'never' ? `家を売らない` : `${bestAge}歳で家を売却`)
          : (bestAge === 'never' ? `Don't sell the house` : `Sell house at age ${bestAge}`),
        detail: ja
          ? `${currentClauseJa}${
              bestAge === 'never'
                ? '寿命まで保有することで、現金化による利益よりも値上がりの複利効果が長く働きます。'
                : `${bestAge}歳で売却すると、値上がり・維持費・現金需要のバランスが最も良くなります。`
            }`
          : `Your plan currently sells the house ${currentLabelEn}. ${
              bestAge === 'never'
                ? 'Holding it through life expectancy keeps the appreciation compounding longer than the cash conversion gains.'
                : `Selling at age ${bestAge} balances appreciation, maintenance, and cash-needs best.`
            }`,
        impact: impactStr(gain),
        kind: 'optimize',
        gainValue: gain,
      });
    }
  }

  // ── 2. UL cancel age ─────────────────────────────────────────────────
  const ulActive = (Number(inputs.ul.surrenderValue) || 0) > 0 ||
                   (Number(inputs.ul.monthlyPremium) || 0) > 0;
  if (ulActive) {
    const currentCancel = Number(inputs.ul.cancelAge) || 0;
    let bestAge = currentCancel;
    let bestNW = baselineNW;
    const candidates = [55, 60, 65, 70, 75, 80, 85];
    candidates.forEach((age) => {
      if (age >= lifeExp) return;
      const nw = tryWith((adj) => { adj.ul.cancelAge = age; });
      if (nw !== null && nw > bestNW) { bestNW = nw; bestAge = age; }
    });
    if (bestAge !== currentCancel && bestNW - baselineNW >= MIN_GAIN) {
      const gain = bestNW - baselineNW;
      const currentLabelEn = currentCancel > 0 ? `at age ${currentCancel}` : 'never';
      const currentClauseJa = currentCancel > 0
        ? `現在のプランでは${currentCancel}歳で解約します。`
        : `現在のプランでは解約しない設定です。`;
      opts.push({
        title: ja ? `${bestAge}歳でUL保険を解約` : `Cancel UL insurance at age ${bestAge}`,
        detail: ja
          ? `${currentClauseJa}${bestAge}歳で解約すると、解約返戻金の継続的な成長と、保険料の支払い負担とのバランスが最適になります。`
          : `Your plan currently cancels ${currentLabelEn}. Cancelling at ${bestAge} optimizes the trade-off between continued growth on surrender value vs ongoing premium drain.`,
        impact: impactStr(gain),
        kind: 'optimize',
        gainValue: gain,
      });
    }
  }

  // ── 3. My SS claim age ───────────────────────────────────────────────
  const mySSAmt = Number(inputs.ss.mySSAmount) || 0;
  if (mySSAmt > 0) {
    const currentMy = Number(inputs.ss.mySSAge) || 67;
    let bestAge = currentMy;
    let bestNW = baselineNW;
    [62, 63, 64, 65, 66, 67, 68, 69, 70].forEach((age) => {
      const nw = tryWith((adj) => { adj.ss.mySSAge = age; });
      if (nw !== null && nw > bestNW) { bestNW = nw; bestAge = age; }
    });
    if (bestAge !== currentMy && bestNW - baselineNW >= MIN_GAIN) {
      const gain = bestNW - baselineNW;
      opts.push({
        title: ja ? `自分の社会保障（SS）を${bestAge}歳で受給開始` : `Claim my Social Security at age ${bestAge}`,
        detail: ja
          ? `現在は${currentMy}歳で受給開始の設定です。${bestAge}歳で受給開始すると${
              bestAge > currentMy
                ? '、70歳まで年8%の繰下げ加算が付きます。'
                : '、受給年数が増え、その分が資産内で複利運用されます。'
            }`
          : `Currently set to claim at ${currentMy}. Claiming at ${bestAge} ${
              bestAge > currentMy
                ? '— delayed retirement credits add 8%/yr until 70'
                : '— starting earlier gives more years of payments that compound in your assets'
            }.`,
        impact: impactStr(gain),
        kind: 'optimize',
        gainValue: gain,
      });
    }
  }

  // ── 4. Wife's SS claim age ───────────────────────────────────────────
  const spouseSSAmt = Number(inputs.ss.spouseSSAmount) || 0;
  if (spouseSSAmt > 0) {
    const currentWife = Number(inputs.ss.spouseSSAge) || 67;
    let bestAge = currentWife;
    let bestNW = baselineNW;
    [62, 63, 64, 65, 66, 67, 68, 69, 70].forEach((age) => {
      const nw = tryWith((adj) => { adj.ss.spouseSSAge = age; });
      if (nw !== null && nw > bestNW) { bestNW = nw; bestAge = age; }
    });
    if (bestAge !== currentWife && bestNW - baselineNW >= MIN_GAIN) {
      const gain = bestNW - baselineNW;
      opts.push({
        title: ja ? `配偶者の社会保障（SS）を${bestAge}歳で受給開始` : `Claim spouse's Social Security at age ${bestAge}`,
        detail: ja
          ? `現在は${currentWife}歳で受給開始の設定です。${bestAge}歳で受給開始すると、世帯の生涯資産が最大化されます。`
          : `Currently set to claim at ${currentWife}. Claiming at ${bestAge} maximizes lifetime household wealth.`,
        impact: impactStr(gain),
        kind: 'optimize',
        gainValue: gain,
      });
    }
  }

  // ── 5. Delay retirement (for users who could work a couple more years) ─
  const currentRetire = Number(inputs.income.myRetirementAge);
  let bestRetire = currentRetire;
  let bestRetireNW = baselineNW;
  [currentRetire + 1, currentRetire + 2, currentRetire + 3, currentRetire + 5].forEach((age) => {
    if (age > lifeExp - 5) return;
    const nw = tryWith((adj) => { adj.income.myRetirementAge = age; });
    if (nw !== null && nw > bestRetireNW) { bestRetireNW = nw; bestRetire = age; }
  });
  if (bestRetire !== currentRetire && bestRetireNW - baselineNW >= MIN_GAIN) {
    const gain = bestRetireNW - baselineNW;
    const yrs = bestRetire - currentRetire;
    opts.push({
      title: ja
        ? `あと${yrs}年働く（${bestRetire}歳で退職）`
        : `Work ${yrs} more year${yrs > 1 ? 's' : ''} (retire at ${bestRetire})`,
      detail: ja
        ? `就労年が1年増えるごとに、追加の貯蓄が積み上がり、取り崩し期間も短くなります。仕事を楽しめるなら、これが最も効果の大きい一手です。`
        : `Each extra working year compounds additional savings AND shortens the drawdown period. If you enjoy your work, this is the highest-leverage move.`,
      impact: impactStr(gain),
      kind: 'optimize',
      gainValue: gain,
    });
  }

  // Sort biggest impact first so the most rewarding moves are at the top.
  opts.sort((a, b) => b.gainValue - a.gainValue);
  return opts;
}

function formatGain(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// ──────────────────────────────────────────────────────────────────────────
// AMOUNT-SWEEP OPTIMIZATIONS
// Tests different dollar amounts for adjustable monthly inputs:
//   - UL monthly premium
//   - Each IRA monthly contribution
//   - Each 401k monthly contribution
//   - Extra mortgage principal payment
// For each field, sweeps a handful of candidate amounts around the current
// value (and 0), runs the full simulation, picks the value that maximizes
// final net worth. Only suggested if the gain exceeds MIN_GAIN.
// ──────────────────────────────────────────────────────────────────────────
export function generateAmountOptimizations(inputs, lang = 'en') {
  const baseline = simulate(inputs);
  if (baseline.moneyRunOutAge !== null) return []; // only meaningful for success

  const ja = lang === 'ja';
  const baselineLast = baseline.yearly[baseline.yearly.length - 1];
  const baselineNW = baselineLast ? baselineLast.cumulativeNetWorth : 0;
  const lifeExp = Number(inputs.personal.lifeExpectancy) || 90;
  const MIN_GAIN = Math.max(10000, baselineNW * 0.02);

  // Test one mutation, return resulting ending net worth (or null on failure).
  const tryAmount = (mutate) => {
    const adj = deepClone(inputs);
    mutate(adj);
    const sim = simulate(adj);
    if (sim.moneyRunOutAge !== null) return null;
    const last = sim.yearly[sim.yearly.length - 1];
    return last ? last.cumulativeNetWorth : 0;
  };

  // Build 4-7 candidate dollar amounts around the current value, always
  // including 0 (the "stop entirely" case) and the current value itself.
  const candidatesAround = (current, step) => {
    const s = Math.max(1, Math.round(step));
    const set = new Set([0, current]);
    set.add(Math.max(0, current - s * 2));
    set.add(Math.max(0, current - s));
    set.add(current + s);
    set.add(current + s * 2);
    set.add(current + s * 3);
    return [...set].filter((v) => v >= 0).sort((a, b) => a - b);
  };

  const opts = [];
  const sweep = (label, current, mutate, detailBuilder, step) => {
    const candidates = candidatesAround(current, step);
    let best = current;
    let bestNW = baselineNW;
    candidates.forEach((amt) => {
      if (amt === current) return;
      const nw = tryAmount((adj) => mutate(adj, amt));
      if (nw !== null && nw > bestNW) {
        bestNW = nw;
        best = amt;
      }
    });
    if (best !== current && bestNW - baselineNW >= MIN_GAIN) {
      const gain = bestNW - baselineNW;
      opts.push({
        title: label(best, current),
        detail: detailBuilder(best, current, gain),
        impact: ja ? `+${formatGain(gain)}（${lifeExp}歳時点）` : `+${formatGain(gain)} at age ${lifeExp}`,
        kind: 'optimize',
        gainValue: gain,
      });
    }
  };

  // ── UL monthly premium ────────────────────────────────────────────────
  const ulPrem = Number(inputs.ul?.monthlyPremium) || 0;
  const ulSurr = Number(inputs.ul?.surrenderValue) || 0;
  if (ulPrem > 0 || ulSurr > 0) {
    sweep(
      (best) => ja
        ? (best === 0
            ? `UL保険料の支払いを停止（現在 ${formatGain(ulPrem)}/月）`
            : `UL保険料を ${formatGain(best)}/月 に変更`)
        : (best === 0
            ? `Stop paying UL premium (was ${formatGain(ulPrem)}/mo)`
            : `Change UL premium to ${formatGain(best)}/mo`),
      ulPrem,
      (adj, amt) => { adj.ul = { ...(adj.ul || {}), monthlyPremium: amt }; },
      (best, current) => ja
        ? (best === 0
            ? `${formatGain(current * 12)}/年 が浮き（UL保険料がなくなり）、その現金を他の口座で複利運用できます。失われる解約返戻金の成長分を上回ります。`
            : best > current
              ? `保険料を増やすと解約返戻金がより速く増え、解約時に現金として入金されます — ネットでプラスです。`
              : `保険料を抑えると毎月の現金負担が減り、解約返戻金の成長の大部分は維持されます。`)
        : (best === 0
            ? `Freeing up ${formatGain(current * 12)}/yr (no more UL premium) lets that cash compound in other accounts. The lost surrender-value growth is more than offset.`
            : best > current
              ? `Increasing premium grows the surrender value faster, which becomes a cash deposit when the policy is cancelled — net positive.`
              : `Trimming premium reduces monthly cash drag while preserving most of the surrender value growth.`),
      Math.max(50, Math.round(ulPrem / 3) || 100)
    );
  }

  // ── IRA contributions per account ─────────────────────────────────────
  (inputs.iras || []).forEach((ira, i) => {
    const current = Number(ira.monthlyContrib) || 0;
    const balance = Number(ira.balance) || 0;
    if (balance <= 0 && current <= 0) return; // inactive account, skip
    sweep(
      (best) => ja
        ? `IRA ${i + 1} の拠出を ${formatGain(best)}/月 に設定`
        : `Set IRA ${i + 1} contribution to ${formatGain(best)}/mo`,
      current,
      (adj, amt) => { adj.iras[i] = { ...adj.iras[i], monthlyContrib: amt }; },
      (best, current) => {
        const delta = best - current;
        if (ja) {
          return delta > 0
            ? `${formatGain(delta)}/月 増額（${formatGain(current)} → ${formatGain(best)}）。今は手元の現金が減りますが、口座の成長率で複利運用され、長期的にはプラスです。`
            : `${formatGain(-delta)}/月 減額（${formatGain(current)} → ${formatGain(best)}）。今の現金繰りは楽になりますが、口座内の複利効果は小さくなります。`;
        }
        if (delta > 0)
          return `Increase by ${formatGain(delta)}/mo (from ${formatGain(current)} to ${formatGain(best)}). More cash deferred today, but compounds at the account's growth rate — long-term win.`;
        return `Decrease by ${formatGain(-delta)}/mo (from ${formatGain(current)} to ${formatGain(best)}). Frees up cash flow now; the trade-off is less compounding inside the account.`;
      },
      Math.max(100, Math.round(current / 3) || 250)
    );
  });

  // ── 401k contributions per account ────────────────────────────────────
  (inputs.k401s || []).forEach((k, i) => {
    const current = Number(k.monthlyContrib) || 0;
    const balance = Number(k.balance) || 0;
    if (balance <= 0 && current <= 0) return;
    sweep(
      (best) => ja
        ? `401k ${i + 1} の拠出を ${formatGain(best)}/月 に設定`
        : `Set 401k ${i + 1} contribution to ${formatGain(best)}/mo`,
      current,
      (adj, amt) => { adj.k401s[i] = { ...adj.k401s[i], monthlyContrib: amt }; },
      (best, current) => {
        const delta = best - current;
        const type = (k.accountType ?? 'traditional');
        if (ja) {
          if (delta > 0)
            return `${formatGain(delta)}/月 増額（現在 ${formatGain(best)}）。${type === 'traditional' ? '税引前 — 手取りは減らず、残高にとって純粋にプラスです。' : 'Roth — 手取りから拠出しますが、非課税で複利運用されます。'}会社マッチがあれば、それに応じて増えます。`;
          return `${formatGain(-delta)}/月 減額（現在 ${formatGain(best)}）。${type === 'traditional' ? '他の口座に回せる退職口座の枠が空きます。' : '今の現金繰りが回復します。'}`;
        }
        if (delta > 0)
          return `Increase by ${formatGain(delta)}/mo (now ${formatGain(best)}). ${type === 'traditional' ? 'Pre-tax — does not reduce your take-home; pure win for the balance.' : 'Roth — comes from take-home but compounds tax-free.'} Match (if any) scales accordingly.`;
        return `Decrease by ${formatGain(-delta)}/mo (now ${formatGain(best)}). ${type === 'traditional' ? 'Frees up retirement-account headroom for other vehicles.' : 'Recovers cash flow today.'}`;
      },
      Math.max(100, Math.round(current / 3) || 250)
    );
  });

  // ── Extra mortgage principal ──────────────────────────────────────────
  const extraP = Number(inputs.realEstate?.extraPrincipal) || 0;
  const monthlyP = Number(inputs.realEstate?.monthlyPayment) || 0;
  if (monthlyP > 0) {
    sweep(
      (best) => ja
        ? (best === 0
            ? `繰上返済を停止（現在 ${formatGain(extraP)}/月）`
            : `繰上返済を ${formatGain(best)}/月 に設定`)
        : (best === 0
            ? `Stop extra principal payments (was ${formatGain(extraP)}/mo)`
            : `Set extra mortgage principal to ${formatGain(best)}/mo`),
      extraP,
      (adj, amt) => { adj.realEstate = { ...(adj.realEstate || {}), extraPrincipal: amt }; },
      (best, current) => {
        if (ja) {
          if (best === 0)
            return `繰上返済をやめると ${formatGain(current * 12)}/年 が浮きます。一般的な7%の運用は住宅ローンの実効金利を上回ることが多く、長期的にはプラスです。`;
          const delta = best - current;
          if (delta > 0)
            return `${formatGain(delta)}/月 増額。ローンの完済が早まり総支払利息は減りますが、投資に回せる現金が固定されます。`;
          return `${formatGain(-delta)}/月 減額。現金繰りが楽になります。運用が住宅ローンの利息削減効果を上回る可能性があります。`;
        }
        if (best === 0)
          return `Stopping extra principal frees up ${formatGain(current * 12)}/yr. Investments at typical 7% beat the mortgage's effective rate — usually a long-term win.`;
        const delta = best - current;
        if (delta > 0)
          return `Increase by ${formatGain(delta)}/mo. Faster loan payoff means less total interest, but ties up cash you could invest.`;
        return `Decrease by ${formatGain(-delta)}/mo. Frees up cash flow; investments may outperform the mortgage's interest savings.`;
      },
      Math.max(100, Math.round(extraP / 3) || 250)
    );
  }

  return opts;
}

// ──────────────────────────────────────────────────────────────────────────
// MONTE CARLO — run the simulation N times with randomized returns and
// summarize the distribution of outcomes.
// ──────────────────────────────────────────────────────────────────────────
export function runMonteCarlo(inputs) {
  const runs = Math.max(1, Math.min(2000, Number(inputs.monteCarlo?.runs) || 500));
  const volatility = Number(inputs.monteCarlo?.volatility) || 15;

  const finalNetWorths = [];
  let successCount = 0;
  let runOutAges = [];

  for (let i = 0; i < runs; i++) {
    const sim = simulate(inputs, {}, { randomize: true, volatility });
    const last = sim.yearly[sim.yearly.length - 1];
    finalNetWorths.push(last ? last.cumulativeNetWorth : 0);
    if (sim.moneyRunOutAge === null) successCount++;
    else runOutAges.push(sim.moneyRunOutAge);
  }

  finalNetWorths.sort((a, b) => a - b);
  const percentile = (p) => {
    const idx = Math.floor(p * (finalNetWorths.length - 1));
    return finalNetWorths[idx];
  };

  return {
    runs,
    successRate: successCount / runs,
    medianFinalNetWorth: percentile(0.5),
    p10FinalNetWorth: percentile(0.1),
    p90FinalNetWorth: percentile(0.9),
    medianRunOutAge:
      runOutAges.length === 0
        ? null
        : runOutAges.sort((a, b) => a - b)[Math.floor(runOutAges.length / 2)],
  };
}
