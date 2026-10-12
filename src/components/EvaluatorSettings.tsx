import { useState } from 'react';
import { useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';
import { Icon } from './Icon';

// Evaluator plumbing for live questions: the endpoint and the demo token. Both
// live in memory only; the token is sent solely in the Authorization header.
export function EvaluatorSettings() {
  const { t } = useTranslation();
  const demoToken = useContextStore((state) => state.demoToken);
  const liveEndpoint = useContextStore((state) => state.liveEndpoint);
  const setDemoToken = useContextStore((state) => state.setDemoToken);
  const setLiveEndpoint = useContextStore((state) => state.setLiveEndpoint);
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="evaluator-settings"
        className="btn btn-quiet px-2.5 py-1 text-xs"
      >
        <Icon name="assumption" className="h-3.5 w-3.5 text-brandDeep" />
        {t('thesis.evaluatorSettings')}
        <span aria-hidden="true" className="text-muted">
          {open ? '▴' : '▾'}
        </span>
      </button>
      <div
        id="evaluator-settings"
        hidden={!open}
        className={open ? 'card-inset mt-2 animate-panel-in p-3' : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow">{t('thesis.liveEndpoint')}</span>
            <input
              type="text"
              value={liveEndpoint}
              onChange={(event) => setLiveEndpoint(event.target.value)}
              aria-label={t('thesis.liveEndpoint')}
              className="field mt-1.5 py-1.5"
            />
          </label>
          <label className="block">
            <span className="eyebrow">{t('thesis.liveToken')}</span>
            <input
              type="password"
              value={demoToken}
              onChange={(event) => setDemoToken(event.target.value)}
              aria-label={t('thesis.liveToken')}
              autoComplete="off"
              className="field mt-1.5 py-1.5"
            />
          </label>
        </div>
        <p className="note mt-2">
          {t('thesis.evaluatorHint')} {t('thesis.liveNote')}
        </p>
      </div>
    </div>
  );
}
