import React, { useEffect, useMemo, useState } from 'react';
import {
  simulate,
  findPossibleRetirementAge,
  ageFromDOB,
  runMonteCarlo,
  generateRecommendations,
  generateOptimizations,
  generateAmountOptimizations,
} from '../utils/calculations.js';
import { fmtMoney } from '../utils/format.js';
import { diffInputs, friendlyLabel, formatDiffValue } from '../utils/diff.js';
import { generateInsights, summarizeImpact, withPathSetTo } from '../utils/insights.js';
import { useT } from '../i18n.jsx';
import ResultsTable from './ResultsTable.jsx';
import ResultsChart from './ResultsChart.jsx';

export default function ResultsScreen({ data, onBack, previousSnapshot }) {
  const t = useT();
  const [mcResult, setMcResult] = useState(null);
  const [mcRunning, setMcRunning] = useState(false);

  // Always start the results page at the top — when the user clicks Calculate
  // from somewhere in the middle of the input form, we don't want them to
  // land mid-page on the results.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // ── Comparison vs the last Calculate snapshot ───────────────────────
  const comparison = useMemo(() => {
    if (!previousSnapshot) return null;
    try {
      const inputChanges = diffInputs(previousSnapshot, data);
      // Always compute the result diff so we can show "no input changes,
      // results identical" rather than hiding the panel.
      const prevSim = simulate(previousSnapshot);
      const currSim = simulate(data);
      const prevLast = prevSim.yearly[prevSim.yearly.length - 1];
      const currLast = currSim.yearly[currSim.yearly.length - 1];
      const prevRetireRow = prevSim.yearly.find(
        (r) => r.myAge === Number(previousSnapshot.income.myRetirementAge)
      );
      const currRetireRow = currSim.yearly.find(
        (r) => r.myAge === Number(data.income.myRetirementAge)
      );
      const prevPossible = findPossibleRetirementAge(previousSnapshot);
      const currPossible = findPossibleRetirementAge(data);
      const context = {
        myCurrentAge: ageFromDOB(data.personal.myDOB),
        myRetirementAge: Number(data.income.myRetirementAge) || 0,
        lifeExp: Number(data.personal.lifeExpectancy) || 90,
        // expose the current snapshot so the insights generator can reference
        // related fields (e.g. show "current monthly contribution" alongside a
        // stopAge change).
        data,
      };

      // Attribution: for each numeric input change, isolate its impact by
      // re-running the simulation with ONLY that field reverted to prev.
      // Result is "how much did this single change move final net worth?"
      const attributions = {};
      const currNW = currLast ? currLast.cumulativeNetWorth : 0;
      inputChanges.forEach((c) => {
        // Skip string-typed / nickname-style changes.
        if (typeof c.prev === 'string' || typeof c.curr === 'string') return;
        if (typeof c.prev === 'boolean' || typeof c.curr === 'boolean') return;
        if (c.prev === c.curr) return;
        try {
          const reverted = withPathSetTo(data, c.path, c.prev);
          const sim = simulate(reverted);
          const last = sim.yearly[sim.yearly.length - 1];
          const nwIfReverted = last ? last.cumulativeNetWorth : 0;
          attributions[c.path] = currNW - nwIfReverted;
        } catch {
          /* skip on error */
        }
      });

      return {
        inputChanges,
        context,
        attributions,
        metrics: {
          moneyLasts: {
            prev: prevSim.moneyRunOutAge === null,
            curr: currSim.moneyRunOutAge === null,
            prevAge: prevSim.moneyRunOutAge,
            currAge: currSim.moneyRunOutAge,
          },
          endingNetWorth: {
            prev: prevLast ? prevLast.cumulativeNetWorth : 0,
            curr: currLast ? currLast.cumulativeNetWorth : 0,
          },
          possibleAge: { prev: prevPossible, curr: currPossible },
          netWorthAtRetirement: {
            prev: prevRetireRow ? prevRetireRow.cumulativeNetWorth : null,
            curr: currRetireRow ? currRetireRow.cumulativeNetWorth : null,
          },
        },
      };
    } catch (err) {
      console.error('Comparison failed:', err);
      return null;
    }
  }, [previousSnapshot, data]);

  // Deterministic projection always runs (cheap)
  const result = useMemo(() => {
    try {
      const main = simulate(data);
      const possible = findPossibleRetirementAge(data);
      const retireRow = main.yearly.find(
        (r) => r.myAge === Number(data.income.myRetirementAge)
      );
      const bankAtRetirement = retireRow ? retireRow.bankTotal : null;
      const bankCurrent = main.yearly[0] ? main.yearly[0].bankTotal : null;
      const lastRow = main.yearly[main.yearly.length - 1] || null;

      // Net worth at life expectancy if the user retires at the planned age.
      // This is the "money left over" number that answers
      // "how much do I have at the end?"
      const endingNetWorthPlanned = lastRow ? lastRow.cumulativeNetWorth : null;

      // Same calculation but assuming retirement at the "earliest possible" age.
      let endingNetWorthAtPossible = null;
      if (possible !== null) {
        const sim2 = simulate(data, { myRetirementAge: possible });
        const tail = sim2.yearly[sim2.yearly.length - 1];
        endingNetWorthAtPossible = tail ? tail.cumulativeNetWorth : null;
      }

      // Recommendations help fix FAILED plans. Optimizations help maximize
      // SUCCESSFUL plans. They're mutually exclusive — you'll see at most one.
      const recommendations = main.moneyRunOutAge !== null
        ? generateRecommendations(data)
        : [];
      // Combine timing optimizations (sell age, SS age, etc.) AND amount
      // optimizations (UL premium, contributions, extra principal). Both
      // contribute to the same "ways to maximize wealth" list, sorted by
      // gain magnitude so the biggest wins surface first.
      const optimizations = main.moneyRunOutAge === null
        ? [
            ...generateOptimizations(data),
            ...generateAmountOptimizations(data),
          ].sort((a, b) => b.gainValue - a.gainValue)
        : [];

      return {
        yearly: main.yearly,
        moneyRunOutAge: main.moneyRunOutAge,
        possibleAge: possible,
        netWorthAtRetirement: retireRow ? retireRow.cumulativeNetWorth : null,
        endingNetWorthPlanned,
        endingNetWorthAtPossible,
        bankAtRetirement,
        bankCurrent,
        recommendations,
        optimizations,
        error: null,
      };
    } catch (err) {
      console.error('Calculation error:', err);
      return {
        yearly: [], moneyRunOutAge: null,
        possibleAge: null, netWorthAtRetirement: null,
        endingNetWorthPlanned: null, endingNetWorthAtPossible: null,
        recommendations: [], optimizations: [],
        error: err.message,
      };
    }
  }, [data]);

  // Monte Carlo runs on click (expensive — hundreds of simulations)
  const runMC = () => {
    setMcRunning(true);
    // Defer to next tick so the UI updates with "Running…" first
    setTimeout(() => {
      try {
        const mc = runMonteCarlo(data);
        setMcResult(mc);
      } catch (err) {
        console.error('Monte Carlo error:', err);
      } finally {
        setMcRunning(false);
      }
    }, 50);
  };

  const myCurrentAge = ageFromDOB(data.personal.myDOB);
  const lifeExp = Number(data.personal.lifeExpectancy) || 90;
  // Wife's life expectancy is ONLY relevant when survivor scenario is enabled
  // with "I pass first" — otherwise we assume both reach my life exp together.
  const survivorMeFirst = data.survivor?.enabled && data.survivor?.whoFirst === 'me';
  const wifeLifeExp = survivorMeFirst
    ? (Number(data.survivor?.wifeLifeExpectancy) || lifeExp + 2)
    : null;
  // The simulation actually ends at the last row's myAge — could be later
  // than `lifeExp` if survivor=me-first extended it to wife's life expectancy.
  const projectionEndAge = result.yearly.length > 0
    ? result.yearly[result.yearly.length - 1].myAge
    : lifeExp;
  const moneyLasts = result.moneyRunOutAge === null;
  const japanEnabled = data.japan?.enabled;
  const survivorEnabled = data.survivor?.enabled;
  const mcEnabled = data.monteCarlo?.enabled;

  return (
    <div className="results-screen">
      <div className="results-header">
        <h1>{t('res.title')}</h1>
        <button
          onClick={onBack}
          title="Return to the input form — keyboard shortcut: Ctrl + ← or Alt + ←"
        >
          {t('btn.back')} <span className="kbd-hint">Ctrl / Alt + ←</span>
        </button>
      </div>

      {result.error && (
        <div className="calc-error-box">
          <strong>Calculation error:</strong> {result.error}
          <br />
          <button onClick={onBack} style={{ marginTop: 12 }}>← Back to fix inputs</button>
        </div>
      )}

      {!result.error && (
        <>
          {/* ── Main chart (top of the results page so you see the full
                 trajectory first, before the What-Changed comparison) ── */}
          <ResultsChart
            rows={result.yearly}
            markers={{
              retireAge: Number(data.income.myRetirementAge) || null,
              possibleRetire: result.possibleAge,
              ssAge: Number(data.ss.mySSAge) || null,
              sellAge: Number(data.realEstate.sellAge) || null,
              japanAge: japanEnabled ? Number(data.japan.moveAge) : null,
              survivorAge: survivorEnabled ? Number(data.survivor.eventAge) : null,
              rmdAge: 73,
            }}
          />

          {/* ── Comparison with last Calculate ── */}
          {comparison && <ComparisonPanel comparison={comparison} />}

          {/* ── Top summary ── */}
          <div className="summary-banner">
            <SummaryCard
              label="My Current Age"
              value={myCurrentAge ?? '—'}
              sub={wifeLifeExp
                ? `Life exp: me ${lifeExp} · wife ${wifeLifeExp} (survivor)`
                : `Life expectancy: ${lifeExp}`}
            />
            <SummaryCard
              label="Planned Retirement"
              value={data.income.myRetirementAge}
              sub="income stops at this age"
            />
            <SummaryCard
              label="Earliest Possible Retirement"
              value={result.possibleAge ?? '—'}
              sub={result.possibleAge ? 'savings cover all costs' : 'not achievable on current savings'}
              highlight={!!result.possibleAge}
            />
            <SummaryCard
              label="Total Assets at Planned Retirement"
              value={result.netWorthAtRetirement !== null ? fmtMoney(result.netWorthAtRetirement) : '—'}
              sub={result.netWorthAtRetirement === null ? 'age outside projection' : ''}
            />
            <SummaryCard
              label="Money Lasts?"
              value={moneyLasts ? 'Yes ✓' : 'No ✗'}
              sub={moneyLasts
                ? `cash covers expenses through age ${projectionEndAge}${
                    survivorMeFirst && wifeLifeExp
                      ? ` (wife ${wifeLifeExp})`
                      : ''
                  }`
                : `bank cash runs out at age ${result.moneyRunOutAge} (would need to tap retirement accounts beyond this)`}
              danger={!moneyLasts}
            />
          </div>

          {/* Second row of cards — cash visibility */}
          <div className="summary-banner">
            <SummaryCard
              label="Bank Total — Today"
              value={result.bankCurrent !== null ? fmtMoney(result.bankCurrent) : '—'}
              sub="sum of all bank accounts now"
            />
            <SummaryCard
              label="Bank Total at Retirement"
              value={result.bankAtRetirement !== null ? fmtMoney(result.bankAtRetirement) : '—'}
              sub="cash on hand when income stops"
              highlight={result.bankAtRetirement !== null && result.bankAtRetirement > 0}
              danger={result.bankAtRetirement !== null && result.bankAtRetirement < 0}
            />
            <SummaryCard
              label={`Money Left at Age ${projectionEndAge} — Planned`}
              value={result.endingNetWorthPlanned !== null ? fmtMoney(result.endingNetWorthPlanned) : '—'}
              sub={`if you retire at ${data.income.myRetirementAge}`}
              highlight={result.endingNetWorthPlanned !== null && result.endingNetWorthPlanned > 0}
              danger={result.endingNetWorthPlanned !== null && result.endingNetWorthPlanned <= 0}
            />
            <SummaryCard
              label={`Money Left at Age ${projectionEndAge} — Earliest Possible`}
              value={result.endingNetWorthAtPossible !== null ? fmtMoney(result.endingNetWorthAtPossible) : '—'}
              sub={result.possibleAge ? `if you retire at ${result.possibleAge} (the threshold)` : '—'}
              danger={result.endingNetWorthAtPossible !== null && result.endingNetWorthAtPossible <= 0}
            />
          </div>

          {/* Explanation note */}
          <div className="endingnw-note">
            <strong>How to read these numbers:</strong> "Money Left at Age {projectionEndAge}"
            is your total assets (liquid accounts + home equity) at the end of the projection.
            {survivorMeFirst && (
              <> Because the survivor scenario is "I pass first", the projection runs until
              wife's life expectancy ({wifeLifeExp}) rather than mine ({lifeExp}).</>
            )}
            <ul>
              <li>If you retire at <strong>your planned age ({data.income.myRetirementAge})</strong>,
                you'll end with <strong>{result.endingNetWorthPlanned !== null ? fmtMoney(result.endingNetWorthPlanned) : '—'}</strong>.</li>
              {result.possibleAge !== null && (
                <li>If you retire at the <strong>earliest possible age ({result.possibleAge})</strong>,
                  you'll end with <strong>{result.endingNetWorthAtPossible !== null ? fmtMoney(result.endingNetWorthAtPossible) : '—'}</strong>.
                  This is your minimum "safe buffer" — it's positive because retirement happens at
                  whole-year boundaries (you can't retire mid-year), so there's always some leftover
                  when you cross the threshold. Retiring 1 year earlier than this would fail.</li>
              )}
            </ul>
            {result.endingNetWorthAtPossible !== null && result.endingNetWorthAtPossible > 200000 && (
              <p style={{ margin: '8px 0 0' }}>
                💡 <em>Notice the buffer is large?</em> That usually means your investment growth
                rates exceed your withdrawal rate — assets compound faster than you spend.
                If you want to see assets actually deplete toward zero, you can model it by lowering
                your account growth rates in the IRA/401k cards, or increasing your expense brackets.
              </p>
            )}
          </div>

          {/* ── Recommendations (only when plan fails) ── */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="recs-panel">
              <h3>🛟 How to Fix This Plan</h3>
              <p className="recs-note">
                Your money runs out at age {result.moneyRunOutAge}. Below are
                independent fixes (each calculated locally — no AI involved).
                Pick any one, or combine smaller versions of several.
              </p>
              <div className="recs-grid">
                {result.recommendations.map((r, i) => (
                  <div key={i} className={`rec-card rec-${r.kind}`}>
                    <div className="rec-title">{r.title}</div>
                    <div className="rec-detail">{r.detail}</div>
                    {r.impact && <div className="rec-impact">→ {r.impact}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Optimizations (only when plan succeeds) ── */}
          {result.optimizations && result.optimizations.length > 0 && (
            <div className="opts-panel">
              <h3>💡 Ways to Maximize Your Wealth</h3>
              <p className="opts-note">
                Your plan already succeeds. Below are independent tweaks that
                would leave you with even MORE at life expectancy — both
                <strong> timing decisions</strong> (sell-house age, SS claim age,
                retirement age) AND <strong>dollar amounts</strong> (UL premium,
                IRA / 401k contributions, extra mortgage principal). Sorted by
                biggest impact first. Each was found by re-running the simulation
                with that single change.
              </p>
              <div className="recs-grid">
                {result.optimizations.map((o, i) => (
                  <div key={i} className="opt-card">
                    <div className="rec-title">{o.title}</div>
                    <div className="rec-detail">{o.detail}</div>
                    <div className="opt-impact">→ {o.impact}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.optimizations && result.optimizations.length === 0 && result.moneyRunOutAge === null && (
            <div className="opts-panel opts-already-optimal">
              <h3>💡 Already Well-Optimized</h3>
              <p className="opts-note" style={{ marginBottom: 0 }}>
                Tested house-sale timing, UL-cancel timing, both spouses' SS claim ages,
                and delayed-retirement scenarios. None would improve your ending total assets
                by more than 2%. Your timing decisions look good.
              </p>
            </div>
          )}

          {/* ── Scenario flags ── */}
          {(japanEnabled || survivorEnabled) && (
            <div className="scenario-banner">
              {japanEnabled && (
                <div className="scenario-chip">
                  🌏 Relocation at age {data.japan.moveAge} ·
                  cost × {data.japan.costMultiplier} ·
                  withdrawal tax {data.japan.withdrawalTaxRate}%
                  {data.japan.sellHouseOnMove && ' · house auto-sold'}
                </div>
              )}
              {survivorEnabled && (
                <div className="scenario-chip">
                  🕯️ Survivor scenario at age {data.survivor.eventAge} ·
                  expenses × {data.survivor.expenseFactor}
                </div>
              )}
            </div>
          )}

          {/* ── Monte Carlo card ── */}
          {mcEnabled && (
            <div className="mc-card">
              <div className="mc-header">
                <h3>🎲 Monte Carlo Risk Analysis</h3>
                <button onClick={runMC} disabled={mcRunning}>
                  {mcRunning ? 'Running…' : (mcResult ? 'Re-run' : `Run ${data.monteCarlo.runs} simulations`)}
                </button>
              </div>
              {mcResult && (
                <div className="mc-stats">
                  <MCStat
                    label="Success rate"
                    value={`${(mcResult.successRate * 100).toFixed(1)}%`}
                    sub={`${mcResult.runs} runs · σ = ${data.monteCarlo.volatility}%`}
                    big
                    danger={mcResult.successRate < 0.75}
                    good={mcResult.successRate >= 0.85}
                  />
                  <MCStat
                    label="Final total assets — median"
                    value={fmtMoney(mcResult.medianFinalNetWorth)}
                    sub="50th percentile"
                  />
                  <MCStat
                    label="Worst-case (10th %ile)"
                    value={fmtMoney(mcResult.p10FinalNetWorth)}
                    sub="bottom 10% of outcomes"
                  />
                  <MCStat
                    label="Best-case (90th %ile)"
                    value={fmtMoney(mcResult.p90FinalNetWorth)}
                    sub="top 10% of outcomes"
                  />
                  {mcResult.medianRunOutAge !== null && (
                    <MCStat
                      label="Median failure age"
                      value={mcResult.medianRunOutAge}
                      sub="when funds typically run out in failed runs"
                      danger
                    />
                  )}
                </div>
              )}
              {!mcResult && !mcRunning && (
                <p className="mc-hint">
                  Click to estimate the probability your plan survives by re-running with
                  randomized returns. A success rate above 85% is generally considered safe;
                  below 75% is risky.
                </p>
              )}
            </div>
          )}

          {/* ── Remaining Assets at Key Ages ── */}
          <AssetLifelineTable
            rows={result.yearly}
            retireAge={Number(data.income.myRetirementAge)}
            lifeExp={projectionEndAge}
          />

          <p className="inflation-note">
            ℹ️ All future expenses and income are auto-inflated at <strong>{data.personal.inflationRate}%/year</strong>.
            You entered today's dollars — the table shows nominal (future) dollars at each age.
          </p>

          {/* (Chart was here originally; moved up near the comparison panel.) */}

          <ResultsTable rows={result.yearly} />
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, highlight, danger }) {
  const cls = ['summary-card'];
  if (highlight) cls.push('highlight');
  if (danger) cls.push('danger');
  return (
    <div className={cls.join(' ')}>
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
      {sub && <div className="summary-sub">{sub}</div>}
    </div>
  );
}

// AssetLifelineTable: a clear "what do I have left at each life milestone"
// view. Picks milestone ages (current, retirement, every 5 years, life
// expectancy) and shows total liquid assets + total net worth side by side.
// Far more scannable than scrolling the year-by-year table.
function AssetLifelineTable({ rows, retireAge, lifeExp }) {
  if (!rows || rows.length === 0) return null;

  // Build the set of milestone ages: current, retirement, every 5 years
  // between them and up to life expectancy, plus life expectancy itself.
  const firstAge = rows[0].myAge;
  const lastAge = rows[rows.length - 1].myAge;
  const milestoneSet = new Set([firstAge, lastAge]);
  if (retireAge >= firstAge && retireAge <= lastAge) milestoneSet.add(retireAge);
  // Every 5 years from rounded-up multiple of 5 after first age
  let a = Math.ceil(firstAge / 5) * 5;
  while (a <= lastAge) {
    milestoneSet.add(a);
    a += 5;
  }
  const milestones = Array.from(milestoneSet).sort((x, y) => x - y);

  // Helper: find the row at age `age` and previous row for delta computation.
  const rowAt = (age) => rows.find((r) => r.myAge === age) ?? null;

  return (
    <div className="asset-lifeline">
      <h3>💰 Total Assets at Key Ages</h3>
      <p className="lifeline-note">
        Total assets at each milestone (in nominal/future dollars) — liquid accounts
        plus home equity.
      </p>
      <div className="lifeline-grid">
        <div className="lifeline-header">
          <div>Age</div>
          <div>Total Assets</div>
          <div>Δ vs prior milestone</div>
        </div>
        {milestones.map((age, idx) => {
          const r = rowAt(age);
          if (!r) return null;
          const prevAge = idx > 0 ? milestones[idx - 1] : null;
          const prev = prevAge !== null ? rowAt(prevAge) : null;
          const delta = prev ? r.cumulativeNetWorth - prev.cumulativeNetWorth : null;
          const deltaCls = delta === null ? '' : delta >= 0 ? 'pos' : 'neg';
          const isRetire = age === retireAge;
          const isLife = age === lifeExp;
          // Danger keys off the LIQUID pool (still computed) — that's what
          // actually funds spending, even though we display total assets.
          const isDanger = r.totalAssets <= 0;
          const rowCls = [
            'lifeline-row',
            isRetire && 'is-retire',
            isLife && 'is-life',
            isDanger && 'is-danger',
          ].filter(Boolean).join(' ');
          return (
            <div key={age} className={rowCls}>
              <div className="lifeline-age">
                <span>
                  Age {age}
                  {r.wifeAge !== undefined && r.wifeAge !== age && (
                    <span className="lifeline-wife-age"> · wife {r.wifeAge}</span>
                  )}
                </span>
                {isRetire && <span className="tag tag-retire">Retire</span>}
                {isLife && <span className="tag tag-life">Life Exp.</span>}
              </div>
              <div className="lifeline-liquid">{fmtMoney(r.cumulativeNetWorth)}</div>
              <div className={`lifeline-delta ${deltaCls}`}>
                {delta === null
                  ? '—'
                  : `${delta >= 0 ? '+' : ''}${fmtMoney(delta)}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ComparisonPanel: shows inputs that changed since the last Calculate,
// the impact on results, AND a plain-English analysis explaining WHY each
// change affected the outcome — with per-change attribution + cash flow.
function ComparisonPanel({ comparison }) {
  const t = useT();
  const { inputChanges, metrics, context, attributions } = comparison;
  const insights = generateInsights(inputChanges, metrics, context, attributions);
  const summary = summarizeImpact(metrics);
  const noInputChanges = !inputChanges || inputChanges.length === 0;
  const noMetricChanges =
    metrics.moneyLasts.prev === metrics.moneyLasts.curr &&
    Math.abs(metrics.endingNetWorth.curr - metrics.endingNetWorth.prev) < 1 &&
    metrics.possibleAge.prev === metrics.possibleAge.curr;

  // Hide entirely when nothing changed AND nothing was different on the metrics.
  if (noInputChanges && noMetricChanges) {
    return (
      <div className="comparison-panel quiet">
        🔄 No inputs have changed since your last calculation.
      </div>
    );
  }

  const fmtDelta = (delta) => {
    if (delta === 0) return '±$0';
    const sign = delta > 0 ? '+' : '−';
    return `${sign}${fmtMoney(Math.abs(delta))}`;
  };
  const deltaClass = (delta) => (delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neutral');

  const endingDelta = metrics.endingNetWorth.curr - metrics.endingNetWorth.prev;
  const retireNWDelta =
    metrics.netWorthAtRetirement.prev !== null && metrics.netWorthAtRetirement.curr !== null
      ? metrics.netWorthAtRetirement.curr - metrics.netWorthAtRetirement.prev
      : null;

  return (
    <div className="comparison-panel">
      <h3>{t('res.whatChanged')}</h3>

      {/* Inputs side — uses the same .impact-row grid as the Impact section
          below so the Before/After columns line up vertically. */}
      <div className="comparison-section">
        <h4>Inputs ({inputChanges.length} change{inputChanges.length === 1 ? '' : 's'})</h4>
        {inputChanges.length === 0 ? (
          <p className="comparison-empty">No input fields changed.</p>
        ) : (
          <div className="impact-grid">
            <div className="impact-row impact-header-row">
              <div className="impact-label">Field</div>
              <div className="impact-before">Before</div>
              <div className="impact-arrow"></div>
              <div className="impact-after">After</div>
              <div className="impact-delta"></div>
            </div>
            {inputChanges.slice(0, 50).map((c, i) => (
              <div key={i} className="impact-row">
                <div className="impact-label">{friendlyLabel(c.path)}</div>
                <div className="impact-before">{formatDiffValue(c.prev)}</div>
                <div className="impact-arrow">→</div>
                <div className="impact-after">{formatDiffValue(c.curr)}</div>
                <div className="impact-delta"></div>
              </div>
            ))}
            {inputChanges.length > 50 && (
              <div className="impact-row" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                <div className="impact-label" style={{ gridColumn: '1 / -1' }}>
                  …and {inputChanges.length - 50} more
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results side */}
      <div className="comparison-section">
        <h4>Impact on Results</h4>
        <div className="impact-grid">
          <div className="impact-row impact-header-row">
            <div className="impact-label">Metric</div>
            <div className="impact-before">Before</div>
            <div className="impact-arrow"></div>
            <div className="impact-after">After</div>
            <div className="impact-delta">Δ</div>
          </div>
          <ImpactRow
            label="Money lasts to life expectancy?"
            before={metrics.moneyLasts.prev ? 'Yes ✓' : `No (runs out @ ${metrics.moneyLasts.prevAge})`}
            after={metrics.moneyLasts.curr ? 'Yes ✓' : `No (runs out @ ${metrics.moneyLasts.currAge})`}
            highlight={metrics.moneyLasts.prev !== metrics.moneyLasts.curr}
            improved={!metrics.moneyLasts.prev && metrics.moneyLasts.curr}
            worsened={metrics.moneyLasts.prev && !metrics.moneyLasts.curr}
          />
          <ImpactRow
            label="Ending total assets (at life expectancy)"
            before={fmtMoney(metrics.endingNetWorth.prev)}
            after={fmtMoney(metrics.endingNetWorth.curr)}
            delta={fmtDelta(endingDelta)}
            deltaClass={deltaClass(endingDelta)}
          />
          {retireNWDelta !== null && (
            <ImpactRow
              label="Total assets at planned retirement"
              before={fmtMoney(metrics.netWorthAtRetirement.prev)}
              after={fmtMoney(metrics.netWorthAtRetirement.curr)}
              delta={fmtDelta(retireNWDelta)}
              deltaClass={deltaClass(retireNWDelta)}
            />
          )}
          <ImpactRow
            label="Earliest possible retirement age"
            before={metrics.possibleAge.prev ?? '—'}
            after={metrics.possibleAge.curr ?? '—'}
            highlight={metrics.possibleAge.prev !== metrics.possibleAge.curr}
            improved={
              metrics.possibleAge.prev !== null && metrics.possibleAge.curr !== null &&
              metrics.possibleAge.curr < metrics.possibleAge.prev
            }
            worsened={
              metrics.possibleAge.prev !== null && metrics.possibleAge.curr !== null &&
              metrics.possibleAge.curr > metrics.possibleAge.prev
            }
          />
        </div>
      </div>

      {/* ── Analysis: plain-English why-it-changed ── */}
      {(insights.length > 0 || summary) && (
        <div className="comparison-section">
          <h4>分析 — 結果が変わった理由（Analysis）</h4>
          {summary && (
            <div className={`impact-summary tone-${summary.tone}`}>
              {summary.text}
            </div>
          )}
          {insights.length > 0 && (
            <div className="insights-list">
              {insights.map((ins, i) => (
                <div key={i} className="insight-item">
                  <div className="insight-summary">{ins.text}</div>
                  {ins.details && ins.details.length > 0 && (
                    <ul className="insight-details">
                      {ins.details.map((d, j) => <li key={j}>{d}</li>)}
                    </ul>
                  )}
                  {ins.attribution && (
                    <div className={`insight-attribution ${ins.attribution.cls}`}>
                      {ins.attribution.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImpactRow({ label, before, after, delta, deltaClass, highlight, improved, worsened }) {
  const rowCls = ['impact-row'];
  if (improved) rowCls.push('improved');
  if (worsened) rowCls.push('worsened');
  if (highlight && !improved && !worsened) rowCls.push('highlighted');
  return (
    <div className={rowCls.join(' ')}>
      <div className="impact-label">{label}</div>
      <div className="impact-before">{before}</div>
      <div className="impact-arrow">→</div>
      <div className="impact-after">{after}</div>
      {delta && <div className={`impact-delta ${deltaClass || ''}`}>{delta}</div>}
    </div>
  );
}

function MCStat({ label, value, sub, big, danger, good }) {
  const cls = ['mc-stat'];
  if (big) cls.push('big');
  if (danger) cls.push('danger');
  if (good) cls.push('good');
  return (
    <div className={cls.join(' ')}>
      <div className="mc-stat-label">{label}</div>
      <div className="mc-stat-value">{value}</div>
      {sub && <div className="mc-stat-sub">{sub}</div>}
    </div>
  );
}
