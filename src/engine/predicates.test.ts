import { describe, expect, it } from 'vitest';
import brokersDoc from '../../public/data/brokers.json';
import eventsDoc from '../../public/data/sini/events.json';
import rowsDoc from '../../public/data/sini/rows.json';
import sessionsDoc from '../../public/data/sini/sessions.json';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { cumulativeGroupNet } from './flows';
import {
  brokerObservedNet,
  eventsPublishedAtCutoff,
  isSessionEligibleAtCutoff,
  lastActualMarketSessions,
  latestObservedReversal,
  mainBuyerStreak,
  observedBrokerReversal,
  positiveStreak,
  rowsEligibleAtCutoff,
  rowsVisibleByCutoffInWindow,
  sessionAvailableAt,
  snapshotChange,
  withOneBrokerUnknownOverride,
} from './predicates';

const rows = rowsDoc.rows as NormalizedBrokerRow[];
const brokers = brokersDoc.brokers as BrokerProfile[];
const sessions = sessionsDoc.sessions as SessionSummary[];
const events = eventsDoc.events as SiniEvent[];
const cleanWindow = { start: '2026-08-14', end: '2026-09-23' };

describe('cutoff and publication eligibility', () => {
  it('makes broker session D eligible only at D+1 00:00 WIB', () => {
    expect(sessionAvailableAt('2026-09-23')).toBe('2026-09-24T00:00:00+07:00');
    expect(isSessionEligibleAtCutoff('2026-09-23', '2026-09-23T23:59:59+07:00')).toBe(false);
    expect(isSessionEligibleAtCutoff('2026-09-23', '2026-09-24T00:00:00+07:00')).toBe(true);
    expect(rowsEligibleAtCutoff(rows, '2026-09-24T00:00:00+07:00').some((row) => row.date === '2026-09-23')).toBe(true);
    expect(rowsVisibleByCutoffInWindow(rows, '2026-09-23T23:59:59+07:00', '2026-09-23', '2026-09-23')).toHaveLength(0);
  });

  it('filters events by publication availability rather than event/reporting date', () => {
    const futurePublished: SiniEvent = {
      id: 'TEST-LATE-PUBLICATION',
      layer: 'story',
      eventDate: '2026-09-01',
      publicationDate: '2026-09-10',
      availableAt: '2026-09-10T00:00:00+07:00',
      source: { name: 'Test', url: 'https://example.test/source' },
      text: { en: 'Test', id: 'Tes', zh: '测试' },
    };
    expect(eventsPublishedAtCutoff([futurePublished], '2026-09-05T00:00:00+07:00')).toHaveLength(0);
    expect(eventsPublishedAtCutoff([futurePublished], '2026-09-10T00:00:00+07:00')).toHaveLength(1);
    expect(eventsPublishedAtCutoff(events, '2026-08-21T00:00:00+07:00').map((event) => event.id)).toContain('E-SINI-0821-EQUITY');
  });
});

describe('five-session predicates', () => {
  it('uses the last five actual market sessions and skips holidays/weekends', () => {
    expect(lastActualMarketSessions(sessions, '2026-08-24', 5).map((session) => session.date)).toEqual([
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
    ]);
  });

  it('returns not enough data when a required five-session window crosses 8 Sep', () => {
    const result = positiveStreak(rows, brokers, sessions, 'institution_facing', '2026-09-10', 5);
    expect(result.status).toBe('not_enough_data');
    expect(result.dates).toContain('2026-09-08');
    expect(result.reason).toContain('missing');
  });

  it('passes the institution-facing positive streak ending 24 Aug', () => {
    const result = positiveStreak(rows, brokers, sessions, 'institution_facing', '2026-08-24', 5);
    expect(result.status, JSON.stringify(result.evidence, null, 2)).toBe('passes');
    expect(result.dates).toEqual(['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24']);
  });

  it('fails the institution-facing main-buyer streak on 20 Aug', () => {
    const result = mainBuyerStreak(rows, brokers, sessions, 'institution_facing', '2026-08-24', 5);
    const day20 = result.evidence.find((entry) => entry.date === '2026-08-20');
    expect(day20?.groups?.institution_facing).toBe(30);
    expect(day20?.groups?.other_mixed).toBe(1_065);
    expect(result.status).toBe('fails');
    expect(result.reason).toContain('2026-08-20');
  });
});

describe('observed broker changes and reversals', () => {
  it('computes observed broker net-sell quantities', () => {
    expect(brokerObservedNet(rows, 'ES', '2026-09-01')).toBe(-59_500);
    expect(brokerObservedNet(rows, 'ES', '2026-09-03')).toBe(-22_000);
  });

  it('reports snapshot changes with both dates named', () => {
    expect(snapshotChange(rows, 'ES', '2026-09-01', '2026-09-03')).toEqual({
      brokerCode: 'ES',
      fromDate: '2026-09-01',
      toDate: '2026-09-03',
      fromNetLots: -59_500,
      toNetLots: -22_000,
      changeLots: 37_500,
    });
  });

  it('detects opposite observed net directions through one broker without claiming a round trip', () => {
    expect(observedBrokerReversal(rows, 'CC', '2026-09-17', '2026-09-18')).toMatchObject({
      brokerCode: 'CC',
      fromDate: '2026-09-17',
      toDate: '2026-09-18',
      fromNetLots: 17_500,
      toNetLots: -15_600,
      reversed: true,
    });
    expect(observedBrokerReversal(rows, 'AZ', '2026-09-22', '2026-09-23')).toMatchObject({
      brokerCode: 'AZ',
      fromDate: '2026-09-22',
      toDate: '2026-09-23',
      fromNetLots: 3_500,
      toNetLots: -3_400,
      reversed: true,
    });
    expect(observedBrokerReversal(rows, 'AZ', '2026-09-22', '2026-09-23')?.caveat).toContain('not a proven same-client round trip');
  });
});

