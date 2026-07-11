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
  'app.title':       { en: 'Retirement Planner',        ja: 'リタイアメント計画' },
  'app.subtitle.local': {
    en: 'Data is auto-saved every 2 seconds and stored in data.json in your project folder.',
    ja: 'データは2秒ごとに自動保存され、プロジェクトフォルダの data.json に保存されます。',
  },
  'app.subtitle.browser': {
    en: '🔒 Private — your data stays on this device.',
    ja: '🔒 プライベート — データはこの端末内にのみ保存されます。',
  },
  'toolbar.export':  { en: '⬇️ Export data (backup)',   ja: '⬇️ データを書き出し（バックアップ）' },
  'toolbar.import':  { en: '⬆️ Import data',            ja: '⬆️ データを読み込み' },
  'toolbar.note':    {
    en: 'Tip: clearing the app’s data will erase saved inputs — export regularly.',
    ja: 'ヒント：アプリのデータを消すと保存内容も消えます。定期的に書き出してください。',
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
  'sec.personal':    { en: '🧑 Personal Info',            ja: '🧑 基本情報' },
  'sec.income':      { en: '💼 Income & Retirement Age',  ja: '💼 収入・退職年齢' },
  'sec.banks':       { en: '🏦 Bank Accounts',            ja: '🏦 銀行口座' },
  'sec.ul':          { en: '🛡️ Universal Life Insurance', ja: '🛡️ 終身保険（UL）' },
  'sec.iras':        { en: '📈 IRA Accounts',             ja: '📈 IRA口座' },
  'sec.k401s':       { en: '💹 401k Accounts',            ja: '💹 401k口座' },
  'sec.ss':          { en: '🏛️ Social Security',          ja: '🏛️ 社会保障（SS）' },
  'sec.realEstate':  { en: '🏡 Real Estate / Home',       ja: '🏡 不動産・自宅' },
  'sec.rental':      { en: '🏘️ Home Rental Option (alternative to selling)', ja: '🏘️ 自宅賃貸オプション（売却の代替）' },
  'sec.newHome':     { en: '🏠 New Home Purchase (move-up / second home)',   ja: '🏠 新居購入（住み替え・2軒目）' },
  'sec.brackets':    { en: '🧾 Monthly Living Costs by Age Range', ja: '🧾 年齢帯別の月間生活費' },
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
  // Summary cards (row 1)
  'res.curAge':        { en: 'My Current Age', ja: '現在の自分の年齢' },
  'res.lifeExpLabel':  { en: 'Life expectancy', ja: '想定寿命' },
  'res.me':            { en: 'me', ja: '自分' },
  'res.spouseWord':    { en: 'spouse', ja: '配偶者' },
  'res.survivorWord':  { en: 'survivor', ja: '遺族' },
  'res.plannedRetire': { en: 'Planned Retirement', ja: '予定退職年齢' },
  'res.incomeStops':   { en: 'income stops at this age', ja: 'この年齢で収入が止まります' },
  'res.earliestRetire':{ en: 'Earliest Possible Retirement', ja: '可能な最早退職年齢' },
  'res.savingsCover':  { en: 'savings cover all costs', ja: '貯蓄で全費用を賄えます' },
  'res.notAchievable': { en: 'not achievable on current savings', ja: '現在の貯蓄では達成不可' },
  'res.totalAtRetire': { en: 'Total Assets at Planned Retirement', ja: '予定退職時の総資産' },
  'res.ageOutside':    { en: 'age outside projection', ja: '予測範囲外の年齢' },
  'res.moneyLasts':    { en: 'Money Lasts?', ja: '資金は持つ？' },
  'res.yes':           { en: 'Yes ✓', ja: 'はい ✓' },
  'res.no':            { en: 'No ✗', ja: 'いいえ ✗' },
  'res.cashCovers':    { en: 'cash covers expenses through age', ja: '次の年齢まで現金で費用を賄えます：' },
  'res.bankRunsOut':   { en: 'bank cash runs out at age', ja: '銀行の現金が次の年齢で尽きます：' },
  'res.wouldNeedTap':  { en: '(would need to tap retirement accounts beyond this)', ja: '（以降は退職口座の取り崩しが必要）' },
  'res.wifeWord':      { en: 'spouse', ja: '配偶者' },
  // Summary cards (row 2)
  'res.bankToday':     { en: 'Bank Total — Today', ja: '銀行残高合計 — 現在' },
  'res.sumBanksNow':   { en: 'sum of all bank accounts now', ja: '現在のすべての銀行口座の合計' },
  'res.bankAtRetire':  { en: 'Bank Total at Retirement', ja: '退職時の銀行残高合計' },
  'res.cashWhenStops': { en: 'cash on hand when income stops', ja: '収入が止まる時点の手元現金' },
  'res.moneyLeftAtAge':{ en: 'Money Left at Age', ja: '残る資金 @ 年齢' },
  'res.planned':       { en: 'Planned', ja: '予定' },
  'res.earliestPoss':  { en: 'Earliest Possible', ja: '最早可能' },
  'res.ifRetireAt':    { en: 'if you retire at', ja: '退職年齢：' },
  'res.threshold':     { en: '(the threshold)', ja: '（しきい値）' },
  // How-to-read note
  'res.howToRead':     { en: 'How to read these numbers:', ja: 'これらの数値の読み方：' },
  'res.moneyLeftExplain': {
    en: '"Money Left at Age X" is your total assets (liquid accounts + home equity) at the end of the projection.',
    ja: '「残る資金」は予測終了時点の総資産（流動資産＋住宅純資産）です。',
  },
  'res.survivorClause': {
    en: 'Because the survivor scenario is "I pass first", the projection runs until the spouse\'s life expectancy rather than mine.',
    ja: '遺族シナリオが「自分が先」のため、予測は自分ではなく配偶者の想定寿命まで実行されます。',
  },
  'res.ifPlannedAge':  { en: 'If you retire at your planned age', ja: '予定の退職年齢で退職すると' },
  'res.youllEndWith':  { en: "you'll end with", ja: '最終的に次が残ります：' },
  'res.ifEarliestAge': { en: 'If you retire at the earliest possible age', ja: '可能な最早退職年齢で退職すると' },
  'res.bufferExplain': {
    en: "This is your minimum safe buffer — it's positive because retirement happens at whole-year boundaries, so there's always some leftover when you cross the threshold. Retiring 1 year earlier would fail.",
    ja: 'これは最小の安全余裕です。退職は年単位で起こるため、しきい値を越える時点で必ず多少の余りが生じます。これより1年早い退職は破綻します。',
  },
  'res.bufferLargeQ':  { en: 'Notice the buffer is large?', ja: '余裕が大きいことに気づきましたか？' },
  'res.bufferLargeExplain': {
    en: 'That usually means your investment growth rates exceed your withdrawal rate — assets compound faster than you spend. To see assets deplete toward zero, lower your account growth rates or increase your expense brackets.',
    ja: 'これは通常、運用利回りが取り崩し率を上回っていることを意味します（支出より速く資産が複利成長）。資産がゼロへ向かう様子を見たい場合は、口座の成長率を下げるか、支出を増やしてください。',
  },
  // Recommendations / optimizations panels
  'res.fixTitle':      { en: '🛟 How to Fix This Plan', ja: '🛟 このプランの改善方法' },
  'res.fixNoteA':      { en: 'Your money runs out at age', ja: '資金が尽きる年齢：' },
  'res.fixNoteB':      { en: 'Below are independent fixes (each calculated locally — no AI involved). Pick any one, or combine smaller versions of several.', ja: '以下は独立した改善策です（各々ローカルで計算、AI不使用）。いずれか一つ、または複数を組み合わせてください。' },
  'res.maxTitle':      { en: '💡 Ways to Maximize Your Wealth', ja: '💡 資産を最大化する方法' },
  'res.maxNote': {
    en: 'Your plan already succeeds. Below are independent tweaks that would leave you with even MORE at life expectancy — both timing decisions (sell-house age, SS claim age, retirement age) and dollar amounts (UL premium, IRA / 401k contributions, extra mortgage principal). Sorted by biggest impact first.',
    ja: 'プランはすでに成功しています。以下は、寿命時点の資産をさらに増やせる独立した調整案です — タイミング（家の売却年齢、SS受給年齢、退職年齢）と金額（UL保険料、IRA/401k拠出、繰上返済）の両方。影響の大きい順に並べています。',
  },
  'res.alreadyOptTitle': { en: '💡 Already Well-Optimized', ja: '💡 すでに十分最適化されています' },
  'res.alreadyOptNote': {
    en: "Tested house-sale timing, UL-cancel timing, both spouses' SS claim ages, and delayed-retirement scenarios. None would improve your ending total assets by more than 2%. Your timing decisions look good.",
    ja: '家の売却時期、UL解約時期、夫婦両方のSS受給年齢、退職延期シナリオを検証しました。いずれも最終総資産を2%以上改善しません。タイミングの判断は良好です。',
  },
  // Scenario chips
  'res.chipReloc':     { en: 'Relocation at age', ja: '移住年齢：' },
  'res.chipCostX':     { en: 'cost ×', ja: 'コスト ×' },
  'res.chipWdTax':     { en: 'withdrawal tax', ja: '引き出し税' },
  'res.chipHouseSold': { en: 'house auto-sold', ja: '住宅は自動売却' },
  'res.chipSurvivor':  { en: 'Survivor scenario at age', ja: '遺族シナリオ年齢：' },
  'res.chipExpX':      { en: 'expenses ×', ja: '支出 ×' },
  // Monte Carlo
  'res.mcTitle':       { en: '🎲 Monte Carlo Risk Analysis', ja: '🎲 モンテカルロ・リスク分析' },
  'res.mcRunning':     { en: 'Running…', ja: '実行中…' },
  'res.mcRerun':       { en: 'Re-run', ja: '再実行' },
  'res.mcRun':         { en: 'Run', ja: '実行' },
  'res.mcSims':        { en: 'simulations', ja: '回シミュレーション' },
  'res.mcSuccessRate': { en: 'Success rate', ja: '成功率' },
  'res.mcRuns':        { en: 'runs', ja: '回' },
  'res.mcMedianNW':    { en: 'Final total assets — median', ja: '最終総資産 — 中央値' },
  'res.mc50th':        { en: '50th percentile', ja: '50パーセンタイル' },
  'res.mcWorst':       { en: 'Worst-case (10th %ile)', ja: '最悪ケース（10パーセンタイル）' },
  'res.mcBottom10':    { en: 'bottom 10% of outcomes', ja: '結果の下位10%' },
  'res.mcBest':        { en: 'Best-case (90th %ile)', ja: '最良ケース（90パーセンタイル）' },
  'res.mcTop10':       { en: 'top 10% of outcomes', ja: '結果の上位10%' },
  'res.mcMedFail':     { en: 'Median failure age', ja: '破綻年齢の中央値' },
  'res.mcMedFailSub':  { en: 'when funds typically run out in failed runs', ja: '失敗した試行で資金が尽きる典型的な年齢' },
  'res.mcHint': {
    en: 'Click to estimate the probability your plan survives by re-running with randomized returns. A success rate above 85% is generally considered safe; below 75% is risky.',
    ja: 'ランダムな利回りで再実行し、プランが存続する確率を推定します。成功率85%超は一般に安全、75%未満はリスク高とされます。',
  },
  // Asset lifeline
  'res.lifelineTitle': { en: '💰 Total Assets at Key Ages', ja: '💰 主要な年齢ごとの総資産' },
  'res.lifelineNote':  { en: 'Total assets at each milestone (in nominal/future dollars) — liquid accounts plus home equity.', ja: '各節目の総資産（名目・将来価値）— 流動資産＋住宅純資産。' },
  'res.colAge':        { en: 'Age', ja: '年齢' },
  'res.colTotalAssets':{ en: 'Total Assets', ja: '総資産' },
  'res.colDelta':      { en: 'Δ vs prior milestone', ja: 'Δ（前の節目との差）' },
  'res.tagRetire':     { en: 'Retire', ja: '退職' },
  'res.tagLifeExp':    { en: 'Life Exp.', ja: '想定寿命' },
  'res.ageWord':       { en: 'Age', ja: '年齢' },
  // Inflation note
  'res.inflNoteA':     { en: 'All future expenses and income are auto-inflated at', ja: '将来のすべての支出・収入は次の率で自動的にインフレ調整されます：' },
  'res.inflNoteB':     { en: "You entered today's dollars — the table shows nominal (future) dollars at each age.", ja: '入力は現在の価値です — 表は各年齢の名目（将来）価値を表示します。' },
  // Comparison panel
  'res.cmpInputs':     { en: 'Inputs', ja: '入力' },
  'res.cmpChange':     { en: 'change', ja: '件の変更' },
  'res.cmpChanges':    { en: 'changes', ja: '件の変更' },
  'res.cmpNoInput':    { en: 'No input fields changed.', ja: '変更された入力項目はありません。' },
  'res.cmpField':      { en: 'Field', ja: '項目' },
  'res.cmpBefore':     { en: 'Before', ja: '変更前' },
  'res.cmpAfter':      { en: 'After', ja: '変更後' },
  'res.cmpAndMore':    { en: '…and', ja: '…他' },
  'res.cmpMore':       { en: 'more', ja: '件' },
  'res.cmpImpact':     { en: 'Impact on Results', ja: '結果への影響' },
  'res.cmpMetric':     { en: 'Metric', ja: '指標' },
  'res.cmpMoneyLasts': { en: 'Money lasts to life expectancy?', ja: '資金は想定寿命まで持つ？' },
  'res.cmpRunsOut':    { en: 'No (runs out @', ja: 'いいえ（尽きる年齢' },
  'res.cmpEndingNW':   { en: 'Ending total assets (at life expectancy)', ja: '最終総資産（想定寿命時点）' },
  'res.cmpNWatRetire': { en: 'Total assets at planned retirement', ja: '予定退職時の総資産' },
  'res.cmpEarliestAge':{ en: 'Earliest possible retirement age', ja: '可能な最早退職年齢' },
  'res.cmpNoChange':   { en: '🔄 No inputs have changed since your last calculation.', ja: '🔄 前回の計算から入力の変更はありません。' },
  'res.cmpAnalysis':   { en: '分析 — 結果が変わった理由（Analysis）', ja: '分析 — 結果が変わった理由' },
  'res.calcError':     { en: 'Calculation error:', ja: '計算エラー：' },
  'res.backToFix':     { en: '← Back to fix inputs', ja: '← 入力の修正に戻る' },

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
  'lbl.spouseRetireWithMe':{ en: 'Spouse retires when I do',          ja: '配偶者は自分と同時に退職' },
  'lbl.spouseRetireAgeComputed': { en: "Spouse's age when I retire",  ja: '自分の退職時の配偶者の年齢' },
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

  // ── Scenario bar / validation chrome ──
  'scenario.title':     { en: '📁 Saved Scenarios', ja: '📁 保存したシナリオ' },
  'scenario.titleHint': { en: '— snapshot the current inputs to a slot, then load or compare later', ja: '— 現在の入力をスロットに保存し、後で読み込み・比較できます' },
  'scenario.saveAs':    { en: 'Save current as Scenario', ja: 'シナリオとして保存' },
  'scenario.namePh':    { en: 'Name (e.g. Baseline)', ja: '名前（例：ベースライン）' },
  'scenario.notePh':    { en: "Note — what's specific about this scenario? (line breaks OK)", ja: 'メモ — このシナリオの特徴は？（改行可）' },
  'scenario.load':      { en: '↻ Load',   ja: '↻ 読込' },
  'scenario.update':    { en: '⇡ Update', ja: '⇡ 更新' },
  'scenario.edit':      { en: '✎ Edit',   ja: '✎ 編集' },
  'scenario.apply':     { en: '✓ Apply',  ja: '✓ 適用' },
  'scenario.cancel':    { en: 'Cancel',   ja: 'キャンセル' },
  'scenario.savedOn':   { en: 'Saved',    ja: '保存日' },

  // ── Loaded-scenario "key settings" recap ──
  'summary.heading':         { en: '📋 Key settings loaded', ja: '📋 読み込んだ主な設定' },
  'summary.dismiss':         { en: 'Dismiss',                ja: '閉じる' },
  'summary.myDOB':           { en: 'My date of birth',       ja: '自分の生年月日' },
  'summary.spouseDOB':       { en: "Spouse's date of birth", ja: '配偶者の生年月日' },
  'summary.myRetireAge':     { en: 'My retirement age',      ja: '自分の退職年齢' },
  'summary.spouseRetireAge': { en: "Spouse's retirement age", ja: '配偶者の退職年齢' },
  'summary.sameAsMe':        { en: 'same time as me',        ja: '自分と同時' },
  'summary.lifeExp':         { en: 'Life expectancy',        ja: '想定寿命' },
  'summary.inflation':       { en: 'Inflation rate',         ja: 'インフレ率' },
  'summary.bankTotal':       { en: 'Total bank balance',     ja: '銀行残高合計' },
  'summary.retireTotal':     { en: 'Total IRA + 401k',       ja: 'IRA・401k合計' },
  'summary.scenarios':       { en: 'Scenarios enabled',      ja: '有効なシナリオ' },
  'summary.none':            { en: 'None',                   ja: 'なし' },
  'summary.chip.relocation': { en: '🌏 Relocation',          ja: '🌏 移住' },
  'summary.chip.rental':     { en: '🏘️ Home rental',         ja: '🏘️ 自宅賃貸' },
  'summary.chip.survivor':   { en: '🕯️ Survivor',            ja: '🕯️ 遺族' },
  'summary.chip.monteCarlo': { en: '🎲 Monte Carlo',         ja: '🎲 モンテカルロ' },
  // Expanded recap — section sub-headers + extra fields
  'summary.sec.basics':      { en: 'Plan basics',            ja: '基本設定' },
  'summary.sec.income':      { en: 'Income',                 ja: '収入' },
  'summary.sec.savings':     { en: 'Savings & investments',  ja: '貯蓄・投資' },
  'summary.sec.ss':          { en: 'Social Security',        ja: '社会保障（SS）' },
  'summary.sec.home':        { en: 'Home / real estate',     ja: '住宅・不動産' },
  'summary.sec.expenses':    { en: 'Expenses',               ja: '支出' },
  'summary.emergencyFund':   { en: 'Emergency fund',         ja: '緊急予備資金' },
  'summary.autoDeplete':     { en: 'Auto-deplete accounts',  ja: '退職口座の計画的取り崩し' },
  'summary.incomeGrowth':    { en: 'Income growth',          ja: '収入成長率' },
  'summary.myIncome':        { en: 'My income (pre-tax)',    ja: '自分の月収（税引前）' },
  'summary.spouseIncome':    { en: 'Spouse income (pre-tax)', ja: '配偶者の月収（税引前）' },
  'summary.myTax':           { en: 'My tax rate',            ja: '自分の税率' },
  'summary.spouseTax':       { en: 'Spouse tax rate',        ja: '配偶者の税率' },
  'summary.totalIRA':        { en: 'Total IRA',              ja: 'IRA合計' },
  'summary.total401k':       { en: 'Total 401k',             ja: '401k合計' },
  'summary.mySS':            { en: 'My Social Security',     ja: '自分のSS' },
  'summary.spouseSS':        { en: "Spouse's Social Security", ja: '配偶者のSS' },
  'summary.homeValue':       { en: 'Home value',             ja: '自宅評価額' },
  'summary.loanBalance':     { en: 'Mortgage balance',       ja: '住宅ローン残高' },
  'summary.monthlyPayment':  { en: 'Monthly payment',        ja: '毎月の返済' },
  'summary.sellAge':         { en: 'Sell age',               ja: '売却年齢' },
  'summary.noSell':          { en: 'never',                  ja: '売却しない' },
  'summary.numRanges':       { en: 'Age ranges defined',     ja: '設定された年齢帯' },
  'validation.header':  { en: 'Please fix the following before calculating:', ja: '計算する前に以下を修正してください：' },
  'val.dobRequired':    { en: 'Your date of birth is required (Personal Info).', ja: '自分の生年月日は必須です（基本情報）。' },
  'val.spouseDobRequired': { en: "Spouse's date of birth is required (Personal Info).", ja: '配偶者の生年月日は必須です（基本情報）。' },
  'val.lifeExpMin':     { en: 'Life expectancy must be at least 60 (Personal Info).', ja: '想定寿命は60以上にしてください（基本情報）。' },
  'val.retireMin':      { en: 'Your retirement age must be at least 40 (Income).', ja: '退職年齢は40以上にしてください（収入）。' },
  'val.expenseMin':     { en: 'Enter at least one monthly living cost (Monthly Living Costs).', ja: '月間生活費を最低1つ入力してください（年齢帯別の月間生活費）。' },
  'load.loading':       { en: 'Loading saved data…', ja: '保存データを読み込み中…' },
  'load.errLine1':      { en: 'Could not reach the local server on port 3001.', ja: 'ポート3001のローカルサーバーに接続できませんでした。' },
  'load.errLine3':      { en: 'Your data is safe — nothing was lost.', ja: 'データは安全です — 何も失われていません。' },

  // ── Sub-headers / buttons inside sections ──
  'h4.mine':            { en: 'Mine', ja: '自分' },
  'h4.autoInvest':      { en: '💹 Auto-invest excess cash', ja: '💹 余剰資金の自動運用' },
  'hint.autoInvestOn':  { en: '— active: excess above the threshold earns the return below', ja: '— 有効：しきい値を超えた余剰分が下の利回りで運用されます' },
  'hint.autoInvestOff': { en: '— enable to invest idle cash above a threshold', ja: '— 有効にすると、しきい値を超えた遊休資金を運用します' },
  'h4.reloc':           { en: '🌏 Relocation cost adjustment', ja: '🌏 移住によるコスト調整' },
  'hint.relocOn':       { en: '— active: each bracket below shows before/after', ja: '— 有効：下の各年齢帯に移住前／後が表示されます' },
  'hint.relocOff':      { en: '— enable to apply a cost-of-living + tax change at the move age', ja: '— 有効にすると、移住年齢から生活費・税率の変更が適用されます' },
  'btn.sortByAge':      { en: '↑ Sort by Age', ja: '↑ 年齢順に並べ替え' },
  'btn.addIRA':         { en: '＋ Add IRA', ja: '＋ IRA口座を追加' },
  'btn.add401k':        { en: '＋ Add 401k', ja: '＋ 401k口座を追加' },
  'btn.addRange':       { en: '＋ Add age range', ja: '＋ 年齢帯を追加' },
  'btn.addExpense':     { en: '＋ Add expense', ja: '＋ 支出を追加' },
  'btn.addIncome':      { en: '＋ Add income', ja: '＋ 収入を追加' },
  'btn.addLoan':        { en: '＋ Add loan', ja: '＋ ローンを追加' },
  'btn.addVehicle':     { en: '＋ Add vehicle', ja: '＋ 車両を追加' },
  'lbl.leaveBlank':     { en: '(leave blank if unused)', ja: '（未使用なら空欄）' },

  // ── Section notes (gray explanatory paragraphs) ──
  'note.personal': {
    en: "Inflation is applied automatically to all future expenses and incomes. Enter all dollar amounts in today's dollars; the simulator will inflate them year-by-year.",
    ja: 'インフレは将来のすべての支出・収入に自動的に適用されます。金額はすべて「現在の価値」で入力してください。シミュレーターが毎年インフレ調整します。',
  },
  'note.iras': {
    en: 'Traditional: contributions are post-tax (already excluded from your take-home if auto-funding), withdrawals are taxed. RMDs required starting at age 73. Roth: contributions and withdrawals are both tax-free in retirement. No RMDs. Add as many accounts as you need — each gets its own column in the results table. ⚠ Tax is a flat estimate: withdrawals use the single "withdrawal tax rate" you enter below — the simulator does NOT model progressive tax brackets, so it understates the cost of large lump-sum withdrawals. Spreading withdrawals over many years is more tax-efficient.',
    ja: 'Traditional：拠出は税引後（自動拠出なら手取りから既に差し引き済み）、引き出し時に課税。73歳からRMD（必須最低引き出し）が必要です。Roth：拠出・引き出しとも退職後は非課税。RMDなし。必要な数だけ口座を追加でき、各口座は結果表に個別の列で表示されます。⚠ 税は概算（定率）：引き出しには下に入力する「引き出し時税率」を一律適用し、累進課税は考慮しません。そのため一括引き出しのコストを過小評価します。複数年に分けて引き出す方が税効率的です。',
  },
  'note.k401s': {
    en: 'Traditional 401k: pre-tax payroll deduction — NOT subtracted again from after-tax take-home; withdrawals are taxed. RMDs at 73. Roth 401k: post-tax payroll deduction — IS subtracted from take-home; withdrawals tax-free. No RMDs (as of 2024). Company match is added to the balance but does not affect cash flow. Add as many accounts as you need. ⚠ Tax is a flat estimate (no progressive brackets), so lump-sum withdrawals are understated.',
    ja: 'Traditional 401k：給与天引き（税引前）— 手取りから再度差し引かれません。引き出し時に課税。73歳からRMD。Roth 401k：給与天引き（税引後）— 手取りから差し引かれます。引き出しは非課税。RMDなし（2024年時点）。会社マッチは残高に加算されますがキャッシュフローには影響しません。必要な数だけ口座を追加できます。⚠ 税は概算（定率・累進課税なし）のため、一括引き出しのコストは過小評価されます。',
  },
  'note.ss': {
    en: "Enter the monthly benefit your SSA statement projects at Full Retirement Age (67). Choosing a different claim age automatically scales the benefit using SSA's standard table: age 62 = 70%, 65 = 86.7%, 67 = 100%, 70 = 124%. Spousal benefit is applied automatically: if one spouse's own benefit is less than 50% of the other's FRA benefit, SSA pays their own first, then adds a spousal top-off to reach that 50% mark. So when both file at FRA and the lower earner qualifies, the household total is up to 150% of the higher earner's FRA benefit.",
    ja: 'SSAの明細に記載された満額支給開始年齢（FRA＝67歳）時点の月額給付を入力してください。受給開始年齢を変えると、SSA標準の表に従って自動調整されます（62歳＝70%、65歳＝86.7%、67歳＝100%、70歳＝124%）。配偶者給付は自動適用：一方の本人給付が他方のFRA給付の50%未満の場合、まず本人給付を支給し、その50%に達するまで配偶者上乗せ分を加算します。両者がFRAで受給し低所得者が条件を満たすと、世帯合計は高所得者のFRA給付の最大150%になります。',
  },
  'note.rental': {
    en: 'Instead of selling outright, rent the house out starting on your retirement birthday. The house keeps appreciating and you collect rent income, but you incur higher maintenance and one-time setup costs. Mortgage P&I continues normally. When rental is enabled, Real Estate → "Age to sell house" is ignored — use the rental section\'s own "Sell rental at age" field instead (0 = hold through life expectancy).',
    ja: '売却する代わりに、退職の誕生日から自宅を賃貸に出します。住宅は値上がりを続け家賃収入を得られますが、維持費が高くなり一時的な初期費用も発生します。住宅ローン（元利）は通常どおり継続します。賃貸を有効にすると、不動産の「家を売る年齢」は無視されます。代わりに賃貸セクションの「賃貸物件を売る年齢」を使用してください（0＝寿命まで保有）。',
  },
  'note.newHome': {
    en: 'Buy a new primary residence at a chosen age — e.g. while you rent out the current house. The price is what you actually pay that year (nominal). The down payment leaves your bank; a new mortgage starts; the home appreciates and accrues maintenance; its equity counts toward net worth. Monthly payment is auto-calculated from price, down, APR and term.',
    ja: '選んだ年齢で新しい主たる住居を購入します（例：現在の家を賃貸に出している間に）。価格はその年に実際に支払う名目額です。頭金は銀行から支出され、新しい住宅ローンが始まり、住宅は値上がりし維持費が発生します。その純資産は資産に算入されます。毎月の返済額は価格・頭金・金利・期間から自動計算されます。',
  },
  'note.brackets': {
    en: 'Define as many custom age ranges as you need. Inflation is applied automatically. If ranges overlap, the first match wins. If there is a gap, the nearest earlier bracket carries forward.',
    ja: '必要なだけ年齢帯を自由に定義できます。インフレは自動適用されます。年齢帯が重複する場合は最初に一致したものが優先され、空白がある場合は直前の年齢帯が引き継がれます。',
  },
  'note.reloc': {
    en: 'House sale: set Real Estate → "Age to sell house" to the year you plan to sell (often aligned to your move age). The simulator follows that field.',
    ja: '住宅の売却：不動産の「家を売る年齢」に売却予定の年齢（移住年齢に合わせることが多い）を設定してください。シミュレーターはその項目に従います。',
  },
  'note.oneTimeExp': {
    en: "Plan for big lumpy costs — wedding gifts, a new car, kitchen renovation, a special trip, college tuition, RV. Enter amounts in today's dollars (inflation is applied automatically). These come out of bank accounts first; if banks run low, the engine taps IRA/401k per the usual waterfall.",
    ja: '結婚祝い、車の購入、キッチン改装、特別な旅行、学費、キャンピングカーなど大きな一時的支出を計画します。金額は現在の価値で入力してください（発生年まで自動でインフレ調整）。まず銀行口座から支出され、残高が不足するとIRA/401kから通常の順序で取り崩されます。',
  },
  'note.oneTimeInc': {
    en: 'Big lumpy windfalls — inheritance, sale of a business or asset, lawsuit settlement, signing bonus. Amounts in today\'s dollars (inflated to the year they land). Deposited into Bank 1 in that year.',
    ja: '相続、事業・資産の売却、訴訟の和解金、契約一時金など大きな臨時収入。金額は現在の価値で入力（受取年までインフレ調整）。その年に銀行口座1へ入金されます。',
  },
  'note.loans': {
    en: 'Personal loans, HELOC, education loans, etc. The principal is deposited into Bank 1 at the start age. Monthly payments are auto-calculated from amount, duration, and APR using the standard amortization formula — shown live in the rightmost column.',
    ja: '個人ローン、HELOC、教育ローンなど。元本は開始年齢で銀行口座1に入金されます。毎月の返済額は金額・期間・金利から標準的な元利均等の計算式で自動算出され、右端の列にリアルタイム表示されます。',
  },
  'note.vehicles': {
    en: 'Plan for cars and motorcycles. Enter cost, down, months, and APR — the monthly payment is auto-calculated on the financed amount (cost − down). All amounts are in today\'s dollars; inflation is locked at the purchase year.',
    ja: '車やバイクを計画します。コスト・頭金・支払月数・金利を入力すると、融資額（コスト−頭金）に対し毎月の返済額を自動算出します。金額はすべて現在の価値で、インフレは購入年で固定されます。',
  },
  'note.survivor': {
    en: 'Models the financial impact when one spouse passes away. The surviving spouse keeps the LARGER of the two Social Security checks (SSA survivor rule), the deceased\'s income stops, and living expenses scale down for one person.',
    ja: '配偶者の一方が亡くなった場合の経済的影響をモデル化します。残された配偶者は2つの社会保障給付のうち大きい方を受け取り（SSAの遺族規定）、亡くなった方の収入は止まり、生活費は1人分に縮小します。',
  },
  'note.monteCarlo': {
    en: 'Re-runs the simulation many times with randomized returns to estimate the probability your plan survives. An "85% success rate" means 85% of randomized scenarios kept you funded through life expectancy.',
    ja: 'ランダムな運用利回りでシミュレーションを多数回繰り返し、プランが存続する確率を推定します。「成功率85%」とは、ランダムなシナリオの85%で寿命まで資金が尽きなかったことを意味します。',
  },
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
  // ── Common account/field labels ──
  'Nickname': 'ニックネーム',
  'Current balance': '現在の残高',
  'Annual growth rate (%)': '年間成長率（%）',
  'Monthly contribution': '毎月の積立額',
  'deducted from monthly income': '毎月の収入から差し引かれます',
  'Stop contribution at age': '積立を止める年齢',
  'Earliest withdrawal age': '最早引き出し年齢',
  'IRS rule: 59½ to avoid 10% penalty; default 60. Engine blocks draws before this age': 'IRSルール：10%ペナルティ回避は59歳半。既定60。これより前の引き出しは不可',
  'IRS rule: 59½ to avoid 10% penalty (55 if separated from this employer). Default 60': 'IRSルール：10%ペナルティ回避は59歳半（離職時は55）。既定60',
  'Account type': '口座タイプ',
  'Traditional (taxed on withdrawal)': 'Traditional（引き出し時に課税）',
  'Roth (tax-free withdrawal)': 'Roth（引き出し非課税）',
  'Traditional (pre-tax)': 'Traditional（税引前）',
  'Roth (post-tax)': 'Roth（税引後）',
  'Withdrawal tax rate (%)': '引き出し時税率（%）',
  'flat effective fed+state rate applied to every withdrawal (no bracket modeling); ignored for Roth': '全引き出しに適用する一律の実効税率（連邦＋州、累進なし）。Rothには非適用',
  'My monthly contribution ($)': '自分の毎月の積立額（$）',
  'comes out of monthly take-home (Roth) or pre-tax (Traditional)': '手取りから（Roth）または税引前から（Traditional）拠出',
  'Company monthly match ($)': '会社の毎月のマッチ拠出（$）',
  "employer's $ contribution per month — does NOT come from your income": '雇用主の毎月の拠出額。あなたの収入からは差し引かれません',
  // ── Personal / income ──
  'My date of birth': '自分の生年月日',
  'Life expectancy (age)': '想定寿命（年齢）',
  'when the simulation ends. Without a survivor scenario, both spouses are assumed to reach this age together': 'シミュレーションの終了時点。遺族シナリオなしの場合、夫婦ともこの年齢に達すると仮定',
  'Annual inflation rate (%)': '年間インフレ率（%）',
  'Emergency fund (do not draw below)': '緊急予備資金（これ以下に減らさない）',
  'bank withdrawals stop at this floor; shortfalls then pull from IRA/401k': '銀行の引き出しはこの下限で止まり、不足分はIRA/401kから補填',
  'Auto-deplete retirement accounts': '退職口座を計画的に取り崩す',
  'No — only withdraw on shortfall (default)': 'いいえ — 不足時のみ引き出す（既定）',
  'Yes — proactively drain to $0 by life exp': 'はい — 寿命までに残高0を目指して取り崩す',
  'No — set spouse age': 'いいえ — 配偶者の年齢を指定',
  'Yes — same time as me': 'はい — 自分と同時',
  'spouse stops working the year I retire': '自分が退職する年に配偶者も就労を終了',
  'Yes targets $0 balance by life expectancy using the annuity formula; net withdrawals land in bank': '「はい」は年金計算式で寿命までに残高0を目標。差引後の引き出しは銀行へ',
  // ── Auto-invest ──
  'Enable auto-invest': '自動運用を有効化',
  'Invest bank total above ($)': 'これを超えた銀行残高を運用（$）',
  'keep this much in cash; invest the rest': 'この額は現金で保持し、残りを運用',
  'Expected annual return (%)': '期待年間利回り（%）',
  'return earned on the invested excess': '運用に回した余剰分の利回り',
  // ── Universal Life ──
  'Current surrender value': '現在の解約返戻金',
  'Monthly premium': '毎月の保険料',
  'full amount deducted from monthly income': '全額が毎月の収入から差し引かれます',
  'Monthly insurance fee': '毎月の保険費用',
  'cost/fee portion of the premium; the rest funds the cash value and compounds at the growth rate': '保険料のうち費用部分。残りは積立金となり成長率で複利運用されます',
  'Cancel policy at age': '保険を解約する年齢',
  'surrender value added to liquid assets': '解約返戻金が流動資産に加算されます',
  // ── Real estate ──
  'Estimated current value': '推定現在価値',
  'Current loan balance': '現在のローン残高',
  'APR (%)': '金利 APR（%）',
  'Monthly mortgage payment (P&I)': '毎月の住宅ローン返済（元利）',
  '0 if paid off': '完済済みなら0',
  'Extra monthly principal': '毎月の繰上返済（追加元金）',
  'Annual appreciation rate (%)': '年間値上がり率（%）',
  'Age to sell house': '家を売る年齢',
  'net equity deposited to liquid assets': '売却純益が流動資産に入金されます',
  'Home sale fee (%)': '住宅売却手数料（%）',
  'one-time selling cost as % of sale price (realtor + closing, ~5–6%); deducted from proceeds when sold': '売却価格に対する一時費用（仲介＋諸費用、約5〜6%）。売却益から差し引き',
  'Maintenance rate (%)': '維持費率（%）',
  'annual % of home value (rule of thumb 1%). Property tax is assumed escrowed in your mortgage payment.': '住宅価値に対する年率（目安1%）。固定資産税はローン返済に含まれると想定',
  // ── Rental option ──
  'Enable rental option': '賃貸オプションを有効化',
  'No (sell-only or keep)': 'いいえ（売却のみ／保有）',
  'Start renting at age': '賃貸を始める年齢',
  "One-time setup cost (today's $)": '一時的な初期費用（現在の価値, $）',
  'initial repairs, agent fees, vacancy buffer — hits the year rental starts': '初期修繕・仲介料・空室予備費。賃貸開始年に発生',
  'Estimated monthly rent income': '推定の毎月の家賃収入',
  "net of estimated taxes (in today's dollars; grows annually per rate below)": '推定税引後（現在の価値。下の率で毎年上昇）',
  'Annual rent increase rate (%)': '年間家賃上昇率（%）',
  'rents often grow faster than CPI in strong markets, slower in soft ones — typical 2–4%': '家賃は好況時はCPIより速く、不況時は遅く上昇 — 目安2〜4%',
  'Rental maintenance rate (%)': '賃貸の維持費率（%）',
  'annual % of home value; rentals typically 1.5–3% (turnover + wear)': '住宅価値に対する年率。賃貸は通常1.5〜3%（入退去＋摩耗）',
  'Extra monthly principal during rental': '賃貸中の毎月の繰上返済',
  "redirect rent income to faster payoff; replaces Real Estate's extra principal during rental phase": '家賃収入を繰上返済へ。賃貸期間中は不動産の繰上返済を置き換え',
  'Sell rental at age': '賃貸物件を売る年齢',
  '0 = never sell (hold through life expectancy). Otherwise rental ends and house sells at this age; net equity goes to bank.': '0＝売却しない（寿命まで保有）。それ以外はこの年齢で賃貸終了・売却し、純益は銀行へ',
  // ── New home ──
  'Enable new home purchase': '新居購入を有効化',
  'Purchase at age': '購入する年齢',
  'Purchase price (nominal at that age)': '購入価格（その年齢時点の名目額）',
  'what you pay when you buy (e.g. 1,200,000)': '購入時に実際に支払う額（例：1,200,000）',
  'Down payment': '頭金',
  'cash from bank at purchase; rest is financed': '購入時に銀行から支出。残りは融資',
  'Mortgage APR (%)': '住宅ローン金利 APR（%）',
  'Mortgage term (years)': '住宅ローン期間（年）',
  'Appreciation rate (%/yr)': '値上がり率（%/年）',
  'Maintenance rate (%/yr of value)': '維持費率（価値に対する%/年）',
  'Sell new home at age': '新居を売る年齢',
  '0 = never sell (hold through life expectancy)': '0＝売却しない（寿命まで保有）',
  'Sale fee rate (%)': '売却手数料率（%）',
  'realtor + closing, deducted from proceeds when sold': '仲介＋諸費用。売却益から差し引き',
  // ── Relocation ──
  'Enable relocation scenario': '移住シナリオを有効化',
  'No (stay put)': 'いいえ（移住しない）',
  'Age when I move': '移住する年齢',
  'from this age, living + travel scale by the multiplier and the withdrawal tax rate applies': 'この年齢から、生活費＋旅費が係数で調整され、引き出し税率が適用されます',
  'Cost-of-living multiplier': '生活費の係数',
  '1.0 = same as now; 0.9 ≈ 10% cheaper; 0.75 ≈ 25% cheaper': '1.0＝現状と同じ、0.9≈10%安、0.75≈25%安',
  'Withdrawal tax rate after move (%)': '移住後の引き出し税率（%）',
  "replaces each account's US rate after the move; ≈ 20% common for Japan": '移住後は各口座の米国税率を置き換え。日本は約20%が一般的',
  // ── Social Security ──
  'Estimated monthly benefit at FRA (67)': 'FRA（67歳）時点の推定月額給付',
  'Benefit start age': '受給開始年齢',
  // ── Bracket fields ──
  'From age': '開始年齢',
  'inclusive': 'この年齢を含む',
  'To age': '終了年齢',
  "inclusive — 'to 55' covers the whole year you're 55; start the next range at 56": 'この年齢を含む — 「55まで」は55歳の年全体。次は56から開始',
  'Housing (mo)': '住居費（月）',
  'Auto (mo)': '自動車（月）',
  'Grocery (mo)': '食費（月）',
  'Insurance (mo)': '保険（月）',
  'Medical (mo)': '医療（月）',
  'Other (mo)': 'その他（月）',
  'Trips/year': '旅行回数/年',
  'Cost/trip': '1回あたり費用',
  '💼 Other monthly income (in this age range)': '💼 その他の月収（この年齢帯）',
  'pension, rental, part-time, side hustle — counted as income for this bracket': '年金・賃貸・パート・副業など。この年齢帯の収入として計上',
  // ── Monte Carlo ──
  'Enable Monte Carlo': 'モンテカルロを有効化',
  'No (deterministic only)': 'いいえ（決定論のみ）',
  'Number of runs': '試行回数',
  '500 is a good balance of accuracy and speed': '500が精度と速度のバランス良好',
  'Annual return volatility (% stddev)': '年間利回りのボラティリティ（標準偏差%）',
  'historical: ~15% for stocks, ~5% for bonds, ~10% balanced': '過去実績：株式約15%、債券約5%、バランス約10%',
  // ── Table headers (one-time / loan / vehicle) ──
  'Use': '使用',
  'Description': '内容',
  'My Age': '自分の年齢',
  'Rotate graph': 'グラフを回転',
  'Close': '閉じる',
  "Amount (today's $)": '金額（現在の価値, $）',
  'Person': '対象者',
  'Age': '年齢',
  'Amount': '金額',
  'Years': '年数',
  'Monthly': '毎月',
  'Total Interest': '総利息',
  'Cost': 'コスト',
  'Down': '頭金',
  'Months': '月数',
  'mo': '月',
  // ── Misc options ──
  'Yes': 'はい',
  'No': 'いいえ',
  'Self': '本人',
  'Spouse': '配偶者',
  'car': '車',
  'motorcycle': 'バイク',
  '🚗 Car': '🚗 車',
  '🏍️ Motorcycle': '🏍️ バイク',
  // ── Buttons / misc ──
  '🗑 Remove': '🗑 削除',
  '⧉ Duplicate': '⧉ 複製',
  // ── Auto-invest live totals ──
  'Current bank total': '現在の銀行残高合計',
  'Investable excess (above threshold)': '運用可能な余剰（しきい値超）',
  'Estimated annual interest income': '推定の年間利息収入',
  'Estimate uses your current bank total; the projection recomputes it each year.': '推計は現在の銀行残高合計を使用。実際の予測は毎年その年の期初残高から再計算します。',
  // ── UL live totals ──
  'Monthly premium (from take-home)': '毎月の保険料（手取りから）',
  '− Insurance fee (cost of coverage)': '− 保険費用（保障のコスト）',
  '→ Into cash value (compounds at rate)': '→ 積立金へ（次の率で複利運用）',
  '⚠ Fee exceeds premium — nothing is added to the cash value.': '⚠ 費用が保険料を超過 — 積立金には何も加算されません。',
  // ── New home preview ──
  'Financed': '融資額',
  'Monthly P&I': '毎月の元利返済',
  'Total interest': '総利息',
  // ── Bracket editor totals ──
  'Ages': '年齢',
  'Bracket': '年齢帯',
  'Monthly expenses (living)': '毎月の生活費（住居＋自動車＋食費＋保険＋医療＋その他）',
  'Monthly travel': '毎月の旅行費',
  'trips': '回',
  'Bracket subtotal': '年齢帯の小計',
  ' (before relocation)': '（移住前）',
  '🌏 Bracket subtotal after relocation': '🌏 移住後の年齢帯小計',
  'applies from age': '適用開始年齢',
  'Ongoing monthly costs active in this range': 'この年齢帯で継続的に発生する月額費用',
  'Ongoing subtotal': '継続費用の小計',
  'TOTAL monthly cost': '月額費用の合計',
  '🌏 TOTAL monthly cost after relocation': '🌏 移住後の月額費用合計',
  'from age': '開始年齢',
  'living + travel ×': '生活費＋旅費 ×',
  '; ongoing costs unchanged': '；継続費用は変わりません',
  '− Other monthly income': '− その他の月収',
  'Net monthly outflow': '月額の純支出',
  '🌏 Net monthly outflow after relocation': '🌏 移住後の月額純支出',
  'Annual equivalent:': '年換算：',
  'total cost': '総費用',
  'income': '収入',
  'net': '純額',
  'after relocation:': '移住後：',
  'Note:': '注：',
  'some ongoing costs end mid-bracket — your actual cost drops at those ages.': '一部の継続費用は年齢帯の途中で終了します — その年齢で実際の費用が下がります。',
  "(today's dollars; inflation and mid-bracket drop-offs are applied year-by-year)": '（現在の価値。インフレと年齢帯途中での費用減少はシミュレーションで毎年反映されます）',
  // ── Results table column headers ──
  'Age / Year': '年齢 / 年',
  'Events': 'イベント',
  'Total Income': '総収入',
  'Total Expenses': '総支出',
  'Net Cash Flow (yr)': '純キャッシュフロー（年）',
  'Net Cash Flow (mo)': '純キャッシュフロー（月）',
  'Cash Position (yr)': '現金残高（年）',
  'Bank Total': '銀行残高合計',
  'Total Assets': '総資産',
  'My Income': '自分の収入',
  "Spouse's Income": '配偶者の収入',
  'SS (mine)': 'SS（自分）',
  'SS (spouse)': 'SS（配偶者）',
  'Other Income': 'その他の収入',
  'Rental Income': '家賃収入',
  'One-Time Income': '一時的な収入',
  'Living Exp.': '生活費',
  'Travel Exp.': '旅行費',
  'Mortgage': '住宅ローン',
  'Maintenance': '維持費',
  'UL Premium': 'UL保険料',
  'One-Time Expense': '一時的な支出',
  'Vehicle Cost': '車両費',
  'Loan Payment': 'ローン返済',
  'RMD (gross)': 'RMD（総額）',
  'Taxes Paid': '支払い税額',
  'Bank 1': '銀行1',
  'Bank 2': '銀行2',
  'Bank 3': '銀行3',
  'UL Surrender': 'UL解約返戻金',
  'Real Estate': '不動産',
  'Loan Balance': 'ローン残高',
  'Net Equity': '純資産（住宅）',
  'New Home Value': '新居の価値',
  'New Home Loan': '新居のローン',
  'New Home Equity': '新居の純資産',
  'New Home Mortgage': '新居の住宅ローン',
  // ── Results table event badges ──
  'Retire (me)': '退職（自分）',
  'Retire (spouse)': '退職（配偶者）',
  'SS (me)': 'SS（自分）',
  'RMD start': 'RMD開始',
  'UL cancelled': 'UL解約',
  'Rental start': '賃貸開始',
  'New home': '新居購入',
  'New home sold': '新居売却',
  'Vehicle bought': '車両購入',
  'Loan taken': 'ローン実行',
  'House sold': '住宅売却',
  'Relocation': '移住',
  'Survivor': '遺族',
  'One-time exp': '一時支出',
  'Money out': '資金枯渇',
  // ── Results table legend + misc ──
  '🎉 Retire': '🎉 退職',
  '🏦 SS starts': '🏦 SS開始',
  '💰 RMDs (73)': '💰 RMD（73）',
  '📃 UL cancelled': '📃 UL解約',
  '🏘️ Rental start': '🏘️ 賃貸開始',
  '🏠 New home': '🏠 新居',
  '🚗 Vehicle bought': '🚗 車両購入',
  '🏦 Loan taken': '🏦 ローン実行',
  '🏠 House sold': '🏠 住宅売却',
  '🌏 Relocation': '🌏 移住',
  '🕯️ Survivor': '🕯️ 遺族',
  '💸 One-time exp': '💸 一時支出',
  '💰 One-time income': '💰 一時収入',
  '⚠️ Money out': '⚠️ 資金枯渇',
  'Export CSV': 'CSV書き出し',
  'up': '増',
  'down': '減',
  // ── Chart (axis, legend, reference lines, tooltip) ──
  'My Age': '自分の年齢',
  'Annual Expenses': '年間支出',
  'Annual Income': '年間収入',
  '$0 cash': '現金 $0',
  'Retire': '退職',
  'Possible': '可能',
  'House': '住宅',
  'Income this year': '今年の収入',
  'Age': '年齢',
  'Retire (spouse)': '退職（配偶者）',
  'SS starts (me)': 'SS開始（自分）',
  'SS starts (spouse)': 'SS開始（配偶者）',
  'RMDs begin': 'RMD開始',
  'Rental starts': '賃貸開始',
  'House sold (net)': '住宅売却（純額）',
  'Home sale fee': '住宅売却手数料',
  'Money runs out': '資金が尽きる',
  '🏦 SS (me)': '🏦 SS（自分）',
  '🏦 SS (spouse)': '🏦 SS（配偶者）',
  '📤 IRA withdrawals': '📤 IRA引き出し',
  '📤 401k withdrawals': '📤 401k引き出し',
  '💹 Investment income': '💹 運用収入',
  'One-time income': '一時的な収入',
  'One-time expense': '一時的な支出',
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
