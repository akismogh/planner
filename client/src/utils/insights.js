// =====================================================================
// Insights generator — 各入力変更について「結果がなぜ変わったか」を
// 詳細な数字付きで日本語で説明します。
//
// 戻り値: { text: string, details: string[] }
//   - text:    1行サマリー
//   - details: 月額・年額・累積などの追加サブ項目（任意）
//
// ResultsScreen が `attributions` を渡すと、各 insight に
// 「この変更の最終純資産への寄与: $X」というサブ行が自動追加されます。
// =====================================================================

import { calcLoanPayment } from './calculations.js';

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const fmtSigned = (n) => {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return '$0';
  return `${v > 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('en-US')}`;
};

// オブジェクトの任意のパス（例: "iras[0].balance"）にディープ書き込み。
// 属性帰着分析で「現在の data から1つだけ前の値に戻したコピー」を作るのに使用。
export function withPathSetTo(obj, path, value) {
  const clone = JSON.parse(JSON.stringify(obj));
  const re = /([a-zA-Z_]+)|\[(\d+)\]/g;
  const tokens = [];
  let m;
  while ((m = re.exec(path))) tokens.push(m[1] !== undefined ? m[1] : Number(m[2]));
  if (tokens.length === 0) return clone;
  let cur = clone;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (cur == null) return clone;
    cur = cur[tokens[i]];
  }
  if (cur != null) cur[tokens[tokens.length - 1]] = value;
  return clone;
}

