import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EvidenceButton } from '../components/EvidenceButton';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { Tabs, type TabSpec } from '../components/TabList';
import { usePublicData } from '../data/publicData';
import { buildEvidenceView, type EvidenceView } from '../engine/evidence';
import { pickText, type FactsContext } from '../engine/facts';
import type { PredicateStatus } from '../engine/predicates';
import { sessionAvailableAt } from '../engine/predicates';
import { buildStockView } from '../engine/stockView';
import { formatSessionDate, useTranslation } from '../i18n';
import { researchContent } from '../i18n/research';
import { useContextStore } from '../store/contextStore';
import '../research.css';

const RESEARCH_TICKER = 'SINI';
// The default worked-example session: C12 passes and C13 fails on it, which is
// the point of the example. Changing it re-runs the real replay.
const DEFAULT_SESSION = '2026-08-24';
const PROPOSAL_PDF = '/review/round1-proposal.pdf';
const PROPOSAL_DOWNLOAD_NAME = 'Other-Side-Round1-Proposal.pdf';

const LAYER_GLYPH: Record<string, string> = { story: '1', health: '2', flow: '3' };

type EvidenceLayer = {
  factId: string;
  trigger: HTMLButtonElement | null;
};

export function ResearchScreen() {
  const { t, locale } = useTranslation();
  const content = useMemo(() => researchContent(locale), [locale]);
  const state = usePublicData(RESEARCH_TICKER);
  const setViewSnapshot = useContextStore((store) => store.setViewSnapshot);
  const [sessionDate, setSessionDate] = useState(DEFAULT_SESSION);
  const [layers, setLayers] = useState<EvidenceLayer[]>([]);

  const top = layers.length > 0 ? (layers[layers.length - 1] ?? null) : null;

  useEffect(() => {
    setViewSnapshot('/research', sessionDate);
  }, [sessionDate, setViewSnapshot]);

  // A stale drawer would keep showing evidence for a context that is no longer
  // on screen, so any change to the replay inputs closes it.
  useEffect(() => {
    setLayers([]);
  }, [sessionDate, locale]);

  const factsContext = useMemo<FactsContext | null>(() => {
    if (state.status !== 'ready') return null;
    return {
      ticker: RESEARCH_TICKER,
      sessionDate,
      cutoffAt: sessionAvailableAt(sessionDate),
      periodStart: state.data.defaultWindow.start,
      periodEnd: state.data.defaultWindow.end,
      scenario: 'default',
      locale,
      dataVersion: state.data.versions.data,
      taxonomyVersion: state.data.versions.taxonomy,
      claimVersion: state.data.versions.claims,
    };
  }, [state, sessionDate, locale]);

  const view = useMemo(
    () => (factsContext !== null && state.status === 'ready' ? buildStockView(factsContext, state.data) : null),
    [factsContext, state],
  );

  const eligibleSessions = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.sessions.filter(
      (session) =>
        session.status === 'captured' &&
        session.date >= state.data.defaultWindow.start &&
        session.date <= state.data.defaultWindow.end,
    );
  }, [state]);

  const evidenceView: EvidenceView | null = useMemo(
    () =>
      top !== null && factsContext !== null && state.status === 'ready'
        ? buildEvidenceView(top.factId, factsContext, state.data, locale)
        : null,
    [top, factsContext, state, locale],
  );

  const openEvidence = (factId: string, trigger: HTMLButtonElement) => setLayers((prev) => [...prev, { factId, trigger }]);

  const layerTabs: TabSpec[] = content.layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    content: (
      <div className="research-layer-content">
        <div className="research-layer-heading">
          <h3>{layer.label}</h3>
          <span className="chip chip-line">{layer.status}</span>
        </div>
        <p>{layer.intro}</p>
        <div className="research-layer-columns">
          <div>
            <h4>{content.checksLabel}</h4>
            <ul>
              {layer.checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>{content.whyLabel}</h4>
            <p>{layer.why}</p>
            <h4 className="mt-4">{content.unknownLabel}</h4>
            <p>{layer.unknown}</p>
          </div>
        </div>
      </div>
    ),
  }));

  return (
    <section className="research-page" aria-labelledby="research-title">
      <header className="research-hero">
        <div className="research-hero-toolbar">
          <p className="eyebrow">{t('app.pill')}</p>
          <span className="chip chip-line">{content.label}</span>
        </div>
        <h1 id="research-title">{content.title}</h1>
        <p className="research-intro">{content.intro}</p>
      </header>

      <section className="research-section" aria-labelledby="research-framework">
        <div className="research-section-heading">
          <h2 id="research-framework">{content.framework}</h2>
        </div>
        <div className="research-framework">
          {content.layers.map((layer) => (
            <div key={layer.id}>
              <span className="research-layer-node" aria-hidden="true">
                {LAYER_GLYPH[layer.id] ?? ''}
              </span>
              <h3>{layer.label}</h3>
              <p>{layer.question}</p>
            </div>
          ))}
        </div>
        <Tabs tabs={layerTabs} ariaLabel={content.framework} idPrefix="research-layer" initialTab="story" />
        <div className="research-scope">
          <h3>{content.scopeTitle}</h3>
          <p>{content.scope}</p>
        </div>
      </section>

      <section className="research-section" aria-labelledby="research-journey">
        <div className="research-section-heading">
          <h2 id="research-journey">{content.journeyTitle}</h2>
        </div>
        <ul className="research-journey">
          {content.journey.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="research-section" aria-labelledby="research-example">
        <div className="research-section-heading">
          <h2 id="research-example">{content.exampleTitle}</h2>
        </div>
        <p className="research-intro">{content.exampleIntro}</p>
        <div className="card card-pad">
          <div className="research-example-toolbar">
            <span className="chip chip-buy">{`${RESEARCH_TICKER} · ${content.label}`}</span>
            <label htmlFor="research-session">
              <span>{content.date}</span>
              <select
                id="research-session"
                className="field"
                value={sessionDate}
                disabled={view === null}
                onChange={(event) => setSessionDate(event.target.value)}
              >
                {eligibleSessions.map((session) => (
                  <option key={session.date} value={session.date}>
                    {formatSessionDate(session.date, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {state.status === 'error' ? (
            <p className="note mt-4">{state.message ?? t('states.error')}</p>
          ) : view === null || factsContext === null ? (
            <p className="note mt-4">{t('states.loading')}</p>
          ) : (
            <>
              <div className="research-rule-cards">
                {view.lens.checks.map((check) => (
                  <article key={check.key}>
                    <div>
                      <h3>{check.key === 'C12' ? content.positive : content.largest}</h3>
                      <span className={`research-result ${statusClass(check.status)}`}>{statusText(check.status, content)}</span>
                    </div>
                    <p>
                      {check.available && check.approximate ? (
                        <EvidenceButton factId={check.factId} onActivate={openEvidence}>
                          {pickText(check.approximate, locale)}
                        </EvidenceButton>
                      ) : check.unavailableReason ? (
                        pickText(check.unavailableReason, locale)
                      ) : (
                        content.missing
                      )}
                    </p>
                    {check.cells.length > 0 ? (
                      <div className="research-day-cells">
                        {check.cells.map((cell) => (
                          <EvidenceButton
                            key={cell.date}
                            factId={check.factId}
                            onActivate={openEvidence}
                            className="no-underline"
                            ariaLabel={t('research.dayCellAria', {
                              check: check.key === 'C12' ? content.positive : content.largest,
                              date: formatSessionDate(cell.date, locale),
                              result: cell.ok ? content.passes : content.fails,
                            })}
                          >
                            <span>{formatSessionDate(cell.date, locale)}</span>
                            <strong className={cell.ok ? 'text-buy' : 'text-sell'} aria-hidden="true">
                              {cell.ok ? '✓' : '✕'}
                            </strong>
                          </EvidenceButton>
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-quiet mt-4"
                      onClick={(event) => openEvidence(check.factId, event.currentTarget)}
                    >
                      {content.evidence}
                      <span aria-hidden="true">↗</span>
                    </button>
                  </article>
                ))}
              </div>
              <p className="note mt-4">{content.exampleNote}</p>
            </>
          )}
        </div>
      </section>

      <section className="research-section" aria-labelledby="research-trust">
        <div className="research-section-heading">
          <h2 id="research-trust">{content.trustTitle}</h2>
        </div>
        <details className="research-rules">
          <summary>{content.detailed}</summary>
          <div>
            {content.trust.map((rule) => (
              <div key={rule.title}>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </div>
            ))}
          </div>
        </details>
      </section>

      <div className="research-source">
        <h3>{content.source}</h3>
        <p>{content.sourceNote}</p>
        <div>
          <a className="btn btn-quiet" href={PROPOSAL_PDF} download={PROPOSAL_DOWNLOAD_NAME}>
            <span aria-hidden="true">↓</span>
            {content.proposal}
          </a>
          <Link className="btn btn-quiet" to="/method">
            {content.engine}
            <span aria-hidden="true">↗</span>
          </Link>
          <Link className="btn btn-ghost" to={`/stock/${RESEARCH_TICKER}`}>
            {content.replay}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>

      {top !== null && evidenceView !== null && factsContext !== null ? (
        <EvidenceDrawer
          view={evidenceView}
          cutoffAt={factsContext.cutoffAt}
          trigger={top.trigger}
          onClose={() => setLayers((prev) => prev.slice(0, -1))}
        />
      ) : null}
    </section>
  );
}

function statusClass(status: PredicateStatus | null): string {
  if (status === 'passes') return 'text-buy';
  if (status === 'fails') return 'text-sell';
  return 'text-muted';
}

function statusText(
  status: PredicateStatus | null,
  content: { passes: string; fails: string; missing: string },
): string {
  if (status === 'passes') return content.passes;
  if (status === 'fails') return content.fails;
  return content.missing;
}
