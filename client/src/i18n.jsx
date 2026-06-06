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

  // Income section (pre-tax + tax rate)
  'income.note': {
    en: 'Enter PRE-TAX (gross) monthly income plus an effective tax rate. The simulator applies the tax to get spendable take-home, then adjusts for inflation each year.',
    ja: '税引前（額面）の月収と実効税率を入力してください。税率を適用して手取り額を計算し、毎年インフレ調整します。',
  },
  'lbl.myGrossIncome':     { en: 'My monthly income (pre-tax)',        ja: '自分の月収（税引前）' },
  'lbl.myTaxRate':         { en: 'My effective tax rate (%)',          ja: '自分の実効税率（%）' },
  'lbl.afterTax':          { en: 'Est. after-tax (monthly)',          ja: '推定手取り（月額）' },
  'lbl.spouseGrossIncome': { en: "Spouse's monthly income (pre-tax)", ja: '配偶者の月収（税引前）' },
  'lbl.spouseTaxRate':     { en: "Spouse's effective tax rate (%)",   ja: '配偶者の実効税率（%）' },
  'lbl.myRetireAge':       { en: 'My retirement age',                 ja: '自分の退職年齢' },
  'lbl.spouseRetireAge':   { en: "Spouse's retirement age",           ja: '配偶者の退職年齢' },
  'lbl.incomeGrowth':      { en: 'Annual income growth rate (%)',     ja: '年間収入成長率（%）' },
  'hint.grossMonthly':     { en: 'gross / before taxes',              ja: '額面・税引前' },
  'hint.taxRate':          { en: 'combined fed + state + payroll, effective', ja: '連邦＋州＋給与税の合計（実効）' },
  'hint.retireAge':        { en: 'income stops; calculation also finds earliest possible age', ja: '収入が止まる年齢。最早リタイア可能年齢も計算します' },
  'hint.incomeGrowth':     { en: 'salary growth per year. = inflation for COLA raises; 0 for none; >inflation for career growth', ja: '昇給率。インフレと同じ＝実質横ばい、0＝昇給なし、インフレ超＝キャリア成長' },

  // Bank section
  'lbl.bankAccount':   { en: 'Bank Account',         ja: '銀行口座' },
  'lbl.nickname':      { en: 'Nickname',             ja: 'ニックネーム' },
  'lbl.currentBalance':{ en: 'Current balance',      ja: '現在の残高' },
  'lbl.annualGrowth':  { en: 'Annual growth rate (%)', ja: '年間成長率（%）' },
  'btn.remove':        { en: '🗑 Remove',            ja: '🗑 削除' },
  'btn.removeBank':    { en: 'Remove this bank account', ja: 'この銀行口座を削除' },
  'btn.addBank':       { en: '＋ Add Bank Account',  ja: '＋ 銀行口座を追加' },

  // Personal / Spouse wording
  'lbl.spouseDOB':        { en: "Spouse's date of birth", ja: '配偶者の生年月日' },
  'lbl.spousePossessive': { en: "Spouse's",               ja: '配偶者の' },
  'opt.spouse':           { en: 'Spouse',                  ja: '配偶者' },

  // Survivor section
  'lbl.enableSurvivor':   { en: 'Enable survivor scenario', ja: '遺族シナリオを有効化' },
  'opt.no':               { en: 'No',  ja: 'いいえ' },
  'opt.yes':              { en: 'Yes', ja: 'はい' },
  'lbl.whoFirst':         { en: 'Who passes first', ja: '先に亡くなるのは' },
  'opt.spouseFirst':      { en: 'Spouse passes first (typical actuarial case)', ja: '配偶者が先（統計的に多いケース）' },
  'opt.meFirst':          { en: 'I pass first', ja: '自分が先' },
  'lbl.survivorEventAge': { en: 'My age when event occurs', ja: 'その時の自分の年齢' },
  'hint.survivorEventAge':{ en: 'age YOU would be when this happens (works for either case)', ja: 'この出来事が起きる時の自分の年齢（どちらのケースでも）' },
  'lbl.expenseFactor':    { en: 'Expense factor (single household)', ja: '支出係数（単身世帯）' },
  'hint.expenseFactor':   { en: "0.75 = 75% of couple's expenses; rule of thumb 0.70–0.80", ja: '0.75＝夫婦時の75%。目安は0.70〜0.80' },
  'lbl.spouseLifeExp':    { en: "Spouse's life expectancy (age)", ja: '配偶者の想定寿命（年齢）' },
  'hint.spouseLifeExp':   { en: "only used if 'I pass first' — sim extends until spouse reaches this age", ja: '「自分が先」の場合のみ使用。配偶者がこの年齢に達するまで延長' },
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