// 主たる解説を返す。重要な変更には details で月額・年額・累積を分けて表示。
export function explainChange(change, context) {
  const { path, prev, curr } = change;
  const { myCurrentAge, myRetirementAge, lifeExp } = context;
  const prevN = Number(prev) || 0;
  const currN = Number(curr) || 0;
  const delta = currN - prevN;
  const yearsToRetire = Math.max(0, (myRetirementAge || 0) - (myCurrentAge || 0));
  const yearsRetired = Math.max(0, (lifeExp || 0) - (myRetirementAge || 0));

  // ── Personal Info ─────────────────────────────────────────────────────
  if (path === 'personal.lifeExpectancy') {
    const dy = currN - prevN;
    return {
      text: `想定寿命が ${prev} → ${curr} 歳に${dy > 0 ? '延びました' : '短縮されました'}。`,
      details: [
        `カバーが必要な退職期間: ${Math.abs(dy)} 年${dy > 0 ? '増加' : '減少'}`,
        `${dy > 0 ? '追加で必要となる累積生活費（現価ベース概算 60K/年）: ' + fmt(60000 * Math.abs(dy)) : '余裕として残る金額（推定）'} `,
        `サバイバーなしの場合、配偶者もこの年齢まで生きると想定されます。`,
      ],
    };
  }
  if (path === 'personal.inflationRate') {
    const yrs30 = Math.pow(1 + currN / 100, 30) / Math.pow(1 + prevN / 100, 30) - 1;
    return {
      text: `インフレ率を ${prev}% → ${curr}% に変更しました。`,
      details: [
        `30年後の物価倍率の変化: 旧 ${Math.pow(1 + prevN/100, 30).toFixed(2)}x → 新 ${Math.pow(1 + currN/100, 30).toFixed(2)}x`,
        `30年後の支出が ${(yrs30 * 100).toFixed(1)}% ${yrs30 > 0 ? '増加' : '減少'}（複利効果）`,
        currN > prevN ? '計画の難易度は通常上がります。' : '計画の難易度は通常下がります。',
      ],
    };
  }
  if (path === 'personal.emergencyFund') {
    return {
      text: `緊急予備資金を ${fmt(prevN)} → ${fmt(currN)} に変更しました（${fmtSigned(delta)}）。`,
      details: [
        `銀行残高のうち ${fmt(currN)} を取り崩し不可と扱います。`,
        currN > prevN
          ? `IRA/401k からの引き出しが ${fmt(delta)} 分早く始まり、税負担がやや増えます。`
          : `銀行からより深く取り崩せるため、税のかかる退職口座への手入れが遅くなります。`,
      ],
    };
  }

  // ── 収入 ───────────────────────────────────────────────────────────────
  if (path === 'income.myIncome' || path === 'income.spouseIncome') {
    const who = path === 'income.myIncome' ? 'あなた' : '配偶者';
    const yearly = delta * 12;
    const totalImpact = yearly * yearsToRetire;
    return {
      text: `${who}の月収を ${fmt(prevN)} → ${fmt(currN)} に変更（${fmtSigned(delta)}/月）。`,
      details: [
        `月額キャッシュフロー: ${fmtSigned(delta)}/月`,
        `年額: ${fmtSigned(yearly)}/年`,
        `退職までの残り ${yearsToRetire} 年で累積: ${fmtSigned(totalImpact)}（複利前）`,
        `就業中の毎月のキャッシュフローが直接 ${delta > 0 ? '増加' : '減少'}します。`,
      ],
    };
  }
  if (path === 'income.myRetirementAge') {
    const dy = currN - prevN;
    if (dy > 0) {
      return {
        text: `退職年齢を ${prevN} → ${currN}（+${dy} 年）に延ばしました。`,
        details: [
          `${dy} 年多く拠出 → 拠出と運用益が ${dy} 年伸びます。`,
          `${dy} 年少なく取り崩し → 退職資産の減少期間が ${dy} 年短縮。`,
          `三重のプラス効果（追加拠出 + 複利成長 + 取り崩し短縮）。通常もっともインパクト大。`,
        ],
      };
    }
    return {
      text: `退職年齢を ${prevN} → ${currN}（${dy} 年）に早めました。`,
      details: [
        `${Math.abs(dy)} 年早く拠出停止。`,
        `${Math.abs(dy)} 年長く取り崩し期間。`,
        `必要貯蓄額が大幅に増加し、最早可能リタイア年齢も後ろにずれる可能性があります。`,
      ],
    };
  }
  if (path === 'income.spouseRetirementAge') {
    return {
      text: `配偶者の退職年齢を ${prevN} → ${currN} に変更しました。`,
      details: [`配偶者の収入ストリームが ${delta > 0 ? `${delta} 年延長` : `${Math.abs(delta)} 年短縮`}されます。`],
    };
  }
  if (path === 'income.incomeGrowthRate') {
    return {
      text: `給与の年成長率を ${prev}% → ${curr}% に変更。`,
      details: [
        `就業期間中の給与が複利的に増加：${yearsToRetire} 年後の給与水準が ${((Math.pow(1+currN/100, yearsToRetire) / Math.pow(1+prevN/100, yearsToRetire) - 1) * 100).toFixed(1)}% ${currN > prevN ? '増加' : '減少'}。`,
        '就業期間中の貯蓄額が変化します。',
      ],
    };
  }

  // ── SS ─────────────────────────────────────────────────────────────────
  if (path === 'ss.mySSAge' || path === 'ss.spouseSSAge') {
    const who = path === 'ss.mySSAge' ? 'あなた' : '配偶者';
    if (delta > 0) {
      return {
        text: `${who}の SS 受給開始年齢を ${prevN} → ${currN} に遅らせました。`,
        details: [
          `FRA（67歳）以降は1年遅らせるごとに +8% の遅延クレジット。`,
          `70歳で FRA の 124%、毎月の給付が増加。`,
          `ただし受給年数は ${delta} 年短縮されるトレードオフあり。`,
          `配偶者給付は受給者本人の FRA より早く請求すると減額。`,
        ],
      };
    }
    return {
      text: `${who}の SS 受給開始年齢を ${prevN} → ${currN} に早めました。`,
      details: [
        `早期受給による減額で月額は小さくなります。`,
        `受給年数は ${Math.abs(delta)} 年長くなります。`,
        `リタイア初期の資金ギャップを埋めるのに有効。`,
      ],
    };
  }
  if (path === 'ss.mySSAmount' || path === 'ss.spouseSSAmount') {
    const who = path === 'ss.mySSAmount' ? 'あなた' : '配偶者';
    return {
      text: `${who}の SS 想定月額（FRA時点）を ${fmt(prevN)} → ${fmt(currN)} に変更。`,
      details: [
        `月額: ${fmtSigned(delta)}/月`,
        `年額: ${fmtSigned(delta * 12)}/年`,
        `受給開始年齢以降のすべての年に影響し、インフレ調整されます。`,
      ],
    };
  }

  // ── Bank/IRA/401k ─────────────────────────────────────────────────────
  const accountMatch = path.match(/^(banks|iras|k401s)\[(\d+)\]\.(\w+)$/);
  if (accountMatch) {
    const [, type, idx, field] = accountMatch;
    const label = type === 'banks' ? 'Bank' : type === 'iras' ? 'IRA' : '401k';
    const num = Number(idx) + 1;
    if (field === 'balance') {
      const ratio7pct = Math.pow(1.07, yearsToRetire);
      return {
        text: `${label} ${num} の現在残高を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}）に変更。`,
        details: [
          `年7%成長と仮定し、退職までの ${yearsToRetire} 年で約 ${fmtSigned(delta * ratio7pct)} の差（取り崩し前）。`,
          `単利では ${fmtSigned(delta)}, 複利では ${fmtSigned(delta * ratio7pct)} (${ratio7pct.toFixed(2)}x)。`,
        ],
      };
    }
    if (field === 'monthlyContrib') {
      const yearly = delta * 12;
      // FV of annuity formula approximation at 7%
      const fv = yearly * ((Math.pow(1.07, yearsToRetire) - 1) / 0.07);
      return {
        text: `${label} ${num} の月額拠出を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}/月）に変更。`,
        details: [
          `月額キャッシュフロー: ${fmtSigned(delta)}/月`,
          `年額拠出: ${fmtSigned(yearly)}/年`,
          `${yearsToRetire} 年間の累積拠出: ${fmtSigned(yearly * yearsToRetire)}`,
          `年7%複利の場合、退職時点の口座残高への影響: 約 ${fmtSigned(fv)}`,
        ],
      };
    }
    if (field === 'growthRate') {
      const fvOld = Math.pow(1 + prevN / 100, yearsToRetire);
      const fvNew = Math.pow(1 + currN / 100, yearsToRetire);
      return {
        text: `${label} ${num} の年成長率を ${prev}% → ${curr}% に変更。`,
        details: [
          `${yearsToRetire} 年間の累積成長係数: ${fvOld.toFixed(2)}x → ${fvNew.toFixed(2)}x`,
          `1ドルの今日の残高が退職時点で ${(fvNew - fvOld).toFixed(2)} ドル分${currN > prevN ? '増加' : '減少'}。`,
          currN > prevN ? '前提を強気にした想定です。' : '保守的な前提 — 計画の頑健性が試されます。',
        ],
      };
    }
    if (field === 'stopContribAge') {
      const monthly = Number(context.data?.[type]?.[idx]?.monthlyContrib) || 0;
      return {
        text: `${label} ${num} の拠出停止年齢を ${prev} → ${curr} に変更。`,
        details: monthly > 0
          ? [
              `現拠出: ${fmt(monthly)}/月`,
              `${delta > 0 ? `${delta} 年延長 → 追加拠出 約 ${fmt(monthly * 12 * delta)}` : `${Math.abs(delta)} 年短縮 → 拠出減 約 ${fmt(monthly * 12 * Math.abs(delta))}`}`,
            ]
          : [`拠出が0のため直接の累積拠出影響はありません。`],
      };
    }
    if (field === 'earliestWithdrawalAge') {
      return {
        text: `${label} ${num} の最早引き出し年齢を ${prev} → ${curr} に変更。`,
        details: [
          currN > prevN ? '口座のロック期間が長くなります。' : 'より早く取り崩し可能になります。',
          'IRS の59.5歳ルール: 早期引き出しには通常10%ペナルティあり。',
        ],
      };
    }
    if (field === 'accountType') {
      return {
        text: `${label} ${num} の口座種別を ${prev} → ${curr} に変更。`,
        details: [
          'Traditional: 拠出時税控除、引き出し時課税、73歳以降 RMD 必須。',
          'Roth: 拠出時に課税済み、引き出し非課税、RMD なし。',
          curr === 'roth' ? '現役時の手取りに直接影響します（Roth 拠出は税後）。' : '現役時の手取りに直接影響しません（Traditional 拠出は税前で給与から事前控除）。',
        ],
      };
    }
    if (field === 'withdrawalTaxRate') {
      return {
        text: `${label} ${num} の引き出し時税率を ${prev}% → ${curr}% に変更。`,
        details: [
          `$50K の支出を賄うには 旧 ${fmt(50000 / (1 - prevN/100))} → 新 ${fmt(50000 / (1 - currN/100))} の引き出しが必要。`,
          `税率が ${delta > 0 ? '高い' : '低い'}ほど、同じ支出に対して口座の減りが ${delta > 0 ? '速く' : '遅く'} なります。`,
        ],
      };
    }
    if (field === 'companyMonthlyMatch') {
      const yearly = delta * 12;
      const fv = yearly * ((Math.pow(1.07, yearsToRetire) - 1) / 0.07);
      return {
        text: `${label} ${num} の会社マッチを ${fmt(prevN)} → ${fmt(currN)}/月（${fmtSigned(delta)}/月）に変更。`,
        details: [
          `月額: ${fmtSigned(delta)}/月（手取り影響なし — マッチは会社が拠出）`,
          `年額追加: ${fmtSigned(yearly)}/年`,
          `${yearsToRetire} 年の累積マッチ: ${fmtSigned(yearly * yearsToRetire)}`,
          `年7%複利込みの退職時口座インパクト: 約 ${fmtSigned(fv)}`,
        ],
      };
    }
    if (field === 'nickname') return null;
  }

  // ── Universal Life ────────────────────────────────────────────────────
  if (path === 'ul.cancelAge') {
    const premium = Number(context.data?.ul?.monthlyPremium) || 0;
    const surrenderGrowth = Number(context.data?.ul?.growthRate) || 0;
    if (delta > 0) {
      const extraPremium = premium * 12 * delta;
      return {
        text: `UL 解約年齢を ${prev} → ${curr} に遅らせました（+${delta} 年）。`,
        details: [
          `追加保険料負担: ${fmt(extraPremium)}（${fmt(premium)}/月 × ${delta} 年）`,
          `解約返戻金の追加成長: 約 +${((Math.pow(1 + surrenderGrowth/100, delta) - 1) * 100).toFixed(1)}%（${surrenderGrowth}% 想定）`,
          `通常、成長率が保険料率を上回るかで損得が決まる。`,
        ],
      };
    }
    const savedPremium = premium * 12 * Math.abs(delta);
    return {
      text: `UL 解約年齢を ${prev} → ${curr} に早めました（${delta} 年）。`,
      details: [
        `保険料節約: ${fmt(savedPremium)}（${fmt(premium)}/月 × ${Math.abs(delta)} 年）`,
        `解約返戻金がより早期に銀行に入金されますが、追加成長は失われます。`,
      ],
    };
  }
  if (path === 'ul.monthlyPremium') {
    const cancelAge = Number(context.data?.ul?.cancelAge) || 0;
    const yearsUntilCancel = cancelAge > 0 ? Math.max(0, cancelAge - myCurrentAge) : yearsToRetire;
    const yearly = delta * 12;
    return {
      text: `UL の月額保険料を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}/月）に変更。`,
      details: [
        `月額: ${fmtSigned(delta)}/月（手取りから直接差し引き）`,
        `年額: ${fmtSigned(yearly)}/年`,
        `解約年齢 ${cancelAge || '未設定'} までの累積影響: ${fmtSigned(yearly * yearsUntilCancel)}`,
      ],
    };
  }
  if (path === 'ul.surrenderValue' || path === 'ul.growthRate') {
    const cancelAge = Number(context.data?.ul?.cancelAge) || 0;
    const yearsUntilCancel = cancelAge > 0 ? Math.max(0, cancelAge - myCurrentAge) : yearsToRetire;
    return {
      text: `UL の ${path.split('.')[1]} を ${prev} → ${curr} に変更。`,
      details: [
        path === 'ul.growthRate'
          ? `年${prev}% → 年${curr}%。解約年齢 ${cancelAge} までの ${yearsUntilCancel} 年間で累積成長係数が ${Math.pow(1 + prevN/100, yearsUntilCancel).toFixed(2)}x → ${Math.pow(1 + currN/100, yearsUntilCancel).toFixed(2)}x に変化。`
          : `解約時に銀行に振り替えられる金額のベースが変わります（${fmtSigned(delta)}）。`,
      ],
    };
  }

  // ── 不動産 ─────────────────────────────────────────────────────────────
  if (path === 'realEstate.value') {
    return {
      text: `自宅評価額を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}）に変更。`,
      details: [
        `売却時のエクイティのベースが変わります。`,
        `年間メンテ費用（評価額の%）にも影響。`,
      ],
    };
  }
  if (path === 'realEstate.loanBalance') {
    return {
      text: `住宅ローン残高を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}）に変更。`,
      details: [`売却時の手取りエクイティと、毎月の利息支払額に影響。`],
    };
  }
  if (path === 'realEstate.monthlyPayment') {
    const yearly = delta * 12;
    return {
      text: `月額住宅ローン返済（P&I）を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}/月）に変更。`,
      details: [
        `月額: ${fmtSigned(delta)}/月`,
        `年額: ${fmtSigned(yearly)}/年（手取りから直接）`,
        `完済または売却までの毎月の手取りに直接影響します。`,
      ],
    };
  }
  if (path === 'realEstate.extraPrincipal') {
    const sellAge = Number(context.data?.realEstate?.sellAge) || 0;
    const yearsToSell = sellAge > 0 ? Math.max(0, sellAge - myCurrentAge) : yearsToRetire;
    const yearly = delta * 12;
    const cumulative = yearly * yearsToSell;
    return {
      text: `月額繰上返済を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}/月）に変更。`,
      details: [
        `月額キャッシュフロー: ${fmtSigned(delta)}/月（手取りから直接）`,
        `年額: ${fmtSigned(yearly)}/年`,
        `売却年齢 ${sellAge || '未設定'} までの ${yearsToSell} 年で累積支出: ${fmtSigned(cumulative)}`,
        `相殺効果: ローン残高が早く減るため、支払総利息が減少 + 売却時の純エクイティが増加。`,
        `ただし手元キャッシュは即座に減るため、特にリタイア間近では機会コストに注意。`,
      ],
    };
  }
  if (path === 'realEstate.sellAge') {
    if (delta > 0) return {
      text: `売却年齢を ${prev} → ${curr} に遅らせました（+${delta} 年）。`,
      details: [`値上がりをより多く取り込めますが、メンテ・ローン負担の期間も延びます。`],
    };
    return {
      text: `売却年齢を ${prev} → ${curr} に早めました（${delta} 年）。`,
      details: [`エクイティ現金化が早まりますが、値上がり益は取り逃します。`],
    };
  }
  if (path === 'realEstate.appreciationRate') {
    return {
      text: `自宅の値上がり率を ${prev}% → ${curr}% に変更。`,
      details: [`売却時のエクイティのベースが ${currN > prevN ? '増加' : '減少'} します。`],
    };
  }
  if (path === 'realEstate.maintenanceRate') {
    const homeValue = Number(context.data?.realEstate?.value) || 0;
    const yearly = (currN - prevN) / 100 * homeValue;
    return {
      text: `メンテナンス費率を ${prev}% → ${curr}% に変更。`,
      details: [
        `年間メンテナンス費の差額（現在の評価額ベース）: ${fmtSigned(yearly)}/年`,
        `各年の自宅評価額に対して適用され、毎年の現金支出に効きます。`,
      ],
    };
  }
  if (path === 'realEstate.apr') {
    return {
      text: `住宅ローン金利を ${prev}% → ${curr}% に変更。`,
      details: [`返済スピードと支払総利息に影響します（${currN > prevN ? '利息増' : '利息減'}）。`],
    };
  }

  // ── 一時的支出 / 収入 ─────────────────────────────────────────────────
  const otMatch = path.match(/^oneTime(Expenses|Incomes)\[(\d+)\]\.(\w+)$/);
  if (otMatch) {
    const [, kind, idx, field] = otMatch;
    const isIncome = kind === 'Incomes';
    const num = Number(idx) + 1;
    const kindLabel = isIncome ? '一時収入' : '一時支出';
    if (field === 'description') return null;
    if (field === 'amount') {
      if (prevN === 0 && currN > 0) return {
        text: `${kindLabel} #${num} を新規追加（${fmt(currN)} 現在価値）。`,
        details: [
          isIncome ? '対象年に銀行残高へ入金され、以降は複利成長します。' : 'まず銀行から引かれ、不足分は IRA/401k から（税込み）引き出されます。',
          '対象年にはインフレ調整された名目額が適用されます。',
        ],
      };
      if (prevN > 0 && currN === 0) return {
        text: `${kindLabel} #${num} を削除しました（元の額: ${fmt(prevN)}）。`,
        details: [isIncome ? 'その年の銀行への入金がなくなります。' : 'その年の資産取り崩しがなくなります。'],
      };
      return {
        text: `${kindLabel} #${num} の金額を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}）に変更。`,
        details: [],
      };
    }
    if (field === 'age') return {
      text: `${kindLabel} #${num} のタイミングを ${prev} → ${curr} 歳に変更。`,
      details: [delta > 0 ? '後ろ倒し：イベント前の資産成長期間が長くなります。' : '前倒し：イベント前の資産成長期間が短くなります。'],
    };
  }

  // ── ローン ─────────────────────────────────────────────────────────────
  const lMatch = path.match(/^loans\[(\d+)\]\.(\w+)$/);
  if (lMatch) {
    const [, idx, field] = lMatch;
    const num = Number(idx) + 1;
    const loan = context.data?.loans?.[idx] || {};
    const principal = Number(loan.amount) || 0;
    const years = Number(loan.durationYears) || 0;
    const apr = Number(loan.apr) || 0;
    const monthly = principal > 0 && years > 0
      ? (apr > 0
          ? (principal * (apr / 1200) * Math.pow(1 + apr/1200, years*12)) / (Math.pow(1 + apr/1200, years*12) - 1)
          : principal / (years * 12))
      : 0;
    if (field === 'amount') return {
      text: `ローン #${num} の元金を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}）に変更。`,
      details: [
        `開始年に銀行に入金される金額が変わります（インフレ調整後）。`,
        `現条件での月額返済: ${fmt(monthly)}`,
      ],
    };
    if (field === 'age') return {
      text: `ローン #${num} の開始年齢を ${prev} → ${curr} に変更。`,
      details: ['元金入金 + 月額返済のタイミングがシフトします。'],
    };
    if (field === 'durationYears') return {
      text: `ローン #${num} の期間を ${prev} → ${curr} 年に変更。`,
      details: [
        delta > 0 ? '期間が長くなり、月々の返済額は減りますが総支払利息は増加。' : '期間が短くなり、月々の返済額は増えますが総支払利息は減少。',
        `現条件での月額返済: ${fmt(monthly)}`,
      ],
    };
    if (field === 'apr') return {
      text: `ローン #${num} の APR を ${prev}% → ${curr}% に変更。`,
      details: [
        delta > 0 ? '金利が上がり、月々の返済額と総支払利息が増加。' : '金利が下がり、月々の返済額と総支払利息が減少。',
        `現条件での月額返済: ${fmt(monthly)}`,
      ],
    };
    if (field === 'description' || field === 'person') return {
      text: `ローン #${num} の${field === 'description' ? '内容' : '所有者'}を変更（${prev} → ${curr}）。`,
      details: ['キャッシュフローへの影響なし（表示のみ）。'],
    };
  }

  // ── 車両購入 ───────────────────────────────────────────────────────────
  const vMatch = path.match(/^vehicles\[(\d+)\]\.(\w+)$/);
  if (vMatch) {
    const [, idx, field] = vMatch;
    const num = Number(idx) + 1;
    const v = context.data?.vehicles?.[idx] || {};
    const months = Number(v.monthsToPay) || 0;
    // Monthly payment is auto-derived from cost − down financed over months at
    // APR (matching the form/engine), not stored on the vehicle.
    const financed = Math.max(0, (Number(v.cost) || 0) - (Number(v.down) || 0));
    const monthly = financed > 0 && months > 0
      ? calcLoanPayment(financed, months / 12, Number(v.apr) || 0)
      : 0;
    if (field === 'age') return {
      text: `車両 #${num} の購入年齢を ${prev} → ${curr} に変更。`,
      details: [
        `頭金 + 月々のローン支払いのタイミングがシフトします。`,
        '月々の支払いは購入年のインフレ係数で固定されます。',
      ],
    };
    if (field === 'cost') return {
      text: `車両 #${num} の総額を ${fmt(prevN)} → ${fmt(currN)} に変更。`,
      details: ['総額表示は参考情報。実際のキャッシュフローは「頭金 + 月額 × 期間」で決まります。'],
    };
    if (field === 'down') return {
      text: `車両 #${num} の頭金を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}）に変更。`,
      details: [`購入年に銀行から差し引かれる金額が変わります（インフレ調整後）。`],
    };
    if (field === 'apr') {
      return {
        text: `車両 #${num} の APR を ${prev}% → ${curr}% に変更。`,
        details: [
          delta > 0 ? '金利が上がり、月額返済と総支払利息が増加。' : '金利が下がり、月額返済と総支払利息が減少。',
          financed > 0 && months > 0 ? `融資額 ${fmt(financed)}（${months}ヶ月）に対して再計算されます。` : '',
        ].filter(Boolean),
      };
    }
    if (field === 'monthsToPay') return {
      text: `車両 #${num} のローン期間を ${prev} → ${curr} ヶ月に変更。`,
      details: [
        delta > 0 ? '支払い期間が長くなり、月々の負担は緩和されますが総支払額は増加。' : '支払い期間が短くなり、月々の負担は重くなりますが総支払額は減少。',
        monthly > 0 ? `現在の月額 ${fmt(monthly)} × 期間差 = ${fmtSigned(monthly * delta)}` : '',
      ].filter(Boolean),
    };
    if (field === 'description' || field === 'person') return {
      text: `車両 #${num} の${field === 'description' ? '種別' : '所有者'}を ${prev} → ${curr} に変更。`,
      details: ['キャッシュフローへの影響なし（表示・分類のみ）。'],
    };
  }

  // ── Japan / Survivor / Monte Carlo ────────────────────────────────────
  if (path === 'japan.enabled') return {
    text: curr ? `日本移住シナリオを「有効」にしました。` : `日本移住シナリオを「無効」にしました。`,
    details: curr ? ['移住年齢から、生活費は係数でスケールされ、退職口座引き出しは日本税率が適用。'] : ['米国のみのモデルに戻ります。'],
  };
  if (path === 'japan.moveAge') return {
    text: `日本移住年齢を ${prev} → ${curr} に変更。`,
    details: ['生活費と税金の切り替えタイミングが変わります。'],
  };
  if (path === 'japan.costMultiplier') return {
    text: `日本の生活費係数を ${prev} → ${curr} に変更。`,
    details: [currN < prevN ? '日本での生活費前提をより安くしました — 移住後の支出が大きく下がります。' : '日本での生活費前提を上げました — 支出の減少幅が小さくなります。'],
  };
  if (path === 'japan.withdrawalTaxRate') return {
    text: `日本での引き出し時税率を ${prev}% → ${curr}% に変更。`,
    details: ['移住後の退職口座からの引き出しすべてに影響します。'],
  };

  if (path === 'survivor.enabled') return {
    text: curr ? `サバイバーシナリオを「有効」にしました。` : `サバイバーシナリオを「無効」にしました。`,
    details: curr ? ['指定年齢から、亡くなった方の収入と SS がなくなり、生存配偶者は大きい方の SS を継続受給。'] : [],
  };
  if (path === 'survivor.whoFirst') {
    const labelMap = { spouse: '配偶者が先に亡くなる', me: 'あなたが先に亡くなる' };
    return {
      text: `サバイバーシナリオ：${labelMap[prev]} → ${labelMap[curr]}。`,
      details: [
        curr === 'me' ? 'あなたの収入と SS が打ち切られ、配偶者が大きい方の SS を引き継ぎます。シミュレーションは配偶者の寿命まで延長されます。' : '配偶者の収入と SS が打ち切られ、あなたが大きい方の SS を引き継ぎます。シミュレーションはあなたの寿命まで。',
      ],
    };
  }
  if (path === 'survivor.eventAge') return {
    text: `サバイバーイベント年齢を ${prev} → ${curr} に変更。`,
    details: ['世帯が単身経済に移行するタイミングが変わります。'],
  };
  if (path === 'survivor.expenseFactor') return {
    text: `サバイバー時の支出係数を ${prev} → ${curr} に変更。`,
    details: [currN < prevN ? '単身世帯の生活費前提を引き締めました。' : '単身世帯の生活費前提を緩めました。'],
  };
  if (path === 'survivor.spouseLifeExpectancy') return {
    text: `サバイバーシナリオ内の配偶者の想定寿命を ${prev} → ${curr} に変更。`,
    details: [`「あなたが先に亡くなる」シナリオの場合のみ使用。シミュレーションが ${Math.abs(delta)} 年${delta > 0 ? '延長' : '短縮'}されます。`],
  };

  // ── Home Rental Option ───────────────────────────────────────────────
  if (path === 'rental.enabled') return {
    text: curr ? `自宅賃貸オプションを「有効」にしました。` : `自宅賃貸オプションを「無効」にしました。`,
    details: curr
      ? [
          `退職年齢（${myRetirementAge} 歳）から自宅を賃貸物件として運用し、月額家賃収入を計上。`,
          'メンテナンス費率が「賃貸用」に切り替わります（通常やや高い）。',
          '住宅ローン P&I は継続。Real Estate の「売却年齢」は無視され、賃貸セクション内の「売却年齢」が代わりに使われます（0=売らずに想定寿命まで保有）。',
        ]
      : ['自宅は通常通り住居用として扱われます。'],
  };
  if (path === 'rental.sellAge') {
    if (currN === 0) return {
      text: `賃貸の売却年齢を ${prev} → 0 に変更（売却せず想定寿命まで保有）。`,
      details: ['賃貸を恒久的に運用し、最終純資産に自宅エクイティが含まれた状態で終了します。'],
    };
    if (prevN === 0) return {
      text: `賃貸の売却年齢を 0 → ${curr} に設定（${curr} 歳で売却）。`,
      details: ['賃貸期間が ${curr} 歳で終了し、純エクイティが銀行に入金されます。'],
    };
    return {
      text: `賃貸の売却年齢を ${prev} → ${curr} に変更。`,
      details: [`賃貸期間が ${Math.abs(delta)} 年${delta > 0 ? '延長' : '短縮'}されます。`],
    };
  }
  if (path === 'rental.oneTimeSetupCost') {
    return {
      text: `賃貸の初期セットアップ費用を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}）に変更。`,
      details: [
        `賃貸開始の年に1回だけ発生する費用（修繕、エージェント手数料、空室バッファ等）。`,
        `インフレ調整後の名目額が銀行から引かれます。`,
      ],
    };
  }
  if (path === 'rental.monthlyRentIncome') {
    const yearly = delta * 12;
    return {
      text: `想定月額家賃収入を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}/月）に変更。`,
      details: [
        `月額収入: ${fmtSigned(delta)}/月`,
        `年額: ${fmtSigned(yearly)}/年（家賃上昇率で年々調整）`,
        `賃貸開始年齢から売却または寿命まで毎年計上されます。`,
      ],
    };
  }
  if (path === 'rental.annualRentIncrease') {
    const yrs20 = Math.pow(1 + currN / 100, 20) / Math.pow(1 + prevN / 100, 20) - 1;
    return {
      text: `年間家賃上昇率を ${prev}% → ${curr}% に変更。`,
      details: [
        `家賃は CPI とは別に独自レートで毎年成長します。`,
        `20年後の家賃水準の差: ${(yrs20 * 100).toFixed(1)}% ${yrs20 > 0 ? '増加' : '減少'}（複利）`,
        currN > prevN ? '強気の市場想定（賃料がインフレを上回る）。' : '保守的な市場想定（賃料の伸びが緩い）。',
      ],
    };
  }
  if (path === 'rental.monthlyMaintenanceRate') {
    const homeValue = Number(context.data?.realEstate?.value) || 0;
    const yearly = (currN - prevN) / 100 * homeValue;
    return {
      text: `賃貸時のメンテナンス費率を ${prev}% → ${curr}% に変更。`,
      details: [
        `現評価額ベースでの差額: ${fmtSigned(yearly)}/年`,
        `賃貸期間中は通常の住居メンテ率を置き換えます。`,
      ],
    };
  }
  if (path === 'rental.extraPrincipalDuringRental') {
    const yearly = delta * 12;
    return {
      text: `賃貸期間中の繰上返済を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}/月）に変更。`,
      details: [
        `賃貸開始後、Real Estate の通常繰上返済額の代わりにこちらが適用されます。`,
        `月額: ${fmtSigned(delta)}/月、年額: ${fmtSigned(yearly)}/年`,
        `家賃収入を住宅ローンの早期完済に振り向けるシナリオに有用。`,
      ],
    };
  }

  if (path === 'monteCarlo.enabled') return {
    text: curr ? `モンテカルロを「有効」にしました。` : `モンテカルロを「無効」にしました。`,
    details: curr ? ['結果画面の「Run」をクリックすると確率分析を実行できます。'] : [],
  };
  if (path === 'monteCarlo.runs') return {
    text: `モンテカルロの試行回数を ${prev} → ${curr} に変更。`,
    details: ['回数が多いほど成功率の推定が安定しますが、計算は遅くなります。'],
  };
  if (path === 'monteCarlo.volatility') return {
    text: `モンテカルロのボラティリティを ${prev}% → ${curr}% に変更。`,
    details: [currN > prevN ? '乱数リターンのリスクが上がり、成功率は通常下がります。' : 'リスクが下がり、成功率は通常上がります。'],
  };

  // ── 支出ブラケット ─────────────────────────────────────────────────────
  const brMatch = path.match(/^expenseBrackets\[(\d+)\]\.(\w+)$/);
  if (brMatch) {
    const [, idx, field] = brMatch;
    const num = Number(idx) + 1;
    const bracketData = context.data?.expenseBrackets?.[idx];
    const yearsInBracket = bracketData
      ? Math.max(0, (Number(bracketData.toAge) || 0) - (Number(bracketData.fromAge) || 0) + 1)
      : 0;
    if (field === 'fromAge' || field === 'toAge') return {
      text: `支出ブラケット ${num} の${field === 'fromAge' ? '開始年齢' : '終了年齢'}を ${prev} → ${curr} に変更。`,
      details: ['このブラケットの支出プロファイルが適用される年が変わります。'],
    };
    if (field === 'additionalIncome') {
      const yearly = delta * 12;
      return {
        text: `ブラケット ${num} のその他月収を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}/月）に変更。`,
        details: [
          `月額: ${fmtSigned(delta)}/月`,
          `年額: ${fmtSigned(yearly)}/年`,
          yearsInBracket > 0 ? `ブラケット全期間（${yearsInBracket} 年）の累積: ${fmtSigned(yearly * yearsInBracket)}` : '',
          '年金、家賃収入、パートタイム等として、この年齢帯のみ収入に加算されます。',
        ].filter(Boolean),
      };
    }
    const fieldLabelMap = {
      housing: '住居費', auto: '車関連', grocery: '食費', insurance: '保険',
      medical: '医療', other: 'その他',
    };
    if (fieldLabelMap[field]) {
      const yearly = delta * 12;
      return {
        text: `ブラケット ${num} の${fieldLabelMap[field]}を ${fmt(prevN)} → ${fmt(currN)}（${fmtSigned(delta)}/月）に変更。`,
        details: [
          `月額: ${fmtSigned(delta)}/月`,
          `年額: ${fmtSigned(yearly)}/年`,
          yearsInBracket > 0 ? `ブラケット全期間（${yearsInBracket} 年）累積: ${fmtSigned(yearly * yearsInBracket)}（インフレ前）` : '',
        ].filter(Boolean),
      };
    }
    if (field === 'tripsPerYear' || field === 'costPerTrip') {
      const tripsPerYear = Number(bracketData?.tripsPerYear) || 0;
      const costPerTrip = Number(bracketData?.costPerTrip) || 0;
      const oldAnnual = field === 'tripsPerYear' ? prevN * costPerTrip : tripsPerYear * prevN;
      const newAnnual = field === 'tripsPerYear' ? currN * costPerTrip : tripsPerYear * currN;
      return {
        text: `ブラケット ${num} の旅行${field === 'tripsPerYear' ? '回数' : '1回あたり費用'}を ${prev} → ${curr} に変更。`,
        details: [
          `年間旅行費: ${fmt(oldAnnual)} → ${fmt(newAnnual)}（${fmtSigned(newAnnual - oldAnnual)}/年）`,
          yearsInBracket > 0 ? `ブラケット全期間累積: ${fmtSigned((newAnnual - oldAnnual) * yearsInBracket)}` : '',
        ].filter(Boolean),
      };
    }
  }

  return null;
}

