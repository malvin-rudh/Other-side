import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import type { FactsContext, FactsData } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { buildTradeContext, type TradeContextView } from '../engine/tradeContext';
import { initialAnalyticalContext } from '../store/contextStore';
import { TradeContextSheet } from './TradeContextSheet';

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

const data: FactsData = {
  rows: rows.rows as NormalizedBrokerRow[],
  sessions: sessions.sessions as SessionSummary[],
  brokers: brokers.brokers as BrokerProfile[],
  events: events.events as SiniEvent[],
};

const aug24: FactsContext = {
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

const sep23: FactsContext = { ...aug24, sessionDate: '2026-09-23', cutoffAt: sessionAvailableAt('2026-09-23') };

function renderSheet(kind: 'sell' | 'buy', view: TradeContextView): string {
  return renderToStaticMarkup(
    <TradeContextSheet kind={kind} view={view} trigger={null} onClose={() => {}} onOpenEvidence={() => {}} />,
  );
}

beforeEach(() => {
  mockStore.hook.reset({ ...initialAnalyticalContext, locale: 'en' });
});

describe('sell sheet at 24 Aug', () => {
  const sellView = buildTradeContext('sell', aug24, data);

  it('renders title, banner, C12 wording, positive sessions, weak link and holiday note', () => {
    const html = renderSheet('sell', sellView);
    expect(html).toContain('Who am I trading with?');
    expect(html).toContain('Simulated · historical snapshot after publication. No order will be placed.');
    expect(html).toContain('Institution-facing brokers were net buyers in each of the last five sessions');
    expect(html).toContain('Five positive sessions: 18 Aug, 19 Aug, 20 Aug, 21 Aug, 24 Aug');
    expect(html).toContain('Weak link:');
    expect(html).toContain('20 Aug');
    expect(html).toContain('+30');
    expect(html).toContain('+1,065');
    expect(html).toContain('institution-facing');
    expect(html).toContain('other / mixed');
    expect(html).toContain('25 Aug 2026, the day after the session, was a market holiday.');
    expect(html).toContain('role="dialog"');
  });

  it('renders the sell limits and the unknown-client note', () => {
    const html = renderSheet('sell', sellView);
    expect(html).toContain('Limits');
    expect(html).toContain('This does not identify the buyer of your order.');
    expect(html).toContain('Who the end clients are, and whether they still hold the shares, is unknown.');
  });
});

describe('sell sheet at 23 Sep', () => {
  const sellView = buildTradeContext('sell', sep23, data);

  it('renders the fallback sentence with the weak link and no holiday note', () => {
    const html = renderSheet('sell', sellView);
    expect(html).toContain('The available data does not support a five-session buying claim.');
    expect(html).not.toContain('Five positive sessions:');
    expect(html).not.toContain('was a market holiday.');
  });
});

describe('buy sheet at 23 Sep', () => {
  const buyView = buildTradeContext('buy', sep23, data);

  it('renders both references, the direction, the not-cost-basis note and buy limits', () => {
    const html = renderSheet('buy', buyView);
    expect(html).toContain('net-flow implied price reference:');
    expect(html).toContain('Institution-facing net-buy implied reference (window so far):');
    expect(html).toContain('≈Rp17,873');
    expect(html).toContain('≈Rp13,317');
    expect(html).toContain('reference is above the window');
    expect(html).toContain('not official closes, VWAP, cost bases or executable quotes.');
    expect(html).toContain('This does not identify the seller to your order.');
    expect(html).not.toContain('was a market holiday.');
  });
});
