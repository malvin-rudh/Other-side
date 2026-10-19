import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BrokersAndReplay, HowItWorksFlow, MethodRules, ThreeLayers } from '../components/HowItWorks';
import { Tabs, type TabSpec } from '../components/TabList';
import { methodCopy } from '../i18n/methodCopy';
import { useTranslation } from '../i18n';
import { researchContent } from '../i18n/research';
import { radarCopy } from '../i18n/radarCopy';
import { HEALTH_CHECK_POINTS, RADAR_WEIGHTS, TRANSACTION_CHECK_POINTS } from '../engine/radarScore';
import '../research.css';

const PROPOSAL_PDF = '/review/round1-proposal.pdf';
const PROPOSAL_DOWNLOAD_NAME = 'Other-Side-Round1-Proposal.pdf';

export function ResearchScreen() {
  const { t, locale } = useTranslation();
  const content = useMemo(() => researchContent(locale), [locale]);
  const radar = content.radar;
  const radarText = radarCopy(locale);
  const radarGroups = [
    { id: 'transactions' as const, rows: TRANSACTION_CHECK_POINTS.map((c) => ({ text: radarText.checks[c.id] ?? c.id, grade: radarText.grades[c.id] ?? '', points: `0-${c.max}` })) },
    { id: 'health' as const, rows: HEALTH_CHECK_POINTS.map((c) => ({ text: radarText.checks[c.id] ?? c.id, grade: radarText.grades[c.id] ?? '', points: `0-${c.max}` })) },
    { id: 'events' as const, rows: radar.eventRows },
  ];


  const layerTabs: TabSpec[] = content.layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    content: (
      <div className="research-layer-content">
        <div className="research-layer-heading">
          <h3>{layer.label}</h3>
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

      <section className="research-section" aria-labelledby="research-how">
        <div className="research-section-heading">
          <h2 id="research-how">{methodCopy[locale].title}</h2>
        </div>
        <HowItWorksFlow locale={locale} />
        <ThreeLayers title={content.framework} line={content.frameworkLine} layers={content.layers}>
          <div className="mt-4">
            <Tabs tabs={layerTabs} ariaLabel={content.framework} idPrefix="research-layer" initialTab="story" />
          </div>
          <div className="research-scope">
            <h3>{content.scopeTitle}</h3>
            <p>{content.scope}</p>
          </div>
        </ThreeLayers>
        <BrokersAndReplay locale={locale} />
        <MethodRules locale={locale} />
      </section>

      <section className="research-section" aria-labelledby="research-radar">
        <div className="research-section-heading">
          <h2 id="research-radar">{radar.title}</h2>
        </div>
        <div className="card card-pad space-y-5">
          <p className="text-sm text-muted">{radar.intro}</p>
          <div className="grid gap-4 lg:grid-cols-3">
            {radarGroups.map((group) => (
              <div key={group.id} className="rounded-xl border border-line bg-surfaceAlt p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{radarText.pillars[group.id]}</h3>
                  <span className="chip chip-line">
                    {RADAR_WEIGHTS[group.id]}% {radar.weightWord}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{radar.notes[group.id]}</p>
                <table className="mt-3 w-full text-left text-xs">
                  <thead>
                    <tr className="text-muted">
                      <th className="pb-1 font-semibold">{radar.checkCol}</th>
                      <th className="pb-1 text-right font-semibold">{radar.pointsCol}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.text} className="border-t border-line align-top">
                        <td className="py-1.5 pr-3">
                          {row.text}
                          <span className="mt-0.5 block text-[11px] text-muted">{row.grade}</span>
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right font-semibold tabular-nums">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="text-sm">{radar.scoreRule}</p>
          <div>
            <h3 className="text-sm font-semibold">{radar.labelsTitle}</h3>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              {radar.labels.map((item) => (
                <div key={item.name} className="rounded-lg border border-line p-3">
                  <dt className="text-sm font-semibold">{item.name}</dt>
                  <dd className="mt-0.5 text-xs text-muted">{item.rule}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="text-sm font-semibold">{radar.replayTitle}</h3>
            <p className="mt-1 text-sm text-muted">{radar.replay}</p>
          </div>
          <p className="text-xs text-muted">{radar.limits}</p>
          <div>
            <h3 className="text-sm font-semibold">{radar.sourcesTitle}</h3>
            <ul className="mt-2 space-y-1 text-xs">
              {radar.sources.map((source) => (
                <li key={source.url}>
                  <a className="text-brandDeep underline" href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <span className="text-muted">{' · '}{source.used}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="research-section" aria-labelledby="research-data">
        <div className="research-section-heading">
          <h2 id="research-data">{content.dataTitle}</h2>
        </div>
        <div className="card card-pad">
          <div className="research-rules">
            <div>
              {content.data.map((item) => (
                <div key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="research-section" aria-labelledby="research-ai">
        <div className="research-section-heading">
          <h2 id="research-ai">{content.aiTitle}</h2>
        </div>
        <div className="card card-pad">
          <div className="research-rules">
            <div>
              {content.ai.map((item) => (
                <div key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="research-source">
        <h3>{content.source}</h3>
        <div>
          <a className="btn btn-quiet" href={PROPOSAL_PDF} download={PROPOSAL_DOWNLOAD_NAME}>
            <span aria-hidden="true">↓</span>
            {content.proposal}
          </a>
          <Link className="btn btn-ghost" to="/stocks">
            {content.stocks}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
