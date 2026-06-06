import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Lightweight i18n for the app "chrome" (navigation structure, headers,
// buttons, page/results titles). Detailed field labels remain in English —
// many are financial terms (401k, IRA, APR) commonly left untranslated in
// Japanese finance tools. The choice persists in localStorage.
//
// Usage:
//   const t = useT();           // t('section.personal')
//   const { lang, setLang } = useLang();
// ─────────────────────────────────────────────────────────────────────────

const STRINGS = {
  // App chrome
  'app.title':       { en: 'Retirement Planner',        ja: 'リタイアメント・プランナー' },
  'app.subtitle.local': {
    en: 'Data is auto-saved every 2 seconds and stored in data.json in your project folder.',
    ja: 'データは2秒ごとに自動保存され、プロジェクトフォルダの data.json に保存されます。',
  },
  'app.subtitle.browser': {
    en: '🔒 100% private — your data is stored only in this browser on your device and is never sent to any server.',
    ja: '🔒 完全プライベート — データはこの端末のブラウザ内のみに保存され、サーバーには一切送信されません。',
  },
  'toolbar.export':  { en: '⬇️ Export data (backup)',   ja: '⬇️ データを書き出し（バックアップ）' },
  'toolbar.import':  { en: '⬆️ Import data',            ja: '⬆️ データを読み込み' },
  'toolbar.note':    {
    en: 'Tip: clearing your browser data will erase saved inputs — export regularly.',
    ja: 'ヒント：ブラウザのデータを消すと保存内容も消えます。定期的に書き出してください。',
  },

  // Buttons
  'btn.save':        { en: '💾  Save',        ja: '💾  保存' },
  'btn.saving':      { en: 'Saving…',         ja: '保存中…' },
  'btn.saved':       { en: '✓ Saved',         ja: '✓ 保存済み' },
  'btn.retry':       { en: '⚠ Retry',         ja: '⚠ 再試行' },
  'btn.calculate':   { en: '📊  Calculate',   ja: '📊  計算する' },
  'btn.back':        { en: '← Back to Inputs', ja: '← 入力に戻る' },

  // Group headers
  'group.youIncome': { en: '👤 You & Income',             ja: '👤 あなたと収入' },
  'group.savings':   { en: '🏦 Savings & Investments',    ja: '🏦 貯蓄・投資' },
  'group.home':      { en: '🏠 Home & Property',          ja: '🏠 住宅・不動産' },
  'group.spending':  { en: '💸 Spending & One-Time Events', ja: '💸 支出・一時イベント' },
  'group.scenarios': { en: '🔮 Scenarios & Risk',         ja: '🔮 シナリオ・リスク' },

  // Section summaries
  'sec.personal':    { en: 'Personal Info',               ja: '基本情報' },
  'sec.income':      { en: 'Income & Retirement Age',     ja: '収入・退職年齢' },
  'sec.banks':       { en: 'Bank Accounts (up to 3)',     ja: '銀行口座（最大3）' },
  'sec.ul':          { en: 'Universal Life Insurance',    ja: '終身保険（UL）' },
  'sec.iras':        { en: 'IRA Accounts',                ja: 'IRA口座' },
  'sec.k401s':       { en: '401k Accounts',               ja: '401k口座' },
  'sec.ss':          { en: 'Social Security',             ja: '社会保障（SS）' },
  'sec.realEstate':  { en: 'Real Estate / Home',          ja: '不動産・自宅' },
  'sec.rental':      { en: '🏘️ Home Rental Option (alternative to selling)', ja: '🏘️ 自宅賃貸オプション（売却の代替）' },
  'sec.newHome':     { en: '🏠 New Home Purchase (move-up / second home)',   ja: '🏠 新居購入（住み替え・2軒目）' },
  'sec.brackets':    { en: 'Monthly Living Costs by Age Range', ja: '年齢帯別の月間生活費' },
  'sec.oneTimeExp':  { en: '💸 One-Time Large Expenses',  ja: '💸 一時的な大型支出' },
  'sec.oneTimeInc':  { en: '💰 One-Time Large Incomes',   ja: '💰 一時的な大型収入' },
  'sec.loans':       { en: '🏦 Loans',                    ja: '🏦 ローン' },
  'sec.vehicles':    { en: '🚗 Vehicle Purchases',        ja: '🚗 車両購入' },
  'sec.survivor':    { en: '🕯️ Survivor Scenario (optional)', ja: '🕯️ 遺族シナリオ（任意）' },
  'sec.monteCarlo':  { en: '🎲 Monte Carlo Risk Analysis (optional)', ja: '🎲 モンテカルロ・リスク分析（任意）' },
  'sec.required':    { en: ' — required',                 ja: ' — 必須' },

  // Results screen chrome
  'res.title':       { en: 'Retirement Projection',       ja: 'リタイアメント予測' },
  'res.whatChanged': { en: '🔍 What Changed Since Your Last Calculation', ja: '🔍 前回の計算からの変更点' },
};

const LangContext = createContext({ lang: 'en', setLang: () => {} });
const LS_KEY = 'retirementPlanner.lang';

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(LS_KEY) || 'en'; } catch { return 'en'; }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, lang); } catch { /* ignore */ }
    // Reflect on <html lang> for accessibility.
    document.documentElement.setAttribute('lang', lang === 'ja' ? 'ja' : 'en');
  }, [lang]);
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

// Returns t(key, fallback) — falls back to the English string, then the key.
export function useT() {
  const { lang } = useContext(LangContext);
  return useCallback(
    (key, fallback) => {
      const entry = STRINGS[key];
      if (!entry) return fallback !== undefined ? fallback : key;
      return entry[lang] || entry.en || (fallback !== undefined ? fallback : key);
    },
    [lang]
  );
}