// ─────────────────────────────────────────────────────────────────────────
// Auto-translation of raw English field labels / hints.
// The form's <NumberField>/<SelectField>/etc. pass plain English strings.
// Rather than rewrite ~150 call sites, the field components run their label
// and hint through translateUI(), which looks them up in UI_JA when the
// language is Japanese. Unknown strings fall through unchanged (English).
// ─────────────────────────────────────────────────────────────────────────
const UI_JA = {
  // Common account/field labels
  'Nickname': 'ニックネーム',
  'Current balance': '現在の残高',
  'Annual growth rate (%)': '年間成長率（%）',
  'Monthly contribution': '毎月の積立額',
  'deducted from monthly income': '毎月の収入から差し引かれます',
  'Stop contribution at age': '積立を止める年齢',
  'Earliest withdrawal age': '最早引き出し年齢',
  'Account type': '口座タイプ',
  'Traditional (taxed on withdrawal)': 'Traditional（引き出し時に課税）',
  'Roth (tax-free withdrawal)': 'Roth（引き出し非課税）',
  'Traditional (pre-tax)': 'Traditional（税引前）',
  'Roth (post-tax)': 'Roth（税引後）',
  'Withdrawal tax rate (%)': '引き出し時税率（%）',
  'Your monthly contribution': '自分の毎月の積立額',
  'Company monthly match ($)': '会社の毎月のマッチ拠出（$）',
  'Employer match ($/mo)': '雇用主マッチ（$/月）',
  // Personal / income
  'My date of birth': '自分の生年月日',
  'Life expectancy (age)': '想定寿命（年齢）',
  'Annual inflation rate (%)': '年間インフレ率（%）',
  'Emergency fund (do not draw below)': '緊急予備資金（これ以下に減らさない）',
  'Auto-deplete retirement accounts': '退職口座を計画的に取り崩す',
  // Real estate
  'Estimated current value': '推定現在価値',
  'Current loan balance': '現在のローン残高',
  'APR (%)': '金利 APR（%）',
  'Monthly mortgage payment (P&I)': '毎月の住宅ローン返済（元利）',
  'Extra monthly principal': '毎月の繰上返済（追加元金）',
  'Annual appreciation rate (%)': '年間値上がり率（%）',
  'Age to sell house': '家を売る年齢',
  'Sale fee rate (%)': '売却手数料率（%）',
  'Maintenance rate (%)': '維持費率（%）',
  // Social Security
  'Estimated monthly benefit at FRA (67)': 'FRA（67歳）時点の推定月額給付',
  'Benefit start age': '受給開始年齢',
  // Misc options
  'Yes': 'はい',
  'No': 'いいえ',
  'Self': '本人',
  'Spouse': '配偶者',
  'car': '車',
  'motorcycle': 'バイク',
  '🚗 Car': '🚗 車',
  '🏍️ Motorcycle': '🏍️ バイク',
};

export function translateUI(text, lang) {
  if (lang !== 'ja' || typeof text !== 'string') return text;
  return UI_JA[text] || text;
}

// Hook for field components: returns a function that translates a raw string.
export function useUITranslate() {
  const { lang } = useContext(LangContext);
  return useCallback((text) => translateUI(text, lang), [lang]);
}
