import React, { useEffect, useState, useCallback } from 'react';
import InputForm, { defaultInputs } from './components/InputForm.jsx';
import ResultsScreen from './components/ResultsScreen.jsx';
import { loadData, saveData } from './api.js';
import { useLang, useT } from './i18n.jsx';

// Fixed language toggle shown at the top-right on every screen.
function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button
        className={lang === 'en' ? 'active' : ''}
        onClick={() => setLang('en')}
        type="button"
      >
        EN
      </button>
      <button
        className={lang === 'ja' ? 'active' : ''}
        onClick={() => setLang('ja')}
        type="button"
      >
        JP
      </button>
    </div>
  );
}

// localStorage key for the "what did I look like at the last Calculate?" snapshot
const SNAPSHOT_KEY = 'retirementApp.lastCalcSnapshot';

export default function App() {
  const t = useT();
  const [data, setData]           = useState(defaultInputs());
  const [view, setView]           = useState('input');
  const [saving, setSaving]       = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'ok' | 'error'
  const [loadStatus, setLoadStatus] = useState('loading');
  const [validationErrors, setValidationErrors] = useState([]);
  // Snapshot from the LAST time Calculate was clicked. Lets the results
  // screen show "what changed since last calc" + impact diff.
  const [previousSnapshot, setPreviousSnapshot] = useState(null);
  // Which scenario slot was just loaded (null = none). Drives the read-only
  // "key settings" recap card shown at the top of the form after a Load, so
  // you can confirm at a glance what got applied.
  const [loadedScenarioSlot, setLoadedScenarioSlot] = useState(null);

  // Load the last snapshot from localStorage on mount so comparison
  // survives across browser sessions.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (raw) setPreviousSnapshot(JSON.parse(raw));
    } catch {
      /* ignore corrupted snapshot */
    }
  }, []);

  // ── Load saved data on launch ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadData();
        if (cancelled) return;
        if (saved) {
          const migrated = migrateData(saved);
          setData(deepMerge(defaultInputs(), migrated));
        }
        setLoadStatus('ready');
      } catch (err) {
        console.error(err);
        setLoadStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-save: silently save whenever data changes (debounced 2s) ────────
  // Auto-save does NOT flash the Save button. Only an explicit click on the
  // Save button updates saveStatus, so the inline "✓ Saved" appears as
  // confirmation of a user action rather than a background blink.
  useEffect(() => {
    if (loadStatus !== 'ready') return;
    const timer = setTimeout(async () => {
      try {
        await saveData(data);
      } catch (err) {
        // Only surface the failure case so the user knows data isn't being saved.
        setSaveStatus('error');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [data, loadStatus]);

  // ── Explicit Save button ─────────────────────────────────────────────────
  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveData(data);
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      setSaveStatus('error');
      alert('Save failed: ' + err.message + '\n\nIs the local server running? Run: npm start');
    } finally {
      setSaving(false);
    }
  }, [data]);

  // ── Validate inputs before calculating ───────────────────────────────────
  function validate(d) {
    const errs = [];
    if (!d.personal.myDOB)
      errs.push(t('val.dobRequired'));
    if (!d.personal.spouseDOB)
      errs.push(t('val.spouseDobRequired'));
    if (!d.personal.lifeExpectancy || d.personal.lifeExpectancy < 60)
      errs.push(t('val.lifeExpMin'));
    if (!d.income.myRetirementAge || d.income.myRetirementAge < 40)
      errs.push(t('val.retireMin'));

    const hasAnyExpense = Object.values(d.expenseBrackets).some((b) =>
      Object.values(b).some((v) => Number(v) > 0)
    );
    if (!hasAnyExpense)
      errs.push(t('val.expenseMin'));

    return errs;
  }

  // ── Calculate button ─────────────────────────────────────────────────────
  // Calculate also saves before showing results so the latest edits are
  // guaranteed on disk — no waiting for the 2-second auto-save debounce.
  // Validation runs first; if it fails we don't save (no point persisting a
  // state the user is about to fix).
  //
  // Snapshot logic: before navigating to results, capture whatever the LAST
  // calculation looked like (from localStorage) as `previousSnapshot` so the
  // results screen can diff it. Then write the CURRENT data to localStorage
  // for the next Calculate click.
  const onCalculate = useCallback(async () => {
    const errs = validate(data);
    if (errs.length > 0) {
      setValidationErrors(errs);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setValidationErrors([]);
    try {
      await saveData(data);
    } catch (err) {
      console.error('Save during Calculate failed:', err);
      setSaveStatus('error');
    }
    // Capture previous snapshot for the diff display BEFORE overwriting it.
    try {
      const existingRaw = localStorage.getItem(SNAPSHOT_KEY);
      setPreviousSnapshot(existingRaw ? JSON.parse(existingRaw) : null);
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Snapshot tracking failed:', err);
    }
    setView('results');
  }, [data]);

  // ── Scenario save/load handlers ──────────────────────────────────────────
  // Each scenario is a snapshot of ALL planning inputs (excluding the
  // `scenarios` array itself, to avoid recursion). Stored in data.scenarios
  // so they persist via the normal auto-save to data.json.
  const saveScenarioToSlot = useCallback((slotIdx, name, note) => {
    setData((prev) => {
      const { scenarios: _ignore, ...planningData } = prev;
      const newScenarios = [...(prev.scenarios || [null, null, null, null, null])];
      newScenarios[slotIdx] = {
        name: name || `Scenario ${slotIdx + 1}`,
        note: note || '',
        savedAt: new Date().toISOString(),
        data: planningData,
      };
      return { ...prev, scenarios: newScenarios };
    });
  }, []);

  const loadScenarioFromSlot = useCallback((slotIdx) => {
    setData((prev) => {
      const sc = prev.scenarios?.[slotIdx];
      if (!sc?.data) return prev;
      // Replace everything with the scenario's data, but preserve the
      // scenarios array (otherwise loading would wipe the list).
      return { ...sc.data, scenarios: prev.scenarios };
    });
    // Surface a read-only recap of the key settings that just loaded.
    setLoadedScenarioSlot(slotIdx);
  }, []);

  const updateScenarioInSlot = useCallback((slotIdx) => {
    setData((prev) => {
      const existing = prev.scenarios?.[slotIdx];
      if (!existing) return prev;
      const { scenarios: _ignore, ...planningData } = prev;
      const newScenarios = [...prev.scenarios];
      newScenarios[slotIdx] = {
        ...existing,
        data: planningData,
        savedAt: new Date().toISOString(),
      };
      return { ...prev, scenarios: newScenarios };
    });
  }, []);

  const editScenarioMeta = useCallback((slotIdx, name, note) => {
    setData((prev) => {
      const existing = prev.scenarios?.[slotIdx];
      if (!existing) return prev;
      const newScenarios = [...prev.scenarios];
      newScenarios[slotIdx] = { ...existing, name, note };
      return { ...prev, scenarios: newScenarios };
    });
  }, []);

  const deleteScenarioFromSlot = useCallback((slotIdx) => {
    setData((prev) => {
      const newScenarios = [...(prev.scenarios || [null, null, null, null, null])];
      newScenarios[slotIdx] = null;
      return { ...prev, scenarios: newScenarios };
    });
    // If we just deleted the slot whose recap is showing, hide the recap.
    setLoadedScenarioSlot((cur) => (cur === slotIdx ? null : cur));
  }, []);

  // ── Import data from a user-selected JSON file (public build backup) ──────
  // Runs the imported object through the SAME migration + default-merge as
  // initial load, so older exports still slot in correctly.
  const onImportData = useCallback((parsed) => {
    try {
      const merged = deepMerge(defaultInputs(), migrateData(parsed));
      setData(merged);
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  // Ctrl + →  OR  Alt + →   on input form  → run Calculate
  // Ctrl + ←  OR  Alt + ←   on results     → back to inputs
  // Either modifier works (some Windows users find Alt easier to reach).
  // We reject combinations with the OTHER modifiers (Shift/Cmd, or Ctrl+Alt
  // simultaneously) so we don't intercept e.g. Ctrl+Shift+→ word-selection.
  // Attached to window so it fires even when a form input has focus.
  useEffect(() => {
    const handleKey = (e) => {
      const onlyCtrl = e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      const onlyAlt  = e.altKey  && !e.ctrlKey && !e.shiftKey && !e.metaKey;
      if (!onlyCtrl && !onlyAlt) return;
      if (e.key === 'ArrowRight' && view === 'input') {
        e.preventDefault();
        onCalculate();
      } else if (e.key === 'ArrowLeft' && view === 'results') {
        e.preventDefault();
        setView('input');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, onCalculate]);

  // ── Loading / error states ───────────────────────────────────────────────
  if (loadStatus === 'loading') {
    return <div className="loading">{t('load.loading')}</div>;
  }
  if (loadStatus === 'error') {
    return (
      <div className="loading">
        <p>{t('load.errLine1')}</p>
        <p>Run <code>npm start</code> in your project folder, then refresh.</p>
        <p>{t('load.errLine3')}</p>
      </div>
    );
  }

  if (view === 'results') {
    return (
      <>
        <LanguageToggle />
        <ResultsScreen
          data={data}
          onBack={() => setView('input')}
          previousSnapshot={previousSnapshot}
        />
      </>
    );
  }

  return (
    <>
    <LanguageToggle />
    <InputForm
      data={data}
      setData={setData}
      onSave={onSave}
      onCalculate={onCalculate}
      saving={saving}
      saveStatus={saveStatus}
      validationErrors={validationErrors}
      scenarioHandlers={{
        save: saveScenarioToSlot,
        load: loadScenarioFromSlot,
        update: updateScenarioInSlot,
        editMeta: editScenarioMeta,
        delete: deleteScenarioFromSlot,
      }}
      onImportData={onImportData}
      loadedScenarioSlot={loadedScenarioSlot}
      onDismissLoadedSummary={() => setLoadedScenarioSlot(null)}
    />
    </>
  );
}

// Convert any old-format fields in saved data to the current shape, so users
// don't lose their data when we refactor inputs. Each migration is idempotent.
function migrateData(saved) {
  const out = { ...saved };

  // expenseBrackets used to be an object { b51_60, b61_70, b71_80, b81_90 };
  // it's now an array of up to 5 user-defined ranges.
  if (out.expenseBrackets && !Array.isArray(out.expenseBrackets)) {
    const old = out.expenseBrackets;
    out.expenseBrackets = [
      { fromAge: 51, toAge: 60, ...(old.b51_60 || {}) },
      { fromAge: 61, toAge: 70, ...(old.b61_70 || {}) },
      { fromAge: 71, toAge: 80, ...(old.b71_80 || {}) },
      { fromAge: 81, toAge: 90, ...(old.b81_90 || {}) },
      // 5th slot starts empty so the user can extend if they want.
      { fromAge: 0, toAge: 0, housing: 0, auto: 0, grocery: 0,
        insurance: 0, medical: 0, other: 0, tripsPerYear: 0, costPerTrip: 0 },
    ];
  }

  // Strip fully-blank Loan / Vehicle rows carried over from older saved data
  // (these are ignored by the calc engine anyway — this just tidies the form).
  // If a section ends up with no real entries, keep a single blank starter row.
  if (Array.isArray(out.loans)) {
    const real = out.loans.filter((l) =>
      (l.description && String(l.description).trim()) ||
      Number(l.amount) || Number(l.age) || Number(l.durationYears) || Number(l.apr)
    );
    out.loans = real.length ? real : out.loans.slice(0, 1);
  }
  if (Array.isArray(out.vehicles)) {
    // description defaults to 'car', so ignore it when deciding "blank".
    const real = out.vehicles.filter((v) =>
      Number(v.cost) || Number(v.down) || Number(v.age) ||
      Number(v.monthsToPay) || Number(v.apr)
    );
    out.vehicles = real.length ? real : out.vehicles.slice(0, 1);
  }

  // spouseLifeExpectancy used to live in `personal` (as wifeLifeExpectancy);
  // now it's inside `survivor` because it's only relevant when enabled.
  if (out.personal && out.personal.wifeLifeExpectancy !== undefined) {
    const wifeLE = out.personal.wifeLifeExpectancy;
    const { wifeLifeExpectancy: _drop, ...personalRest } = out.personal;
    out.personal = personalRest;
    out.survivor = {
      ...(out.survivor || {}),
      spouseLifeExpectancy: out.survivor?.spouseLifeExpectancy ?? out.survivor?.wifeLifeExpectancy ?? wifeLE,
    };
  }

  // Rename wife* → spouse* in all persisted data (working copy + snapshots).
  renameWifeToSpouse(out);
  if (Array.isArray(out.scenarios)) {
    out.scenarios.forEach((sc) => { if (sc && sc.data) renameWifeToSpouse(sc.data); });
  }

  // Strip orphaned fields left over from old versions so they don't linger in
  // memory, get re-saved, or show up in exports. Applies to the working inputs
  // AND every saved scenario snapshot (which exports embed). Idempotent.
  pruneOrphans(out);
  if (Array.isArray(out.scenarios)) {
    out.scenarios.forEach((sc) => { if (sc && sc.data) pruneOrphans(sc.data); });
  }

  return out;
}

// Rename wife* field keys to spouse* for all persisted data structures.
// Safe to run multiple times (idempotent — no-ops when already renamed).
function renameWifeToSpouse(d) {
  if (!d || typeof d !== 'object') return;
  const mv = (obj, oldKey, newKey) => {
    if (obj && oldKey in obj) { obj[newKey] = obj[oldKey]; delete obj[oldKey]; }
  };
  mv(d.personal, 'wifeDOB', 'spouseDOB');
  if (d.income) {
    mv(d.income, 'wifeIncome', 'spouseIncome');
    mv(d.income, 'wifeTaxRate', 'spouseTaxRate');
    mv(d.income, 'wifeRetirementAge', 'spouseRetirementAge');
    mv(d.income, 'wifeRetireWithMe', 'spouseRetireWithMe');
  }
  if (d.ss) {
    mv(d.ss, 'wifeSSAmount', 'spouseSSAmount');
    mv(d.ss, 'wifeSSAge', 'spouseSSAge');
  }
  if (d.survivor) {
    mv(d.survivor, 'wifeLifeExpectancy', 'spouseLifeExpectancy');
    if (d.survivor.whoFirst === 'wife') d.survivor.whoFirst = 'spouse';
  }
  (d.loans || []).forEach((l) => { if (l.person === 'wife') l.person = 'spouse'; });
  (d.vehicles || []).forEach((v) => { if (v.person === 'wife') v.person = 'spouse'; });
}

// Fields removed in past refactors that may still sit in old saved/imported
// data. Deleting them on load keeps memory, saves, and exports clean.
function pruneOrphans(d) {
  if (!d || typeof d !== 'object') return;
  if (d.personal) delete d.personal.myRetirementAgeTarget;
  if (d.income) delete d.income.retirePortfolioGrowthRate;
  if (d.realEstate) delete d.realEstate.propertyTaxRate;
  if (d.japan) delete d.japan.sellHouseOnMove;
  (d.k401s || []).forEach((k) => { delete k.companyMatchPct; delete k.companyMatch; });
  (d.vehicles || []).forEach((v) => { delete v.monthlyAmount; });
}

function deepMerge(base, override) {
  if (Array.isArray(base) && Array.isArray(override)) {
    // Honor whichever array is longer so variable-length collections (e.g. an
    // unlimited number of IRA accounts) aren't truncated to the default count.
    // Extra saved entries beyond the base template are kept as-is.
    const len = Math.max(base.length, override.length);
    const out = [];
    for (let i = 0; i < len; i++) {
      if (i < base.length && i < override.length) out.push(deepMerge(base[i], override[i]));
      else if (i < override.length) out.push(override[i]);
      else out.push(base[i]);
    }
    return out;
  }
  if (
    typeof base === 'object' && base !== null &&
    typeof override === 'object' && override !== null
  ) {
    const out = { ...base };
    for (const key of Object.keys(override)) {
      out[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
    }
    return out;
  }
  return override !== undefined ? override : base;
}
