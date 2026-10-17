import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, type TabSpec } from '../components/TabList';
import { useTranslation } from '../i18n';
import { researchContent } from '../i18n/research';
import '../research.css';

const PROPOSAL_PDF = '/review/round1-proposal.pdf';
const PROPOSAL_DOWNLOAD_NAME = 'Other-Side-Round1-Proposal.pdf';

const LAYER_GLYPH: Record<string, string> = { story: '1', flow: '2', health: '3' };

export function ResearchScreen() {
  const { t, locale } = useTranslation();
  const content = useMemo(() => researchContent(locale), [locale]);

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

      <section className="research-section" aria-labelledby="research-where">
        <div className="research-section-heading">
          <h2 id="research-where">{content.whereTitle}</h2>
        </div>
        <ul className="research-journey">
          {content.where.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
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
          <Link className="btn btn-ghost" to="/stocks">
            {content.stocks}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