describe('latest observed reversal over consecutive market sessions', () => {
  const marketSessions = sessions.filter(
    (session) => session.status === 'captured' || session.status === 'missing' || session.status === 'excluded',
  );

  it('matches the golden reversals at the 23 Sep and 24 Aug cutoffs', () => {
    const sepSessions = marketSessions.filter((session) => session.date <= '2026-09-23');
    expect(latestObservedReversal(rows, sepSessions, 'CC')).toMatchObject({
      brokerCode: 'CC',
      fromDate: '2026-09-17',
      toDate: '2026-09-18',
      fromNetLots: 17_500,
      toNetLots: -15_600,
      reversed: true,
    });
    expect(latestObservedReversal(rows, sepSessions, 'AZ')).toMatchObject({
      brokerCode: 'AZ',
      fromDate: '2026-09-22',
      toDate: '2026-09-23',
      fromNetLots: 3_500,
      toNetLots: -3_400,
      reversed: true,
    });

    const augSessions = marketSessions.filter(
      (session) => session.date >= '2026-08-14' && session.date <= '2026-08-24',
    );
    expect(latestObservedReversal(rows, augSessions, 'CC')).toMatchObject({
      fromDate: '2026-08-21',
      toDate: '2026-08-24',
      fromNetLots: -1_700,
      toNetLots: 12_000,
      reversed: true,
    });
    expect(latestObservedReversal(rows, augSessions, 'AZ')).toMatchObject({
      fromDate: '2026-08-20',
      toDate: '2026-08-21',
      fromNetLots: -84,
      toNetLots: 12_700,
      reversed: true,
    });
  });

  it('treats a missing session between two captures as breaking adjacency', () => {
    const fixtureSessions = [
      makeSession('2026-08-19'),
      makeSession('2026-08-20', 'missing'),
      makeSession('2026-08-21'),
    ];
    const fixtureRows = [
      makeRow('2026-08-19', 'ZZ', 'buy', 100),
      makeRow('2026-08-20', 'ZZ', 'sell', 50),
      makeRow('2026-08-21', 'ZZ', 'buy', 70),
    ];
    expect(latestObservedReversal(fixtureRows, fixtureSessions, 'ZZ')).toBeNull();
  });

  it('skips same-sign pairs in favour of the most recent opposite-sign pair', () => {
    const fixtureSessions = [
      makeSession('2026-08-19'),
      makeSession('2026-08-20'),
      makeSession('2026-08-21'),
      makeSession('2026-08-24'),
    ];
    const fixtureRows = [
      makeRow('2026-08-19', 'ZZ', 'buy', 100),
      makeRow('2026-08-20', 'ZZ', 'buy', 200),
      makeRow('2026-08-21', 'ZZ', 'sell', 300),
      makeRow('2026-08-24', 'ZZ', 'sell', 400),
    ];
    expect(latestObservedReversal(fixtureRows, fixtureSessions, 'ZZ')).toMatchObject({
      brokerCode: 'ZZ',
      fromDate: '2026-08-20',
      toDate: '2026-08-21',
      fromNetLots: 200,
      toNetLots: -300,
      changeLots: -500,
      reversed: true,
    });
  });

  it('requires the broker to be visible on both sessions with non-zero opposite signs', () => {
    const fixtureSessions = [makeSession('2026-08-19'), makeSession('2026-08-20')];
    expect(latestObservedReversal([], fixtureSessions, 'ZZ')).toBeNull();
    expect(latestObservedReversal([makeRow('2026-08-19', 'ZZ', 'buy', 100)], fixtureSessions, 'ZZ')).toBeNull();
    const sameSign = [makeRow('2026-08-19', 'ZZ', 'buy', 100), makeRow('2026-08-20', 'ZZ', 'buy', 100)];
    expect(latestObservedReversal(sameSign, fixtureSessions, 'ZZ')).toBeNull();
    const oneZero = [makeRow('2026-08-19', 'ZZ', 'buy', 100), makeRow('2026-08-20', 'ZZ', 'sell', 0)];
    expect(latestObservedReversal(oneZero, fixtureSessions, 'ZZ')).toBeNull();
  });
});

function makeSession(date: string, status: SessionSummary['status'] = 'captured'): SessionSummary {
  return { date, ticker: 'SINI', status, reason: '', rowCounts: { buy: 0, sell: 0 } };
}

function makeRow(
  date: string,
  brokerCode: string,
  side: NormalizedBrokerRow['side'],
  netLots: number,
): NormalizedBrokerRow {
  return {
    id: `TEST-${date}-${brokerCode}-${side}`,
    ticker: 'SINI',
    date,
    side,
    rank: 1,
    brokerCode,
    netLots,
    netValueIdr: netLots * 100_000,
    source: {
      sourceFile: 'test',
      sourceLine: 1,
      rawDate: date,
      rawTicker: 'SINI',
      rawSide: side,
      rawRank: '1',
      rawBroker: brokerCode,
      rawLots: String(netLots),
      rawValueIdr: String(netLots * 100_000),
    },
  };
}

describe('one-broker Unknown override', () => {
  it('moves TP from institution-facing to Unknown without changing residual', () => {
    const base = cumulativeGroupNet(rows, brokers, cleanWindow);
    const override = cumulativeGroupNet(rows, brokers, cleanWindow, withOneBrokerUnknownOverride(undefined, 'TP'));
    expect(base.institution_facing).toBe(181_305);
    expect(override.institution_facing).toBe(140_122);
    expect(override.unknown).toBe(41_183);
    expect(override.residual).toBe(base.residual);
  });
});
