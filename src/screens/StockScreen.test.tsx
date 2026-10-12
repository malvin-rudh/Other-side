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
  it('renders header, proxy button, window and card without any future data', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('SINI · PT Singaraja Putra');
    expect(html).toContain('data-fact-id="F-SINI-C11-20260821-20260824-baseline"');
    expect(html).toMatch(/≈Rp8,777 · (?:<!-- -->)?24 Aug/);
    expect(html).toContain('implied price reference, not close');
    expect(html).toContain('14 Aug 2026');
    expect(html).toContain('24 Aug 2026');
    expect(html).toContain('Other Side');
    expect(html).toContain('Rule-based preview');
    expect(html).toContain('Observed');

    expect(html).not.toContain('E-SINI-0831-BOARD-EXIT');
    expect(html).not.toContain('E-SINI-0903-ATH');
    expect(html).toContain('Daily net-flow implied price reference, 6 captured sessions');
    expect(html).toContain('Cumulative group net flows over 6 sessions');
    expect(html).toContain(' is excluded: overlapping screenshots put the same brokers on both sides.');
    expect(html).not.toContain('was not captured, so its flows are unknown, not zero');
    expect(html).toContain('Who the end clients are, and whether they still hold the shares.');
    expect(html).toContain('institution-facing net falls from about');
  });

  it('renders Bahasa Indonesia strings with identical facts', () => {
    setStore({ locale: 'id' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Pratinjau berbasis aturan');
    expect(html).toContain('Teramati');
    expect(html).toContain('data-fact-id="F-SINI-C11-20260821-20260824-baseline"');
    expect(html).toMatch(/≈Rp8\.777 · (?:<!-- -->)?24 Agu/);
    expect(html).toContain(' dikeluarkan: tangkapan layar yang tumpang tindih menempatkan broker yang sama di kedua sisi.');
    expect(html).toContain('lot bersih institution-facing turun dari sekitar');
    expect(html).not.toContain('E-SINI-0831-BOARD-EXIT');
  });

  it('translates evidence-strength chips in Bahasa Indonesia', () => {
    setStore({ locale: 'id' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Kuat');
    expect(html).toContain('Sedang');
    expect(html).not.toContain('Strong');
    expect(html).not.toContain('Moderate');
    expect(html).not.toContain('Not enough data');
  });

  it('shows the nothing-published message when a layer has no events', () => {
    vi.mocked(usePublicData).mockReturnValue({
      status: 'ready',
      data: { ...readyData, events: [] },
    });
    const html = renderScreen();
    expect(html).toContain('Nothing published yet at this point.');
  });
});

describe('StockScreen session scrubber', () => {
  it('renders the framing title and the replay-rule subtitle for the selected session', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('What could you know at this point?');
    expect(html).toContain('24 Aug 2026 session · available after publication (replay rule)');
  });

  it('exposes an accessible slider plus previous, next and play controls', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('aria-label="Captured session scrubber"');
    expect(html).toContain('aria-valuetext="24 Aug 2026"');
    expect(html).toContain('aria-label="Previous session"');
    expect(html).toContain('aria-label="Next session"');
    expect(html).toContain('aria-label="Play"');
    expect(html).toContain('type="range"');
  });

  it('offers the three quick stops', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Jump to 24 Aug 2026');
    // Month abbreviation varies across ICU versions ("Sep" vs "Sept").
    expect(html).toMatch(/Jump to 3 Sep(t)? 2026/);
    expect(html).toMatch(/Jump to 23 Sep(t)? 2026/);
  });

  it('carries the raw reason on the grey excluded and missing markers', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('13 Aug 2026: Excluded. quarantined overlapping screenshots');
    expect(html).toMatch(/8 Sep(t)? 2026: Not captured\. not captured/);
  });

  it('labels market holidays directly in the strip', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('17 Aug 2026: market holiday');
    expect(html).toContain('25 Aug 2026: market holiday');
    expect(html).toContain('>holiday<');
  });

  it('renders the scrubber strings in Bahasa Indonesia', () => {
    setStore({ locale: 'id' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Apa yang bisa Anda ketahui pada titik ini?');
    expect(html).toContain('Sesi 24 Agu 2026 · tersedia setelah publikasi (aturan replay)');
    expect(html).toContain('Lompat ke 23 Sep 2026');
    expect(html).toContain('13 Agu 2026: Dikeluarkan. quarantined overlapping screenshots');
  });
});

