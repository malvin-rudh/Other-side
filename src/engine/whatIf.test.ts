import { describe, expect, it } from 'vitest';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { buildFacts, factByKey, type FactsContext } from './facts';
import { sessionAvailableAt } from './predicates';
import { WHAT_IF_PREFIX, buildWhatIfView, whatIfBrokerCode } from './whatIf';

const data = {
  rows: rows.rows as NormalizedBrokerRow[],
  sessions: sessions.sessions as SessionSummary[],
  brokers: brokers.brokers as BrokerProfile[],
  events: events.events as SiniEvent[],
};

function ctx(sessionDate: string): FactsContext {
  return {
    ticker: 'SINI',
    sessionDate,
    cutoffAt: sessionAvailableAt(sessionDate),
    periodStart: '2026-08-14',
    periodEnd: '2026-09-23',
    scenario: 'default',
    locale: 'en',
    dataVersion: sessions.dataVersion,
    taxonomyVersion: brokers.version,
    claimVersion: events.version,
  };
}

describe('whatIfBrokerCode', () => {
  it('parses only prefixed non-empty codes', () => {
    expect(whatIfBrokerCode('default')).toBeNull();
    expect(whatIfBrokerCode(`${WHAT_IF_PREFIX}TP`)).toBe('TP');
    expect(whatIfBrokerCode(`${WHAT_IF_PREFIX}cc`)).toBe('cc');
    expect(whatIfBrokerCode(WHAT_IF_PREFIX)).toBeNull();
    expect(whatIfBrokerCode(`${WHAT_IF_PREFIX}  `)).toBeNull();
    expect(whatIfBrokerCode('unknown-broker:TP:extra')).toBe('TP:extra');
  });
});

describe('buildWhatIfView with TP unclassified at 23 Sep', () => {
  const view = buildWhatIfView('TP', ctx('2026-09-23'), data);

  it('moves TP net flows from institution-facing to unknown, direction remains positive', () => {
    expect(view.brokerCode).toBe('TP');
    expect(view.period).toEqual({ start: '2026-08-14', end: '2026-09-23' });

    const institution = view.groups.find((row) => row.group === 'institution_facing');
    expect(institution).toMatchObject({ before: 181305, after: 140122, direction: 'remains_positive' });

    const unknown = view.groups.find((row) => row.group === 'unknown');
    expect(unknown).toMatchObject({ before: 0, after: 41183, direction: 'from_zero' });
  });

  it('leaves unrelated groups unchanged', () => {
    expect(view.groups.find((row) => row.group === 'app_facing')).toMatchObject({
      before: -151156,
      after: -151156,
      direction: 'unchanged',
    });
  });

  it('diffs approved claims into rendered sentence changes and survivors', () => {
    const wording = view.changed.filter((change) => change.change === 'wording_changed');
    expect(wording.length).toBeGreaterThan(0);
    for (const change of wording) {
      expect(change.before).not.toBeNull();
      expect(change.after).not.toBeNull();
      expect(JSON.stringify(change.before)).not.toBe(JSON.stringify(change.after));
    }
    const c18 = wording.find((change) => change.before?.en.includes('is moved to Unknown'));
    expect(c18).toBeDefined();

    const survivedSentences = view.survived.map((sentence) => sentence.en);
    expect(survivedSentences).toContain(
      'Brokers ranked by visible net-buy lots inside the top-nine-per-side sample.',
    );
    expect(survivedSentences).toContain(
      'Brokers ranked by visible net-sell lots inside the top-nine-per-side sample.',
    );

    const allSentences = [
      ...view.changed.flatMap((change) => [change.before?.en, change.after?.en]),
      ...survivedSentences,
    ];
    for (const sentence of allSentences) {
      expect(sentence).toBeDefined();
      expect(sentence).not.toContain('CL-');
      expect(sentence).not.toContain('the window');
    }
  });

  it('does not mutate the raw rows', () => {
    const before = JSON.stringify(data.rows);
    buildWhatIfView('TP', ctx('2026-09-23'), data);
    expect(JSON.stringify(data.rows)).toBe(before);
  });
});

describe('buildWhatIfView re-evaluates the 24 Aug streak claims', () => {
  const base = ctx('2026-08-24');

  it('C12 passes at baseline and fails when TP is unclassified', () => {
    const before = factByKey(buildFacts(base, data), 'C12');
    const after = factByKey(buildFacts({ ...base, unknownBrokerCodes: ['TP'] }, data), 'C12');
    expect(before?.value?.kind).toBe('streak');
    expect(before?.value?.kind === 'streak' ? before.value.status : null).toBe('passes');
    expect(after?.value?.kind === 'streak' ? after.value.status : null).not.toBe('passes');
  });

  it('surfaces the streak claim as no longer available with a computed break reason', () => {
    const view = buildWhatIfView('TP', base, data);
    const streak = view.changed.find(
      (change) => change.change === 'no_longer_available' && change.before?.en.includes('last five sessions'),
    );
    expect(streak).toBeDefined();
    expect(streak?.after).toBeNull();
    expect(streak?.before?.en).toContain('18 Aug to 24 Aug');
    expect(streak?.reason).toEqual({
      kind: 'streak_break',
      group: 'institution_facing',
      date: '2026-08-20',
      before: 30,
      after: 0,
      brokerCode: 'TP',
    });

    for (const change of view.changed) {
      if (change.change === 'no_longer_available') expect(change.reason).not.toBeNull();
    }
  });
});
