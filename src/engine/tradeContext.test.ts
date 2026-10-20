import { describe, expect, it } from 'vitest';
import brokersDoc from '../../public/data/brokers.json';
import eventsDoc from '../../public/data/sini/events.json';
import rowsDoc from '../../public/data/sini/rows.json';
import sessionsDoc from '../../public/data/sini/sessions.json';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import type { FactsContext, FactsData } from './facts';
import { buildTradeContext } from './tradeContext';

const data: FactsData = {
  rows: rowsDoc.rows as NormalizedBrokerRow[],
  sessions: sessionsDoc.sessions as SessionSummary[],
  brokers: brokersDoc.brokers as BrokerProfile[],
  events: eventsDoc.events as SiniEvent[],
};

const AUG24_CUTOFF = '2026-08-25T00:00:00+07:00';
const SEP23_CUTOFF = '2026-09-24T00:00:00+07:00';

function context(overrides: Partial<FactsContext>): FactsContext {
  return {
    ticker: 'SINI',
    sessionDate: '2026-09-23',
    cutoffAt: SEP23_CUTOFF,
    periodStart: '2026-08-14',
    periodEnd: '2026-09-23',
    scenario: 'baseline',
    locale: 'en',
    dataVersion: sessionsDoc.dataVersion,
    taxonomyVersion: 'brokers-team-mapping-v1',
    claimVersion: 'sini-events-reviewed-v1',
    ...overrides,
  };
}

describe('sell simulation', () => {
  it('at 24 Aug uses the passing C12 wording, five positive sessions and the 20 Aug weak link', () => {
    const view = buildTradeContext('sell', context({ sessionDate: '2026-08-24', cutoffAt: AUG24_CUTOFF }), data);
    expect(view.sellWording).toBe(
      'Institution-facing brokers were net buyers in each of the last five sessions (18 Aug to 24 Aug, visible sample).',
    );
    expect(view.sellFactId).toMatch(/^F-SINI-C12-/);
    expect(view.positive).toMatchObject({
      factId: view.sellFactId,
      start: '2026-08-18',
      end: '2026-08-24',
      dates: ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24'],
    });
    expect(view.weakLink).toMatchObject({
      date: '2026-08-20',
      candidateGroup: 'institution_facing',
      candidateValue: 30,
      otherGroup: 'other_mixed',
      otherValue: 1065,
    });
    expect(view.weakLink?.factId).toMatch(/^F-SINI-C13-/);
    expect(view.asOf).toEqual({ sessionDate: '2026-08-24', nextDayDate: '2026-08-25', nextDayHoliday: true });
    expect(view.today).toBeNull();
    expect(view.window).toBeNull();
    expect(view.direction).toBeNull();
  });

  it('never leaks September dates into the 24 Aug view', () => {
    const view = buildTradeContext('sell', context({ sessionDate: '2026-08-24', cutoffAt: AUG24_CUTOFF }), data);
    expect(JSON.stringify(view)).not.toContain('2026-09');
  });

  it('falls back at 23 Sep where neither streak claim passes, still naming the weak link', () => {
    const view = buildTradeContext('sell', context({}), data);
    expect(view.sellWording).toBeNull();
    expect(view.sellFactId).toBeNull();
    expect(view.positive).toBeNull();
    expect(view.weakLink).not.toBeNull();
    expect(view.asOf).toEqual({ sessionDate: '2026-09-23', nextDayDate: '2026-09-24', nextDayHoliday: false });
  });
});

describe('buy simulation', () => {
  it('at 23 Sep exposes the daily reference, the institution window reference and the direction', () => {
    const view = buildTradeContext('buy', context({}), data);
    expect(view.today).toMatchObject({ display: 17873 });
    expect(view.today?.factId).toMatch(/^F-SINI-C11-/);
    expect(view.window).toMatchObject({ display: 13317 });
    expect(view.window?.factId).toMatch(/^F-SINI-REF-INST-CUTOFF-/);
    expect(view.direction).toBe('above');
    expect(view.asOf.nextDayHoliday).toBe(false);
  });

  it('has no daily reference before two captured sessions exist', () => {
    const view = buildTradeContext(
      'buy',
      context({ sessionDate: '2026-08-14', cutoffAt: '2026-08-15T00:00:00+07:00' }),
      data,
    );
    expect(view.today).toBeNull();
    expect(view.direction).toBeNull();
  });
});