describe('StockScreen Other Side card caps and footer caveats', () => {
  it('caps the observed section at three claims and offers the rest via Show all', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Institution-facing brokers were net buyers in each of the last five sessions (');
    expect(html).toContain('App-facing brokers were ');
    expect(html).toContain('57.5k');
    expect(html).toContain('Show all (9)');
    expect(html).not.toContain('The window average net-flow implied price reference is about ');
  });

  it('renders the shared caveat once in the card footer instead of under each claim', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    const caveat = 'Visible top-nine-per-side sample only; brokers outside the sample are unknown.';
    expect(html.split(caveat)).toHaveLength(2);
  });

  it('uses the same cap control wording in Bahasa Indonesia', () => {
    setStore({ locale: 'id' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Tampilkan semua (9)');
  });
});

describe('StockScreen simulation buttons', () => {
  it('renders Simulate Sell and Simulate Buy without opening any sheet by default', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Simulate Sell');
    expect(html).toContain('Simulate Buy');
    expect(html).not.toContain('Who am I trading with?');
    expect(html).not.toContain('Simulated · historical snapshot after publication.');
  });

  it('renders the button labels in Bahasa Indonesia', () => {
    setStore({ locale: 'id' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Simulasi jual');
    expect(html).toContain('Simulasi beli');
    expect(html).not.toContain('Simulate Sell');
  });
});

describe('StockScreen broker what-if', () => {
  it('offers the unclassified-assumption control on ranking chips while the scenario is off', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain(
      'What if the client profile of this broker is unclear? Treat CC as unclassified',
    );
    expect(html).not.toContain('Your assumption:');
  });

  it('renders the what-if panel with before/after totals and reset when the scenario is active', () => {
    setStore({ scenario: 'unknown-broker:TP' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Your assumption: TP treated as unclassified');
    expect(html).toContain('Group totals, before vs after');
    expect(html).toContain('direction remains positive');
    expect(html).toContain('Claims that changed');
    expect(html).toContain('Claims that survived');
    expect(html).toContain('Reset to baseline');
  });

  it('renders the what-if panel strings in Bahasa Indonesia', () => {
    setStore({ locale: 'id', scenario: 'unknown-broker:TP' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('Asumsi Anda: TP diperlakukan sebagai tidak terklasifikasi');
    expect(html).toContain('arah tetap positif');
    expect(html).toContain('Kembali ke baseline');
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

describe('StockScreen changed strip', () => {
  it('names both sessions at the 24 Aug cutoff', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('What changed since the previous session');
    expect(html).toContain('21 Aug 2026 → 24 Aug 2026');
  });

  it('marks each move with a text arrow so direction never relies on colour alone', () => {
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toMatch(/[▲▼]/);
  });

  it('shows an honest note at the first captured session instead of invented moves', () => {
    setStore({ selectedSessionDate: '2026-08-14' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();

    expect(html).toContain('No previous captured session, so nothing can be compared yet.');
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

  it('renders empty and unavailable states when the window has no eligible rows', () => {
    setStore({ periodStart: '2026-09-23', periodEnd: '2026-09-23' });
    vi.mocked(usePublicData).mockReturnValue({ status: 'ready', data: readyData });
    const html = renderScreen();
    expect(html).toContain('Nothing to show yet.');
    expect(html).toContain('Not available in this view.');
  });
});