// 各変更について解説と帰着分析を整形して返す。
// attributions: { [path]: $差分 }（その変更を1つだけ前の値に戻した場合の最終純資産差）
export function generateInsights(inputChanges, metrics, context, attributions = {}) {
  const items = [];
  inputChanges.forEach((c) => {
    const result = explainChange(c, context);
    if (!result) return;
    // result is { text, details }
    const item = {
      path: c.path,
      text: result.text,
      details: [...(result.details || [])],
    };
    const attr = attributions[c.path];
    if (attr !== undefined && !Number.isNaN(attr) && Math.abs(attr) >= 100) {
      const sign = attr > 0 ? '+' : '−';
      const cls = attr > 0 ? 'attr-pos' : 'attr-neg';
      item.attribution = {
        text: `この変更単体での最終純資産への寄与（他の変更を保ったまま、この項目だけ戻した場合との差）: ${sign}${fmt(Math.abs(attr))}`,
        cls,
      };
    }
    items.push(item);
  });
  // Sort by absolute attribution magnitude (biggest impact first)
  items.sort((a, b) => {
    const aAttr = attributions[a.path] !== undefined ? Math.abs(attributions[a.path]) : 0;
    const bAttr = attributions[b.path] !== undefined ? Math.abs(attributions[b.path]) : 0;
    return bAttr - aAttr;
  });
  return items;
}

