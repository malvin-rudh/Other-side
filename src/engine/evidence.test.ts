import { describe, expect, it } from 'vitest';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import type { PublicData } from '../data/publicData';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { buildEvidenceView } from './evidence';
import { buildFacts, factByKey, type FactsContext } from './facts';

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

const AUG24_CUTOFF = '2026-08-25T00:00:00+07:00';
const SEP23_CUTOFF = '2026-09-24T00:00:00+07:00';

const groupByCode = new Map((brokers.brokers as BrokerProfile[]).map((broker) => [broker.code, broker.group]));

function context(overrides: Partial<FactsContext> = {}): FactsContext {
  return {
    ticker: 'SINI',
    sessionDate: '2026-08-24',
    cutoffAt: AUG24_CUTOFF,
    periodStart: '2026-08-14',
    periodEnd: '2026-09-23',
    scenario: 'default',
    locale: 'en',
    dataVersion: sessions.dataVersion,
    taxonomyVersion: brokers.version,
    claimVersion: events.version,
    ...overrides,
  };
}

function factIdFor(ctx: FactsContext, key: 'C04' | 'C08' | 'C10'): string {
  const fact = factByKey(buildFacts(ctx, data), key);
  if (!fact) throw new Error(`missing fact ${key}`);
  return fact.fact_id;
}

describe('buildEvidenceView at the 24 Aug replay cutoff', () => {
  const ctx = context();

  it('resolves every rendered fact id to a view whose rows match source_row_ids in order', () => {
    const document = buildFacts(ctx, data);
    const rendered = document.facts.filter((fact) => fact.available && fact.source_row_ids.length > 0);
    expect(rendered.length).toBeGreaterThan(0);
    for (const fact of rendered) {
      const view = buildEvidenceView(fact.fact_id, ctx, data, 'en');
      expect(view).not.toBeNull();
      expect(view!.factId).toBe(fact.fact_id);
      expect(view!.rows.map((row) => row.id)).toEqual(fact.source_row_ids);
      expect(view!.parsedTotals).not.toBeNull();
    }
  });

  it('ties the C10 parsed totals to the ratio numerator and denominator', () => {
    const document = buildFacts(ctx, data);
    const c10 = factByKey(document, 'C10');
    expect(c10?.value?.kind).toBe('ratio');
    if (c10?.value?.kind !== 'ratio') return;

    const view = buildEvidenceView(c10.fact_id, ctx, data, 'en');
    expect(view).not.toBeNull();
    const totals = view!.parsedTotals;
    expect(totals?.kind).toBe('sums');
    if (totals?.kind !== 'sums') return;
    expect(totals.valueIdr).toBe(c10.value.numerator);
    expect(totals.lots * 100).toBe(c10.value.denominator);
  });

  it('drawer totals equal the card value for C04 app-facing net lots', () => {
    const document = buildFacts(ctx, data);
    const c04 = factByKey(document, 'C04');
    if (!c04 || c04.value?.kind !== 'group-nets') throw new Error('missing C04 group nets');

    const view = buildEvidenceView(c04.fact_id, ctx, data, 'en');
    const totals = view!.parsedTotals;
    expect(totals?.kind).toBe('sums');
    if (totals?.kind !== 'sums') return;
    expect(totals.lots).toBe(c04.value.nets.app_facing);
    expect(totals.lots).toBe(-57539);
    for (const row of view!.rows) {
      expect(groupByCode.get(row.brokerCode)).toBe('app_facing');
    }
  });

  it('lists only ranked brokers for C08 and ties totals to the ranking entries', () => {
    const document = buildFacts(ctx, data);
    const c08 = factByKey(document, 'C08');
    if (!c08 || c08.value?.kind !== 'ranking') throw new Error('missing C08 ranking');

    const view = buildEvidenceView(c08.fact_id, ctx, data, 'en');
    const totals = view!.parsedTotals;
    expect(totals?.kind).toBe('sums');
    if (totals?.kind !== 'sums') return;

    const rankedCodes = new Set(c08.value.entries.map((entry) => entry.brokerCode));
    expect(view!.rows.length).toBeGreaterThan(0);
    for (const row of view!.rows) {
      expect(rankedCodes.has(row.brokerCode), row.brokerCode).toBe(true);
    }

    const perBroker = new Map<string, number>();
    for (const row of view!.rows) {
      const signed = row.side === 'buy' ? row.netLots : -row.netLots;
      perBroker.set(row.brokerCode, (perBroker.get(row.brokerCode) ?? 0) + signed);
    }
    for (const entry of c08.value.entries) {
      expect(perBroker.get(entry.brokerCode)).toBe(entry.netLots);
    }
    const entrySum = c08.value.entries.reduce((total, entry) => total + entry.netLots, 0);
    expect(totals.lots).toBe(entrySum);
  });

  it('attaches the matching approved claims and keeps raw labels intact', () => {
    const c04Id = factIdFor(ctx, 'C04');
    const view = buildEvidenceView(c04Id, ctx, data, 'en');
    expect(view!.claims.map((claim) => claim.claimId)).toContain('CL-OBS-C04');
    for (const row of view!.rows) {
      expect(row.rawLabel.length).toBeGreaterThan(0);
      expect(row.rawLabel).toContain('·');
    }
  });

  it('returns null for an unknown fact id', () => {
    expect(buildEvidenceView('F-SINI-NOPE-20260814-20260824-baseline', ctx, data, 'en')).toBeNull();
  });
});

