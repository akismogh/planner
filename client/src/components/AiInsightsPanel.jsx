import React, { useState } from 'react';
import { fetchAiInsight, isAiInsightsEnabled } from '../utils/aiInsights.js';
import { useT, useLang } from '../i18n.jsx';

// Opt-in panel: only sends an anonymized numeric summary (no names, no
// account nicknames, no addresses) to the AI relay when the user taps the
// button. Renders nothing if the build has no worker URL configured
// (VITE_AI_WORKER_URL unset) — see client/src/utils/aiInsights.js.
export default function AiInsightsPanel({ summary }) {
  const t = useT();
  const { lang } = useLang();
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [insight, setInsight] = useState('');
  const [error, setError] = useState('');

  if (!isAiInsightsEnabled()) return null;

  const onAsk = async () => {
    setStatus('loading');
    setError('');
    try {
      const text = await fetchAiInsight(summary, lang);
      setInsight(text);
      setStatus('done');
    } catch (err) {
      setError(err.message || String(err));
      setStatus('error');
    }
  };

  return (
    <div className="ai-panel">
      <h3>{t('ai.title')}</h3>
      <p className="ai-note">{t('ai.privacyNote')}</p>

      {status !== 'done' && (
        <button
          type="button"
          className="btn-ai"
          onClick={onAsk}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? t('ai.thinking') : t('ai.ask')}
        </button>
      )}

      {status === 'error' && (
        <div className="ai-error">{t('ai.errorPrefix')} {error}</div>
      )}

      {status === 'done' && (
        <>
          <div className="ai-response">{insight}</div>
          <p className="ai-disclaimer">{t('ai.disclaimer')}</p>
          <button type="button" className="btn-ai btn-ai-secondary" onClick={onAsk}>
            {t('ai.askAgain')}
          </button>
        </>
      )}
    </div>
  );
}
