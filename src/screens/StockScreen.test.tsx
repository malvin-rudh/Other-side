import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import { usePublicData, type PublicData } from '../data/publicData';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { buildEvidenceView } from '../engine/evidence';
import type { FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { initialAnalyticalContext } from '../store/contextStore';
import { buildSessionFlow } from '../components/charts/SessionSankey';
import { StockScreen } from './StockScreen';

vi.mock('../data/publicData', () => ({ usePublicData: vi.fn() }));

// Zustand's SSR snapshot reads the vanilla api's getInitialState(), which is a
// creation-time capture that setState cannot change and spies cannot reach
// (Object.assign copies the function reference off the api). Mock the module
// so the hook reads a plain mutable object instead.
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

const readyData: PublicData = {
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

function renderScreen(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/stock/SINI']}>
      <Routes>
        <Route path="/stock/:ticker" element={<StockScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function setStore(overrides: Partial<typeof initialAnalyticalContext> = {}) {
  mockStore.hook.reset({
    ...initialAnalyticalContext,
    ticker: 'SINI',
    selectedSessionDate: '2026-08-24',
    periodStart: '2026-08-14',
    periodEnd: '2026-09-23',
    locale: 'en',
    setTicker: () => {},
    selectSession: () => {},
    setPeriod: () => {},
    ...overrides,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(usePublicData).mockReset();
  setStore();
});

describe('StockScreen at the 24 Aug replay cutoff', () => {
  it('renders the header, flow, chart, events and observations without any future data', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('SINI · PT Singaraja Putra');
    expect(html).toContain('aria-label="Session calendar"');
    expect(html).toContain('Retail app brokers');
    expect(html).toContain('Top 5 Net Buyers');
    expect(html).toContain('Top 5 Net Sellers');
    expect(html).toContain('Session broker flow');
    expect(html).toContain('Events in the past 30 days');
    expect(html).toContain('H1 2026 results');
    expect(html).toContain('What was observed?');
    expect(html).toContain('Implications');
    expect(html).not.toContain('What could be interpreted?');
    expect(html).not.toContain('It is not advice.');
    expect(html).not.toContain('Only the top 9 buyers and sellers are visible, so the two sides differ');
    expect(html).not.toContain('The data does not show who traded with whom');
    expect(html).toContain('Broker net flow');
    expect(html).toContain('Company Health');
    expect(html).toContain('data-testid="health-chart"');
    expect(html).toContain('Profit without one-offs');
    expect(html).toContain('Equity');
    expect(html).toContain('>Revenue<');
    expect(html).not.toContain('vs same period last year');
    expect(html).toContain('from Q1');
    expect(html).toContain('Choose brokers');
    expect(html).toContain('+ Add broker');
    expect(html).toContain('Add to Watchlist');
    expect(html).toContain('Add to Portfolio');
    expect(html).toContain('data-testid="company-logo"');
    expect(html).toContain('data-testid="session-sankey"');
    expect(html).not.toContain('Sessions</button>');

    // Published after 24 Aug, or before the 30-day window.
    expect(html).not.toContain('SINI left the special monitoring board');
    expect(html).not.toContain('first all-time high');
    expect(html).not.toContain('rights issue completed');
  });

  it('leaves out the replay player, the Other Side card and the demo tools', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).not.toContain('Rule-based preview');
    expect(html).not.toContain('What changed since the previous session');
    expect(html).not.toContain('chip-unknown');
    expect(html).not.toContain('data-assume-broker');
  });

  it('renders Bahasa Indonesia strings', () => {
    setStore({ locale: 'id' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Apa yang teramati?');
    expect(html).toContain('5 Pembeli Bersih Teratas');
    expect(html).toContain('Peristiwa 30 hari terakhir');
  });

  it('says so when no event falls in the window', () => {
    vi.mocked(usePublicData).mockReturnValue({
      status: 'ready',
      data: { ...readyData, events: [] },
    });
    const html = renderScreen();
    expect(html).toContain('No events published in the past 30 days.');
  });
});

describe('StockScreen conclusion and group colours', () => {
  it('keeps the conclusion under 50 words and does not give advice', () => {
    setStore({ selectedSessionDate: '2026-09-23' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();
    const match = html.match(/data-testid="stock-conclusion"[^>]*>([^<]*)</);
    expect(match).not.toBeNull();
    const text = match![1]!;
    expect(text.split(/\s+/).length).toBeLessThan(50);
    expect(text).not.toContain('Observed data only');
    expect(text).not.toMatch(/\b(buy now|sell now|should buy|should sell|target)\b/i);
  });

  it('colours each group and its brokers from the shared palette', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();
    expect(html).toContain('data-group-colour="#F58220"');
    expect(html).toContain('data-group-colour="#0B1F3A"');
    expect(html).toContain('data-group-colour="#B8C2D1"');
    expect(html).toContain('data-group-colour="#E8EDF3"');
  });

  it('shows only watchlist and portfolio actions for a stock that is not added', () => {
    mockStore.hook.setState({ portfolio: [{ ticker: 'SINI', list: 'watchlist', quantityShares: null, averagePrice: null, purchaseDate: null }] });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();
    expect(html).toContain('Added to Watchlist');
    expect(html).toContain('Add to Portfolio');
    mockStore.hook.setState({ portfolio: [{ ticker: 'SINI', list: 'owned', quantityShares: 100, averagePrice: 10, purchaseDate: '2026-09-01' }] });
    const owned = renderScreen();
    expect(owned).toContain('Added to Portfolio');
    expect(owned).not.toContain('Add to Watchlist');
  });
});

describe('StockScreen flow card follows the selected session', () => {
  it('shows the same group nets as the Sankey and the day top brokers', () => {
    setStore({ selectedSessionDate: '2026-09-23' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();
    const flow = buildSessionFlow(readyData, '2026-09-23')!;
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const fmt = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US')} lots`;
    expect(text).toContain('Flow on 23 Sep');
    expect(flow.nets.app_facing + flow.nets.institution_facing + flow.nets.other_mixed + flow.nets.unknown).toBe(0);
    // Each net appears twice: once in the Flow card, once under the Sankey.
    for (const group of ['app_facing', 'institution_facing', 'other_mixed', 'unknown'] as const) {
      expect(text.split(fmt(flow.nets[group])).length - 1, group).toBeGreaterThanOrEqual(2);
    }
    expect(flow.topBuyers[0]?.code).toBe('CC');
    expect(text).toContain(`CC ${fmt(flow.topBuyers[0]!.lots)}`);
  });
});

describe('StockScreen company health', () => {
  it('holds the H1 report back until it was public', () => {
    setStore({ selectedSessionDate: '2026-08-19' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();
    expect(html).toContain('The Q2 2026 report was first public on 20 Aug 2026');
    expect(html).not.toContain('Profit without one-offs');
  });

  it('shows the 23 Sep observed facts and implications', () => {
    setStore({ selectedSessionDate: '2026-09-23' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();
    const section = html.slice(html.indexOf('What was observed?'), html.indexOf('Company Health'));
    expect(section).toContain('net bought');
    expect(section).toContain('Largest net buyer');
  });
});

describe('StockScreen evidence acceptance', () => {
  it('resolves an evidence view for every fact ID surfaced on screen', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    const factIds = [
      ...new Set(
        [...html.matchAll(/data-fact-id="([^"]+)"/g)]
          .map((match) => match[1])
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    expect(factIds.length).toBeGreaterThan(0);

    const context: FactsContext = {
      ticker: 'SINI',
      sessionDate: '2026-08-24',
      cutoffAt: sessionAvailableAt('2026-08-24'),
      periodStart: '2026-08-14',
      periodEnd: '2026-09-23',
      scenario: 'default',
      locale: 'en',
      dataVersion: readyData.versions.data,
      taxonomyVersion: readyData.versions.taxonomy,
      claimVersion: readyData.versions.claims,
    };
    for (const factId of factIds) {
      expect(buildEvidenceView(factId, context, readyData, 'en'), factId).not.toBeNull();
    }
  });
});

describe('StockScreen states', () => {
  it('renders the loading state', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'loading' });
    const html = renderScreen();
    expect(html).toContain('Loading…');
  });

  it('renders the error state with the message', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'error', message: 'fetch failed: /data/sini/rows.json (404)' });
    const html = renderScreen();
    expect(html).toContain('Something went wrong. Please try again.');
    expect(html).toContain('fetch failed: /data/sini/rows.json (404)');
  });

  it('renders the empty observation state when the window has no eligible rows', () => {
    setStore({ periodStart: '2026-09-23', periodEnd: '2026-09-23' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();
    expect(html).toContain('Nothing to show yet.');
    // The flow card reads the selected day, not the window, so it still shows.
    expect(html).toContain('Flow on 24 Aug');
  });
});