describe('buildEvidenceView over the full clean window', () => {
  const ctx = context({ sessionDate: '2026-09-23', cutoffAt: SEP23_CUTOFF });

  it('names the not-captured 8 Sep session as an exclusion inside the window', () => {
    const c04Id = factIdFor(ctx, 'C04');
    const view = buildEvidenceView(c04Id, ctx, data, 'en');
    expect(view!.period).toEqual({ start: '2026-08-14', end: '2026-09-23' });
    const missing = view!.exclusions.filter((exclusion) => exclusion.status === 'missing');
    expect(missing.map((exclusion) => exclusion.date)).toContain('2026-09-08');
    expect(view!.exclusions.some((exclusion) => exclusion.date === '2026-08-13')).toBe(false);
  });
});

describe('drawer totals equal card values at both cutoffs', () => {
  const cutoffCases = [
    { label: '24 Aug', sessionDate: '2026-08-24', cutoffAt: AUG24_CUTOFF },
    { label: '23 Sep', sessionDate: '2026-09-23', cutoffAt: SEP23_CUTOFF },
  ];

  for (const cutoffCase of cutoffCases) {
    const ctx = context({ sessionDate: cutoffCase.sessionDate, cutoffAt: cutoffCase.cutoffAt });

    it(`ties C04, C05 and C10 totals to the card values at ${cutoffCase.label}`, () => {
      const document = buildFacts(ctx, data);
      const focusByKey = { C04: 'app_facing', C05: 'institution_facing' } as const;
      for (const key of ['C04', 'C05'] as const) {
        const fact = factByKey(document, key);
        if (!fact || fact.value?.kind !== 'group-nets') throw new Error(`missing ${key} group nets`);
        const view = buildEvidenceView(fact.fact_id, ctx, data, 'en');
        const totals = view!.parsedTotals;
        expect(totals?.kind).toBe('sums');
        if (totals?.kind !== 'sums') return;
        expect(totals.lots, key).toBe(fact.value.nets[focusByKey[key]]);
      }

      const c10 = factByKey(document, 'C10');
      if (!c10 || c10.value?.kind !== 'ratio') throw new Error('missing C10 ratio');
      const view = buildEvidenceView(c10.fact_id, ctx, data, 'en');
      const totals = view!.parsedTotals;
      expect(totals?.kind).toBe('sums');
      if (totals?.kind !== 'sums') return;
      expect(totals.valueIdr).toBe(c10.value.numerator);
      expect(totals.lots * 100).toBe(c10.value.denominator);
    });
  }
});
