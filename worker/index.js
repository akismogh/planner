// AI Insights relay — the ONLY place the Anthropic API key is held.
//
// The client (browser build or the Android WebView app) never sees this key.
// It POSTs an anonymized numeric summary of the user's retirement projection
// (ages, savings figures, projected net worth — no names, no account
// nicknames, no addresses) and this worker forwards it to Claude, then
// relays the reply back. Restricted by CORS to the app's own origins.

const ALLOWED_ORIGINS = [
  'https://akismogh.github.io',
  // The Android WebView app serves its bundled assets from this origin
  // (via WebViewAssetLoader) — see android/.../MainActivity.kt.
  'https://appassets.androidplatform.net',
];

const SYSTEM_EN =
  'You are a thoughtful retirement-planning assistant embedded in a ' +
  'household retirement-projection app. You are given only anonymized, ' +
  'aggregated numbers from a simulation (ages, income, savings, projected ' +
  'net worth) — never names, account identifiers, or addresses. Based ' +
  'solely on those numbers, give 2-4 concrete, specific, actionable ' +
  'observations or suggestions as a short bulleted list. Be direct about ' +
  'strengths and risks you see in the numbers. This is general educational ' +
  'guidance, not personalized financial, investment, or tax advice — do ' +
  'not claim to be a licensed advisor.';

const SYSTEM_JA =
  'あなたは、退職後の資産推移を試算する家計アプリに組み込まれた、思慮深い' +
  'リタイアメント・プランニングのアシスタントです。渡されるのは匿名化・' +
  '集計済みのシミュレーション数値（年齢・収入・貯蓄額・予測純資産）のみで、' +
  '氏名や口座情報、住所などの個人を特定できる情報は一切含まれません。その' +
  '数字だけを根拠に、具体的で実行可能な指摘や提案を2〜4個、簡潔な箇条書きで' +
  '日本語で示してください。数字から読み取れる強みとリスクは率直に伝えて' +
  'ください。これは一般的な教育目的の情報提供であり、個別の投資・税務助言' +
  'ではありません。ファイナンシャルアドバイザーを名乗らないでください。';

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Origin not allowed' }, 403, cors);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, cors);
    }

    const { summary, lang } = body || {};
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return json({ error: 'Missing or invalid summary object' }, 400, cors);
    }

    // Hard cap on payload size — this should only ever be a small flat
    // object of numbers/booleans, never a place to smuggle raw data.
    const serialized = JSON.stringify(summary);
    if (serialized.length > 4000) {
      return json({ error: 'Summary too large' }, 400, cors);
    }

    const isJa = lang === 'ja';
    const userMsg =
      (isJa
        ? '以下はある家庭のリタイアメント試算の要約です:\n\n'
        : "Here is a summary of a household's retirement projection:\n\n") +
      serialized +
      (isJa ? '\n\nこの内容に基づいて提案してください。' : '\n\nGive your suggestions based on this.');

    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 600,
          system: isJa ? SYSTEM_JA : SYSTEM_EN,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
    } catch (err) {
      return json({ error: 'Upstream request failed' }, 502, cors);
    }

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text().catch(() => '');
      return json({ error: 'AI request failed', detail: detail.slice(0, 300) }, 502, cors);
    }

    const data = await anthropicRes.json();
    const text = data?.content?.find((b) => b.type === 'text')?.text || '';
    return json({ insight: text }, 200, cors);
  },
};
