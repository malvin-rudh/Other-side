import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import type { PublicData } from '../data/publicData';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { buildEvidenceView, type EvidenceView } from '../engine/evidence';
import { buildFacts, factByKey, type FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { initialAnalyticalContext } from '../store/contextStore';
import { EvidenceDrawer } from './EvidenceDrawer';

// Zustand's SSR snapshot reads the creation-time initial state, which
// setState cannot change; mock the hook to read a plain mutable object
// (same pattern as StockScreen.test.tsx).
const mockStore = vi.hoisted(() => {
  let state: Record<string, unknown> = {};
  const hook = Object.assign(
    (selector: (value: never) => unknown) => selector(state as never),
    {
      getState: () => state,
      setState: (partial: Record<string, unknown>) => {
        state = { ...state, ...partial };
      },
      getInitialState: () => state,
      reset: (next: Record<string, unknown>) => {
        state = { ...next };
      },
    },
  );
  return { hook };
});

vi.mock('../store/contextStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/contextStore')>();
  return { ...actual, useContextStore: mockStore.hook };
});

const data: PublicData = {
  rows: rows.rows as NormalizedBrokerRow[],
  sessions: sessions.sessions as SessionSummary[],
  defaultWindow: sessions.defaultWindow,
  brokers: brokers.brokers as BrokerProfile[],
  events: events.events as SiniEvent[],
  versions: {
    data: sessions.dataVersion,
    taxonomy: brokers.version,
    claims: events.version,
  },
};

const context: FactsContext = {
  ticker: 'SINI',
  sessionDate: '2026-08-24',
  cutoffAt: sessionAvailableAt('2026-08-24'),
  periodStart: '2026-08-14',
  periodEnd: '2026-09-23',
  scenario: 'default',
  locale: 'en',
  dataVersion: sessions.dataVersion,
  taxonomyVersion: brokers.version,
  claimVersion: events.version,
};

const c10 = factByKey(buildFacts(context, data), 'C10');
if (!c10) throw new Error('missing C10');
const c10View = buildEvidenceView(c10.fact_id, context, data, 'en');
if (!c10View) throw new Error('missing C10 evidence view');

beforeEach(() => {
  mockStore.hook.reset({ ...initialAnalyticalContext, locale: 'en' });
});

function renderDrawer(view: EvidenceView = c10View!, initialTab?: 'summary' | 'rows' | 'method') {
  return renderToStaticMarkup(
    <EvidenceDrawer view={view} cutoffAt={context.cutoffAt} trigger={null} onClose={() => {}} initialTab={initialTab} />,
  );
}

describe('EvidenceDrawer summary tab', () => {
  const html = renderDrawer();

  it('renders claim text, fact ID, strength, approximate display and the parsed total', () => {
    expect(html).toContain('Parsed source-label total');
    expect(html).toContain(c10.fact_id);
    expect(html).toContain('about 8,220');
    expect(html).toContain('125,601 lots');
    expect(html).toContain('Rp103,241,500,000');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Summary');
    expect(html).toContain('Source rows');
    expect(html).toContain('Method');
  });

  it('renders Bahasa Indonesia strings for the same fact', () => {
    mockStore.hook.reset({ ...initialAnalyticalContext, locale: 'id' });
    const idView = buildEvidenceView(c10.fact_id, { ...context, locale: 'id' }, data, 'id');
    if (!idView) throw new Error('missing ID view');
    const idHtml = renderDrawer(idView);
    expect(idHtml).toContain('Total pasti label sumber terparsing');
    expect(idHtml).toContain('ID fakta');
  });
});

describe('EvidenceDrawer source rows tab', () => {
  const html = renderDrawer(c10View, 'rows');

  it('always shows the unknown-not-zero note with the row table', () => {
    expect(html).toContain('A broker missing from this table is unknown, not zero.');
    expect(html).toContain('Date');
    expect(html).toContain('Side');
    expect(html).toContain('Rank');
    expect(html).toContain('Broker');
    expect(html).toContain('Net lots');
    expect(html).toContain('Net value (IDR)');
    expect(html).toContain('Source avg');
    expect(html).toContain('Raw label');
    expect(html).toContain('Row ID');
    expect(html).toContain(c10.source_row_ids[0] ?? '');
    expect(html).toContain('·');
  });
});

describe('EvidenceDrawer method tab', () => {
  const html = renderDrawer(c10View, 'method');

  it('renders formula, period, cutoff, coverage note and exclusions state', () => {
    expect(html).toContain('Sum of net-buy value IDR');
    expect(html).toContain('14 Aug 2026');
    expect(html).toContain('24 Aug 2026');
    expect(html).toContain('Coverage note');
    expect(html).toContain(c10.coverage_note.en);
    expect(html).toContain('No excluded or missing sessions fall inside this period.');
  });
});

describe('EvidenceDrawer what-if entry', () => {
  it('offers the unclassified-assumption control per broker row when a handler is provided', () => {
    const html = renderToStaticMarkup(
      <EvidenceDrawer
        view={c10View}
        cutoffAt={context.cutoffAt}
        trigger={null}
        onClose={() => {}}
        initialTab="rows"
        onAssumeBroker={() => {}}
      />,
    );
    const code = c10View.rows[0]?.brokerCode ?? '';
    expect(code.length).toBeGreaterThan(0);
    expect(html).toContain(
      `What if the client profile of this broker is unclear? Treat ${code} as unclassified`,
    );
  });

  it('omits the assume control when no handler is provided', () => {
    const html = renderDrawer(c10View, 'rows');
    expect(html).not.toContain('treated as unclassified');
  });
});

