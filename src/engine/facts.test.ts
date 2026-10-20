import { describe, expect, it } from 'vitest';
import brokersDoc from '../../public/data/brokers.json';
import eventsDoc from '../../public/data/sini/events.json';
import rowsDoc from '../../public/data/sini/rows.json';
import sessionsDoc from '../../public/data/sini/sessions.json';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { buildFacts, factByKey, type FactsContext, type FactsData, type FactValue } from './facts';

const rows = rowsDoc.rows as NormalizedBrokerRow[];
const brokers = brokersDoc.brokers as BrokerProfile[];
const sessions = sessionsDoc.sessions as SessionSummary[];
const events = eventsDoc.events as SiniEvent[];
const data: FactsData = { rows, sessions, brokers, events };

const FULL_CUTOFF = '2026-09-24T00:00:00+07:00';
const AUG24_CUTOFF = '2026-08-25T00:00:00+07:00';

function context(overrides: Partial<FactsContext>): FactsContext {
  return {
    ticker: 'SINI',
    sessionDate: '2026-09-23',
    cutoffAt: FULL_CUTOFF,
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

const rowsById = new Map(rows.map((row) => [row.id, row]));
const groupByCode = new Map(brokers.map((broker) => [broker.code, broker.group]));

function groupSum(rowIds: readonly string[], group: string): number {
  return rowIds
    .map((id) => rowsById.get(id))
    .filter((row): row is NormalizedBrokerRow => Boolean(row))
    .filter((row) => groupByCode.get(row.brokerCode) === group)
    .reduce((total, row) => total + (row.side === 'buy' ? row.netLots : -row.netLots), 0);
}

function requireValue(factValue: FactValue | null): FactValue {
  expect(factValue, 'expected an available fact value').not.toBeNull();
  return factValue as FactValue;
}

describe('full-window golden facts', () => {
  const doc = buildFacts(context({}), data);

  it('assigns catalogue keys and fact_id format to every fact', () => {
    expect(doc.facts).toHaveLength(28);
    for (const fact of doc.facts) {
      expect(fact.fact_id).toMatch(/^F-SINI-[A-Z0-9-]+-\d{8}-\d{8}-(baseline|reference)$/);
      expect(fact.period.start <= fact.period.end).toBe(true);
      expect(Date.parse(fact.available_at)).toBeLessThanOrEqual(Date.parse(FULL_CUTOFF));
    }
  });

  it('computes C02 session count and C03 coverage from the session manifest', () => {
    const c02 = requireValue(factByKey(doc, 'C02')?.value ?? null);
    expect(c02.kind === 'integer' && c02.value).toBe(26);

    const c03 = requireValue(factByKey(doc, 'C03')?.value ?? null);
    expect(c03).toMatchObject({
      kind: 'coverage',
      captured: 26,
      expected: 27,
      missingDates: ['2026-09-08'],
      excludedDates: [],
      holidayDates: ['2026-08-17', '2026-08-25'],
    });
  });

  it('computes group nets C04–C07 over the whole window', () => {
    const nets = (key: 'C04' | 'C05' | 'C06' | 'C07') => {
      const value = requireValue(factByKey(doc, key)?.value ?? null);
      expect(value.kind).toBe('group-nets');
      return value.kind === 'group-nets' ? value.nets : null;
    };
    expect(nets('C04')).toMatchObject({ app_facing: -151156, institution_facing: 181305, other_mixed: -116835, unknown: 0, residual: -86686 });
    expect(nets('C05')).toMatchObject({ institution_facing: 181305 });
    expect(nets('C06')).toMatchObject({ other_mixed: -116835, unknown: 0 });
    expect(nets('C07')).toMatchObject({ residual: -86686 });
  });

  it('ranks C08 top buyers and C09 top sellers from visible rows', () => {
    const c08 = requireValue(factByKey(doc, 'C08')?.value ?? null);
    expect(c08.kind === 'ranking' && c08.entries[0]).toEqual({ brokerCode: 'CC', netLots: 70932 });
    const c09 = requireValue(factByKey(doc, 'C09')?.value ?? null);
    expect(c09.kind === 'ranking' && c09.entries[0]).toEqual({ brokerCode: 'XL', netLots: -149629 });
    expect(c09.kind === 'ranking' && c09.entries.map((entry) => entry.brokerCode)).toContain('HP');
  });

  it('keeps numerator and denominator for C10 and the named reference facts', () => {
    const c10 = requireValue(factByKey(doc, 'C10')?.value ?? null);
    expect(c10).toMatchObject({ kind: 'ratio', numerator: 1254678300000, denominator: 98566300, display: 12729 });

    const to2Sep = requireValue(factByKey(doc, 'REF-INST-2SEP')?.value ?? null);
    expect(to2Sep).toMatchObject({ kind: 'ratio', display: 10783 });
    const toCutoff = requireValue(factByKey(doc, 'REF-INST-CUTOFF')?.value ?? null);
    expect(toCutoff).toMatchObject({ kind: 'ratio', display: 13317 });
    const xlSell = requireValue(factByKey(doc, 'REF-XL-SELL')?.value ?? null);
    expect(xlSell).toMatchObject({ kind: 'ratio', display: 12392 });
  });

  it('captures C15 ES selling and C16/C17 September reversals', () => {
    const c15 = requireValue(factByKey(doc, 'C15')?.value ?? null);
    expect(c15).toMatchObject({
      kind: 'daily-broker-nets',
      days: [
        { date: '2026-09-01', netLots: -59500 },
        { date: '2026-09-03', netLots: -22000 },
      ],
    });

    const c16 = requireValue(factByKey(doc, 'C16')?.value ?? null);
    expect(c16.kind === 'reversal' && c16.reversal).toMatchObject({
      brokerCode: 'CC',
      fromDate: '2026-09-17',
      toDate: '2026-09-18',
      fromNetLots: 17500,
      toNetLots: -15600,
      reversed: true,
    });
    const c17 = requireValue(factByKey(doc, 'C17')?.value ?? null);
    expect(c17.kind === 'reversal' && c17.reversal).toMatchObject({
      brokerCode: 'AZ',
      fromDate: '2026-09-22',
      toDate: '2026-09-23',
      fromNetLots: 3500,
      toNetLots: -3400,
      reversed: true,
    });
    for (const key of ['C16', 'C17'] as const) {
      const fact = factByKey(doc, key);
      const pair = fact?.source_sessions ?? [];
      expect(pair.length, key).toBe(2);
      expect(Date.parse(fact!.available_at)).toBeLessThanOrEqual(Date.parse(FULL_CUTOFF));
    }
  });

  it('computes C18 label sensitivity by reclassifying the largest institution-facing broker', () => {
    const c18 = requireValue(factByKey(doc, 'C18')?.value ?? null);
    expect(c18).toMatchObject({
      kind: 'sensitivity',
      brokerCode: 'TP',
      baseline: { institution_facing: 181305, unknown: 0 },
      overridden: { institution_facing: 140122, unknown: 41183 },
    });
  });

  it('exposes the reviewed event facts with publication-date availability', () => {
    const c22 = factByKey(doc, 'C22');
    expect(c22?.available).toBe(true);
    expect(c22?.available_at).toBe('2026-08-31T00:00:00+07:00');
    expect(c22?.source_event_ids).toEqual(['E-SINI-0831-BOARD-EXIT']);
    expect(factByKey(doc, 'C19')?.source_event_ids).toEqual(['E-SINI-0722-RIGHTS-DONE']);
  });
});

describe('24 Aug acceptance view', () => {
  const doc = buildFacts(context({ sessionDate: '2026-08-24', cutoffAt: AUG24_CUTOFF }), data);

  it('passes C12 and fails C13 with the 20 Aug comparison', () => {
    const c12 = requireValue(factByKey(doc, 'C12')?.value ?? null);
    expect(c12).toMatchObject({
      kind: 'streak',
      status: 'passes',
      dates: ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24'],
    });
    const c13 = requireValue(factByKey(doc, 'C13')?.value ?? null);
    expect(c13).toMatchObject({
      kind: 'streak',
      status: 'fails',
      comparison: {
        date: '2026-08-20',
        candidateGroup: 'institution_facing',
        candidateValue: 30,
        otherGroup: 'other_mixed',
        otherValue: 1065,
      },
    });
  });

  it('contains no September dates and nothing published after the cutoff', () => {
    for (const fact of doc.facts) {
      expect(JSON.stringify(fact.value), fact.fact_id).not.toContain('2026-09');
      expect(Date.parse(fact.available_at), fact.fact_id).toBeLessThanOrEqual(Date.parse(AUG24_CUTOFF));
    }
  });

  it('clamps the ranking window to 24 Aug instead of the full window', () => {
    const c08 = factByKey(doc, 'C08');
    expect(c08?.period.end).toBe('2026-08-24');
    const value = requireValue(c08?.value ?? null);
    expect(value.kind === 'ranking' && value.entries.map((entry) => entry.brokerCode)).not.toContain('TP');
  });

  it('marks ES selling and the monitoring-board exit as unavailable', () => {
    const c15 = factByKey(doc, 'C15');
    expect(c15?.available).toBe(false);
    expect(c15?.unavailable_reason?.en).toContain('ES');
    const c22 = factByKey(doc, 'C22');
    expect(c22?.available).toBe(false);
    expect(c22?.value).toBeNull();
  });

  it('keeps CC and AZ reversals inside August with the not-a-round-trip caveat', () => {
    const c16 = requireValue(factByKey(doc, 'C16')?.value ?? null);
    expect(c16.kind === 'reversal' && c16.reversal).toMatchObject({
      brokerCode: 'CC',
      fromDate: '2026-08-21',
      toDate: '2026-08-24',
      fromNetLots: -1700,
      toNetLots: 12000,
      reversed: true,
    });
    const c17 = requireValue(factByKey(doc, 'C17')?.value ?? null);
    expect(c17.kind === 'reversal' && c17.reversal).toMatchObject({
      brokerCode: 'AZ',
      fromDate: '2026-08-20',
      toDate: '2026-08-21',
      fromNetLots: -84,
      toNetLots: 12700,
      reversed: true,
    });
    for (const key of ['C16', 'C17'] as const) {
      const fact = factByKey(doc, key);
      const value = requireValue(fact?.value ?? null);
      expect(value.kind).toBe('reversal');
      if (value.kind !== 'reversal') return;
      expect(value.reversal.fromDate <= '2026-08-24').toBe(true);
      expect(value.reversal.toDate <= '2026-08-24').toBe(true);
      expect(value.reversal.caveat).toContain('not a proven same-client round trip');
    }
  });

  it('marks the 2 Sep institution reference as unavailable before its data exists', () => {
    const ref = factByKey(doc, 'REF-INST-2SEP');
    expect(ref?.available).toBe(false);
    expect(ref?.value).toBeNull();
    expect(ref?.unavailable_reason?.en).toContain('2026-09-02');
  });
});

describe('23 Sep view exposes HP, CC and AZ', () => {
  const doc = buildFacts(context({ sessionDate: '2026-09-23' }), data);

  it('shows HP among visible sellers plus CC and AZ observations', () => {
    const c09 = requireValue(factByKey(doc, 'C09')?.value ?? null);
    expect(c09.kind === 'ranking' && c09.entries.map((entry) => entry.brokerCode)).toContain('HP');
    expect(factByKey(doc, 'C16')?.available).toBe(true);
    expect(factByKey(doc, 'C17')?.available).toBe(true);
  });
});

describe('traceability and bilingual envelope', () => {
  const doc = buildFacts(context({}), data);

  it('recomputes C05 group net and C10 ratio from the listed source rows', () => {
    const c05 = factByKey(doc, 'C05');
    expect(c05).toBeDefined();
    const value = requireValue(c05?.value ?? null);
    expect(value.kind).toBe('group-nets');
    if (value.kind !== 'group-nets') return;
    expect(groupSum(c05?.source_row_ids ?? [], 'institution_facing')).toBe(value.nets.institution_facing);

    const c10 = factByKey(doc, 'C10');
    const listed = (c10?.source_row_ids ?? [])
      .map((id) => rowsById.get(id))
      .filter((row): row is NormalizedBrokerRow => Boolean(row));
    expect(listed.every((row) => row.side === 'buy')).toBe(true);
    expect(listed.reduce((total, row) => total + row.netValueIdr, 0)).toBe(1254678300000);
    expect(listed.reduce((total, row) => total + row.netLots, 0) * 100).toBe(98566300);

    const ref = factByKey(doc, 'REF-INST-CUTOFF');
    const refListed = (ref?.source_row_ids ?? [])
      .map((id) => rowsById.get(id))
      .filter((row): row is NormalizedBrokerRow => Boolean(row));
    expect(refListed.every((row) => row.side === 'buy' && groupByCode.get(row.brokerCode) === 'institution_facing')).toBe(true);
  });

  it('carries bilingual text for approximate, coverage note, reason and unavailability', () => {
    for (const fact of doc.facts) {
      for (const text of [fact.approximate, fact.coverage_note, fact.evidence.reason]) {
        expect(text.en.length, fact.fact_id).toBeGreaterThan(0);
        expect(text.id.length, fact.fact_id).toBeGreaterThan(0);
      }
      if (!fact.available) {
        expect(fact.unavailable_reason?.en.length).toBeGreaterThan(0);
        expect(fact.unavailable_reason?.id.length).toBeGreaterThan(0);
        expect(fact.evidence.strength).toBe('Not enough data');
      }
    }
  });

  it('returns identical fact IDs, signs and values in both locales', () => {
    const idDoc = buildFacts(context({ locale: 'zh-CN' }), data);
    expect(idDoc.facts.map((fact) => fact.fact_id)).toEqual(doc.facts.map((fact) => fact.fact_id));
    for (let index = 0; index < doc.facts.length; index += 1) {
      expect(idDoc.facts[index]?.value).toEqual(doc.facts[index]?.value);
    }
    const c05 = requireValue(factByKey(idDoc, 'C05')?.value ?? null);
    expect(c05.kind === 'group-nets' && c05.nets.institution_facing).toBe(181305);
  });
});

describe('early cutoff', () => {
  it('reports not-enough-data streaks and a one-day window at the first eligible session', () => {
    const doc = buildFacts(context({ sessionDate: '2026-08-14', cutoffAt: '2026-08-15T00:00:00+07:00' }), data);
    expect(factByKey(doc, 'C12')?.available).toBe(false);
    expect(factByKey(doc, 'C13')?.available).toBe(false);
    expect(factByKey(doc, 'C02')?.period.end).toBe('2026-08-14');
    expect(factByKey(doc, 'C08')?.period.end).toBe('2026-08-14');
  });
});