// 主要指標へのネット影響を1行の日本語サマリーで返す
export function summarizeImpact(metrics) {
  const nwDelta = metrics.endingNetWorth.curr - metrics.endingNetWorth.prev;
  const wasLasting = metrics.moneyLasts.prev;
  const nowLasting = metrics.moneyLasts.curr;

  if (!wasLasting && nowLasting)
    return { tone: 'good', text: `✅ 変更により計画が成立するようになりました — 以前は ${metrics.moneyLasts.prevAge} 歳で資金が尽きていましたが、想定寿命まで持つようになりました。` };
  if (wasLasting && !nowLasting)
    return { tone: 'bad', text: `❌ 変更により計画が成立しなくなりました — 資金が ${metrics.moneyLasts.currAge} 歳で尽きます（以前は想定寿命まで持っていました）。` };
  if (Math.abs(nwDelta) < 1000)
    return { tone: 'neutral', text: `↔ 最終純資産への影響は軽微です（$1K 未満の変化）。` };
  if (nwDelta > 0)
    return { tone: 'good', text: `📈 ネット効果：想定寿命時点で ${fmt(nwDelta)} 多く残ります。今回の変更は有利に働きました。` };
  return { tone: 'bad', text: `📉 ネット効果：想定寿命時点で ${fmt(Math.abs(nwDelta))} 少なくなります。今回の変更は計画にマイナスでした。` };
}
