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
import { useT, useLang } from '../i18n.jsx';
import ResultsTable from './ResultsTable.jsx';
import ResultsChart from './ResultsChart.jsx';

export default function ResultsScreen({ data, onBack, previousSnapshot }) {
  const t = useT();
  const { lang } = useLang();
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
        ? generateRecommendations(data, lang)
        : [];
      // Combine timing optimizations (sell age, SS age, etc.) AND amount
      // optimizations (UL premium, contributions, extra principal). Both
      // contribute to the same "ways to maximize wealth" list, sorted by
      // gain magnitude so the biggest wins surface first.
      const optimizations = main.moneyRunOutAge === null
        ? [
            ...generateOptimizations(data, lang),
            ...generateAmountOptimizations(data, lang),
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
  }, [data, lang]);

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
      </div>

      {/* Floating Back button — always visible at the bottom of the page. */}
      <div className="floating-actions">
        <button
          className="btn-back"
          onClick={onBack}
          title="Return to the input form — keyboard shortcut: Ctrl + ← or Alt + ←"
        >
          ← {t('btn.back')} <span className="kbd-hint">Ctrl / Alt + ←</span>
        </button>
      </div>

      {result.error && (
        <div className="calc-error-box">
          <strong>{t('res.calcError')}</strong> {result.error}
          <br />
          <button onClick={onBack} style={{ marginTop: 12 }}>{t('res.backToFix')}</button>
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
              label={t('res.curAge')}
              value={myCurrentAge ?? '—'}
              sub={wifeLifeExp
                ? `${t('res.lifeExpLabel')}: ${t('res.me')} ${lifeExp} · ${t('res.spouseWord')} ${wifeLifeExp} (${t('res.survivorWord')})`
                : `${t('res.lifeExpLabel')}: ${lifeExp}`}
            />
            <SummaryCard
              label={t('res.plannedRetire')}
              value={data.income.myRetirementAge}
              sub={t('res.incomeStops')}
            />
            <SummaryCard
              label={t('res.earliestRetire')}
              value={result.possibleAge ?? '—'}
              sub={result.possibleAge ? t('res.savingsCover') : t('res.notAchievable')}
              highlight={!!result.possibleAge}
            />
            <SummaryCard
              label={t('res.totalAtRetire')}
              value={result.netWorthAtRetirement !== null ? fmtMoney(result.netWorthAtRetirement) : '—'}
              sub={result.netWorthAtRetirement === null ? t('res.ageOutside') : ''}
            />
            <SummaryCard
              label={t('res.moneyLasts')}
              value={moneyLasts ? t('res.yes') : t('res.no')}
              sub={moneyLasts
                ? `${t('res.cashCovers')} ${projectionEndAge}${
                    survivorMeFirst && wifeLifeExp
                      ? ` (${t('res.wifeWord')} ${wifeLifeExp})`
                      : ''
                  }`
                : `${t('res.bankRunsOut')} ${result.moneyRunOutAge} ${t('res.wouldNeedTap')}`}
              danger={!moneyLasts}
            />
          </div>

          {/* Second row of cards — cash visibility */}
          <div className="summary-banner">
            <SummaryCard
              label={t('res.bankToday')}
              value={result.bankCurrent !== null ? fmtMoney(result.bankCurrent) : '—'}
              sub={t('res.sumBanksNow')}
            />
            <SummaryCard
              label={t('res.bankAtRetire')}
              value={result.bankAtRetirement !== null ? fmtMoney(result.bankAtRetirement) : '—'}
              sub={t('res.cashWhenStops')}
              highlight={result.bankAtRetirement !== null && result.bankAtRetirement > 0}
              danger={result.bankAtRetirement !== null && result.bankAtRetirement < 0}
            />
            <SummaryCard
              label={`${t('res.moneyLeftAtAge')} ${projectionEndAge} — ${t('res.planned')}`}
              value={result.endingNetWorthPlanned !== null ? fmtMoney(result.endingNetWorthPlanned) : '—'}
              sub={`${t('res.ifRetireAt')} ${data.income.myRetirementAge}`}
              highlight={result.endingNetWorthPlanned !== null && result.endingNetWorthPlanned > 0}
              danger={result.endingNetWorthPlanned !== null && result.endingNetWorthPlanned <= 0}
            />
            <SummaryCard
              label={`${t('res.moneyLeftAtAge')} ${projectionEndAge} — ${t('res.earliestPoss')}`}
              value={result.endingNetWorthAtPossible !== null ? fmtMoney(result.endingNetWorthAtPossible) : '—'}
              sub={result.possibleAge ? `${t('res.ifRetireAt')} ${result.possibleAge} ${t('res.threshold')}` : '—'}
              danger={result.endingNetWorthAtPossible !== null && result.endingNetWorthAtPossible <= 0}
            />
          </div>

          {/* Explanation note */}
          <div className="endingnw-note">
            <strong>{t('res.howToRead')}</strong> {t('res.moneyLeftExplain')}
            {survivorMeFirst && (
              <> {t('res.survivorClause')} ({t('res.spouseWord')} {wifeLifeExp} / {t('res.me')} {lifeExp})</>
            )}
            <ul>
              <li>{t('res.ifPlannedAge')} (<strong>{data.income.myRetirementAge}</strong>),
                {t('res.youllEndWith')} <strong>{result.endingNetWorthPlanned !== null ? fmtMoney(result.endingNetWorthPlanned) : '—'}</strong>.</li>
              {result.possibleAge !== null && (
                <li>{t('res.ifEarliestAge')} (<strong>{result.possibleAge}</strong>),
                  {t('res.youllEndWith')} <strong>{result.endingNetWorthAtPossible !== null ? fmtMoney(result.endingNetWorthAtPossible) : '—'}</strong>.
                  {' '}{t('res.bufferExplain')}</li>
              )}
            </ul>
            {result.endingNetWorthAtPossible !== null && result.endingNetWorthAtPossible > 200000 && (
              <p style={{ margin: '8px 0 0' }}>
                💡 <em>{t('res.bufferLargeQ')}</em> {t('res.bufferLargeExplain')}
              </p>
            )}
          </div>

          {/* ── Recommendations (only when plan fails) ── */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="recs-panel">
              <h3>{t('res.fixTitle')}</h3>
              <p className="recs-note">
                {t('res.fixNoteA')} {result.moneyRunOutAge}. {t('res.fixNoteB')}
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
              <h3>{t('res.maxTitle')}</h3>
              <p className="opts-note">
                {t('res.maxNote')}
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
              <h3>{t('res.alreadyOptTitle')}</h3>
              <p className="opts-note" style={{ marginBottom: 0 }}>
                {t('res.alreadyOptNote')}
              </p>
            </div>
          )}

          {/* ── Scenario flags ── */}
          {(japanEnabled || survivorEnabled) && (
            <div className="scenario-banner">
              {japanEnabled && (
                <div className="scenario-chip">
                  🌏 {t('res.chipReloc')} {data.japan.moveAge} ·
                  {' '}{t('res.chipCostX')} {data.japan.costMultiplier} ·
                  {' '}{t('res.chipWdTax')} {data.japan.withdrawalTaxRate}%
                  {data.japan.sellHouseOnMove && ` · ${t('res.chipHouseSold')}`}
                </div>
              )}
              {survivorEnabled && (
                <div className="scenario-chip">
                  🕯️ {t('res.chipSurvivor')} {data.survivor.eventAge} ·
                  {' '}{t('res.chipExpX')} {data.survivor.expenseFactor}
                </div>
              )}
            </div>
          )}

          {/* ── Monte Carlo card ── */}
          {mcEnabled && (
            <div className="mc-card">
              <div className="mc-header">
                <h3>{t('res.mcTitle')}</h3>
                <button onClick={runMC} disabled={mcRunning}>
                  {mcRunning ? t('res.mcRunning') : (mcResult ? t('res.mcRerun') : `${t('res.mcRun')} ${data.monteCarlo.runs} ${t('res.mcSims')}`)}
                </button>
              </div>
              {mcResult && (
                <div className="mc-stats">
                  <MCStat
                    label={t('res.mcSuccessRate')}
                    value={`${(mcResult.successRate * 100).toFixed(1)}%`}
                    sub={`${mcResult.runs} ${t('res.mcRuns')} · σ = ${data.monteCarlo.volatility}%`}
                    big
                    danger={mcResult.successRate < 0.75}
                    good={mcResult.successRate >= 0.85}
                  />
                  <MCStat
                    label={t('res.mcMedianNW')}
                    value={fmtMoney(mcResult.medianFinalNetWorth)}
                    sub={t('res.mc50th')}
                  />
                  <MCStat
                    label={t('res.mcWorst')}
                    value={fmtMoney(mcResult.p10FinalNetWorth)}
                    sub={t('res.mcBottom10')}
                  />
                  <MCStat
                    label={t('res.mcBest')}
                    value={fmtMoney(mcResult.p90FinalNetWorth)}
                    sub={t('res.mcTop10')}
                  />
                  {mcResult.medianRunOutAge !== null && (
                    <MCStat
                      label={t('res.mcMedFail')}
                      value={mcResult.medianRunOutAge}
                      sub={t('res.mcMedFailSub')}
                      danger
                    />
                  )}
                </div>
              )}
              {!mcResult && !mcRunning && (
                <p className="mc-hint">{t('res.mcHint')}</p>
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
            ℹ️ {t('res.inflNoteA')} <strong>{data.personal.inflationRate}%/year</strong>.
            {' '}{t('res.inflNoteB')}
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
  const t = useT();
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
      <h3>{t('res.lifelineTitle')}</h3>
      <p className="lifeline-note">{t('res.lifelineNote')}</p>
      <div className="lifeline-grid">
        <div className="lifeline-header">
          <div>{t('res.colAge')}</div>
          <div>{t('res.colTotalAssets')}</div>
          <div>{t('res.colDelta')}</div>
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
                  {t('res.ageWord')} {age}
                  {r.wifeAge !== undefined && r.wifeAge !== age && (
                    <span className="lifeline-wife-age"> · {t('res.spouseWord')} {r.wifeAge}</span>
                  )}
                </span>
                {isRetire && <span className="tag tag-retire">{t('res.tagRetire')}</span>}
                {isLife && <span className="tag tag-life">{t('res.tagLifeExp')}</span>}
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
  const { lang } = useLang();
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
        {t('res.cmpNoChange')}
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
        <h4>{t('res.cmpInputs')} ({inputChanges.length} {inputChanges.length === 1 ? t('res.cmpChange') : t('res.cmpChanges')})</h4>
        {inputChanges.length === 0 ? (
          <p className="comparison-empty">{t('res.cmpNoInput')}</p>
        ) : (
          <div className="impact-grid">
            <div className="impact-row impact-header-row">
              <div className="impact-label">{t('res.cmpField')}</div>
              <div className="impact-before">{t('res.cmpBefore')}</div>
              <div className="impact-arrow"></div>
              <div className="impact-after">{t('res.cmpAfter')}</div>
              <div className="impact-delta"></div>
            </div>
            {inputChanges.slice(0, 50).map((c, i) => (
              <div key={i} className="impact-row">
                <div className="impact-label">{friendlyLabel(c.path, lang)}</div>
                <div className="impact-before">{formatDiffValue(c.prev, lang)}</div>
                <div className="impact-arrow">→</div>
                <div className="impact-after">{formatDiffValue(c.curr, lang)}</div>
                <div className="impact-delta"></div>
              </div>
            ))}
            {inputChanges.length > 50 && (
              <div className="impact-row" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                <div className="impact-label" style={{ gridColumn: '1 / -1' }}>
                  {t('res.cmpAndMore')} {inputChanges.length - 50} {t('res.cmpMore')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results side */}
      <div className="comparison-section">
        <h4>{t('res.cmpImpact')}</h4>
        <div className="impact-grid">
          <div className="impact-row impact-header-row">
            <div className="impact-label">{t('res.cmpMetric')}</div>
            <div className="impact-before">{t('res.cmpBefore')}</div>
            <div className="impact-arrow"></div>
            <div className="impact-after">{t('res.cmpAfter')}</div>
            <div className="impact-delta">Δ</div>
          </div>
          <ImpactRow
            label={t('res.cmpMoneyLasts')}
            before={metrics.moneyLasts.prev ? t('res.yes') : `${t('res.cmpRunsOut')} ${metrics.moneyLasts.prevAge})`}
            after={metrics.moneyLasts.curr ? t('res.yes') : `${t('res.cmpRunsOut')} ${metrics.moneyLasts.currAge})`}
            highlight={metrics.moneyLasts.prev !== metrics.moneyLasts.curr}
            improved={!metrics.moneyLasts.prev && metrics.moneyLasts.curr}
            worsened={metrics.moneyLasts.prev && !metrics.moneyLasts.curr}
          />
          <ImpactRow
            label={t('res.cmpEndingNW')}
            before={fmtMoney(metrics.endingNetWorth.prev)}
            after={fmtMoney(metrics.endingNetWorth.curr)}
            delta={fmtDelta(endingDelta)}
            deltaClass={deltaClass(endingDelta)}
          />
          {retireNWDelta !== null && (
            <ImpactRow
              label={t('res.cmpNWatRetire')}
              before={fmtMoney(metrics.netWorthAtRetirement.prev)}
              after={fmtMoney(metrics.netWorthAtRetirement.curr)}
              delta={fmtDelta(retireNWDelta)}
              deltaClass={deltaClass(retireNWDelta)}
            />
          )}
          <ImpactRow
            label={t('res.cmpEarliestAge')}
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
          <h4>{t('res.cmpAnalysis')}</h4>
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
