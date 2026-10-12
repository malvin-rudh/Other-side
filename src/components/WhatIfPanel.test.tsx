import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import type { FactsData } from '../engine/facts';
import type { FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { buildWhatIfView, type WhatIfView } from '../engine/whatIf';
import { initialAnalyticalContext } from '../store/contextStore';
import { WhatIfPanel } from './WhatIfPanel';

// Same hoisted mock-store pattern as StockScreen.test.tsx so SSR renders the
// locale we set instead of the creation-time initial state.
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

const context: FactsContext = {
  ticker: 'SINI',
  sessionDate: '2026-09-23',
  cutoffAt: sessionAvailableAt('2026-09-23'),
  periodStart: '2026-08-14',
  periodEnd: '2026-09-23',
  scenario: 'default',
  locale: 'en',
  dataVersion: sessions.dataVersion,
  taxonomyVersion: brokers.version,
  claimVersion: events.version,
};

const tpView = buildWhatIfView('TP', context, data);

beforeEach(() => {
  mockStore.hook.reset({ ...initialAnalyticalContext, locale: 'en' });
});

function renderPanel(view: WhatIfView = tpView): string {
  return renderToStaticMarkup(<WhatIfPanel view={view} onReset={() => {}} />);
}

describe('WhatIfPanel in English', () => {
  const html = renderPanel();

  it('renders the assumption badge, before/after totals and the direction note', () => {
    expect(html).toContain('Your assumption: TP treated as unclassified');
    expect(html).toContain('Group totals, before vs after');
    expect(html).toContain('Before');
    expect(html).toContain('After');
    expect(html).toContain('+181,305');
    expect(html).toContain('+140,122');
    expect(html).toContain('+41,183');
    expect(html).toContain('direction remains positive');
  });

  it('lists sentence diffs for changed claims and a count with toggle for survivors', () => {
    expect(html).toContain('Claims that changed');
    expect(html).toContain('wording changed');
    expect(html).toContain('Before: ');
    expect(html).toContain('After: ');
    expect(html).toContain('is moved to Unknown');

    expect(html).toContain('Claims that survived');
    expect(html).toMatch(/\d+ statements stay exactly the same\./);
    expect(html).toContain('Show');
    expect(html).not.toContain('Brokers ranked by visible net-buy lots inside the top-nine-per-side sample.');
    expect(html).not.toContain('CL-');
  });

  it('explains a claim that stopped holding with the computed streak-break reason', () => {
    const aug24: FactsContext = {
      ...context,
      sessionDate: '2026-08-24',
      cutoffAt: sessionAvailableAt('2026-08-24'),
    };
    const html24 = renderPanel(buildWhatIfView('TP', aug24, data));
    expect(html24).toContain('no longer available');
    expect(html24).toContain('Institution-facing brokers were net buyers in each of the last five sessions');
    expect(html24).toContain('Why it no longer holds');
    expect(html24).toContain('on 20 Aug');
    expect(html24).toContain('from +30 to 0');
    expect(html24).toContain('without TP');
    expect(html24).not.toContain('CL-');
  });

  it('states that raw rows are unchanged and offers the reset control', () => {
    expect(html).toContain(
      'Raw source rows are unchanged; only the group mapping of TP is assumed different.',
    );
    expect(html).toContain('Reset to baseline');
  });
});

describe('WhatIfPanel in Bahasa Indonesia', () => {
  it('renders the same view with Indonesian strings', () => {
    mockStore.hook.reset({ ...initialAnalyticalContext, locale: 'id' });
    const html = renderPanel();

    expect(html).toContain('Asumsi Anda: TP diperlakukan sebagai tidak terklasifikasi');
    expect(html).toContain('Total grup, sebelum vs sesudah');
    expect(html).toContain('Sebelum');
    expect(html).toContain('Sesudah');
    expect(html).toContain('+181.305');
    expect(html).toContain('+140.122');
    expect(html).toContain('+41.183');
    expect(html).toContain('arah tetap positif');
    expect(html).toContain('Klaim yang berubah');
    expect(html).toContain('Klaim yang tetap berlaku');
    expect(html).toMatch(/\d+ pernyataan tetap persis sama\./);
    expect(html).toContain('Tampilkan');
    expect(html).toContain('Baris sumber mentah tidak berubah');
    expect(html).toContain('Kembali ke baseline');
    expect(html).not.toContain('CL-');
  });
});
