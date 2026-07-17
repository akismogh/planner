// Client for the AI Insights relay (see /worker). The Anthropic API key
// lives only on that server — this module only ever talks to the worker's
// public URL and only ever sends anonymized, aggregated numbers.

const WORKER_URL = import.meta.env.VITE_AI_WORKER_URL || '';

export function isAiInsightsEnabled() {
  return !!WORKER_URL;
}

export async function fetchAiInsight(summary, lang) {
  if (!WORKER_URL) throw new Error('AI insights are not configured for this build.');
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary, lang }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.error || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  const data = await res.json();
  return data.insight || '';
}
