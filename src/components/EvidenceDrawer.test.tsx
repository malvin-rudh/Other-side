import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import type { PublicData } from '../data/publicData';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { buildEvidenceView, type EvidenceFocus, type EvidenceView } from '../engine/evidence';
import { buildFacts, type FactsContext } from '../engine/facts';
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

// The widest group-net fact: visible rows across the window, all groups together.
const groupNet = buildFacts(context, data)
  .facts.filter((fact) => fact.type === 'group-net')
  .sort((a, b) => b.source_row_ids.length - a.source_row_ids.length)[0];
if (!groupNet) throw new Error('missing group-net fact');
const view = buildEvidenceView(groupNet.fact_id, context, data, 'en');
if (!view) throw new Error('missing group-net evidence view');

const signedSum = (rowsIn: EvidenceView['rows']) =>
  rowsIn.reduce((sum, row) => sum + (row.side === 'buy' ? row.netLots : -row.netLots), 0);
const lotsText = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '\u2212' : ''}${new Intl.NumberFormat('en-US').format(Math.abs(value))} lots`;

beforeEach(() => {
  mockStore.hook.reset({ ...initialAnalyticalContext, locale: 'en' });
});

function renderDrawer(focus?: EvidenceFocus, target: EvidenceView = view!) {
  return renderToStaticMarkup(
    <EvidenceDrawer view={target} cutoffAt={context.cutoffAt} trigger={null} onClose={() => {}} focus={focus} />,
  );
}

describe('EvidenceDrawer proof for a group number', () => {
  const groupRows = view.rows.filter((row) => row.group === 'institution_facing');
  const html = renderDrawer({ group: 'institution_facing' });

  it('names the group and shows the total of its rows, buying plus and selling minus', () => {
    expect(html).toContain('How we got this number');
    expect(html).toContain('Institutional brokers');
    expect(html).toContain(lotsText(signedSum(groupRows)));
  });

  it('lists one line per trading day plus a total line', () => {
    const dates = new Set(groupRows.map((row) => row.date));
    const daysList = html.split('data-testid="proof-days"')[1]!.split('</ul>')[0]!;
    expect(daysList.match(/<li/g)?.length).toBe(dates.size + 1);
    expect(daysList).toContain('Total');
  });

  it('splits the same lots by broker', () => {
    expect(html).toContain('Which brokers make it up');
    expect(html).toContain('data-testid="proof-who"');
  });

  it('names the source, the cut-off and the unknown-not-zero rule, with the rows tucked away', () => {
    expect(html).toContain('Where it comes from');
    expect(html).toContain('Only data public by');
    expect(html).toContain('Brokers outside the list are unknown, not zero.');
    expect(html).toContain('<details');
    expect(html).toContain('Show the original rows');
  });
});

describe('EvidenceDrawer proof for one broker', () => {
  const code = view.rows[0]!.brokerCode;
  const html = renderDrawer({ brokerCode: code });

  it('shows the broker total and skips the broker split', () => {
    expect(html).toContain(`Broker ${code}`);
    expect(html).toContain(lotsText(signedSum(view.rows.filter((row) => row.brokerCode === code))));
    expect(html).not.toContain('data-testid="proof-who"');
  });
});

describe('EvidenceDrawer without broker rows', () => {
  it('falls back to the stated value and says it is not built from rows', () => {
    const html = renderDrawer(undefined, { ...view, rows: [] });
    expect(html).toContain('This number is not built from broker rows.');
    expect(html).not.toContain('data-testid="proof-days"');
  });
});
