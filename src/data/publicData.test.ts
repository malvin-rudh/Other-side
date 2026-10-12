import { describe, expect, it } from 'vitest';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import validation from '../../public/data/sini/validation.json';
import { isEventAvailableAtCutoff } from './events';
import {
  validateBrokersDocument,
  validateEventsDocument,
  validateRowsDocument,
  validateSessionManifest,
  type BrokerSide,
  type NormalizedBrokerRow,
} from './schemas';

describe('generated public data schemas', () => {
  it('validates rows, sessions, broker profiles and events with Ajv', () => {
    expect(validateRowsDocument(rows)).toBe(true);
    expect(validateRowsDocument.errors).toBeNull();
    expect(validateSessionManifest(sessions)).toBe(true);
    expect(validateSessionManifest.errors).toBeNull();
    expect(validateBrokersDocument(brokers)).toBe(true);
    expect(validateBrokersDocument.errors).toBeNull();
    expect(validateEventsDocument(events)).toBe(true);
    expect(validateEventsDocument.errors).toBeNull();
  });
});

describe('SINI broker rows acceptance counts', () => {
  const acceptedRows = rows.rows as NormalizedBrokerRow[];

  it('keeps the expected raw, quarantined and accepted counts', () => {
    expect(validation.verified).toBe(true);
    expect(validation.counts.raw.bySide).toEqual({ buy: 256, sell: 256 });
    expect(validation.counts.quarantined.bySide).toEqual({ buy: 22, sell: 22 });
    expect(validation.counts.quarantined.total).toBe(44);
    expect(validation.counts.accepted.bySide).toEqual({ buy: 234, sell: 234 });
    expect(validation.counts.accepted.capturedSessions).toBe(26);
    expect(validation.counts.rejected.total).toBe(0);
  });

  it('has no accepted rows from quarantined 13 Aug', () => {
    expect(acceptedRows.some((row) => row.date === '2026-08-13')).toBe(false);
  });

  it('has at most 9 accepted ranks per side per date', () => {
    const byDateSide = new Map<string, NormalizedBrokerRow[]>();
    for (const row of acceptedRows) {
      const key = `${row.date}|${row.side}`;
      byDateSide.set(key, [...(byDateSide.get(key) ?? []), row]);
    }

    for (const [key, groupedRows] of byDateSide) {
      const ranks = new Set(groupedRows.map((row) => row.rank));
      expect(groupedRows.length, key).toBeLessThanOrEqual(9);
      expect(ranks.size, key).toBe(groupedRows.length);
    }
  });

  it('has no accepted broker-day on both sides', () => {
    const sidesByBrokerDay = new Map<string, Set<BrokerSide>>();
    for (const row of acceptedRows) {
      const key = `${row.date}|${row.brokerCode}`;
      const sides = sidesByBrokerDay.get(key) ?? new Set<BrokerSide>();
      sides.add(row.side);
      sidesByBrokerDay.set(key, sides);
    }

    for (const [key, sides] of sidesByBrokerDay) {
      expect([...sides], key).toHaveLength(1);
    }
  });

  it('keeps stable accepted row IDs separate from raw source identity', () => {
    const row = acceptedRows.find((candidate) => candidate.id === 'SINI-20260824-B03');
    expect(row).toBeDefined();
    expect(row?.date).toBe('2026-08-24');
    expect(row?.side).toBe('buy');
    expect(row?.rank).toBe(3);
    expect(row?.source.sourceLine).toBeGreaterThan(0);
    expect(row?.source.rawRank).toBe('3');
  });
});

describe('session manifest statuses', () => {
  const byDate = new Map(sessions.sessions.map((session) => [session.date, session]));

  it('marks missing, holiday and excluded dates explicitly', () => {
    expect(byDate.get('2026-09-08')?.status).toBe('missing');
    expect(byDate.get('2026-08-17')?.status).toBe('holiday');
    expect(byDate.get('2026-08-25')?.status).toBe('holiday');
    expect(byDate.get('2026-08-13')?.status).toBe('excluded');
  });

  it('marks weekends separately from missing sessions', () => {
    expect(byDate.get('2026-08-15')?.status).toBe('weekend');
    expect(byDate.get('2026-09-12')?.status).toBe('weekend');
  });
});

describe('broker profiles', () => {
  const byCode = new Map(brokers.brokers.map((broker) => [broker.code, broker]));

  it('uses the required team mapping and treats YP like every other broker', () => {
    for (const code of ['XL', 'XC', 'YP']) expect(byCode.get(code)?.group).toBe('app_facing');
    for (const code of ['AK', 'BK', 'ZP', 'YU', 'AI', 'DP', 'TP']) {
      expect(byCode.get(code)?.group).toBe('institution_facing');
    }
    expect(byCode.get('YP')?.profileEvidence.strength).toBe('Weak');
    expect(byCode.get('XL')?.profileEvidence.strength).toBe('Moderate');
    expect(byCode.get('XC')?.profileEvidence.strength).toBe('Moderate');
  });

  it('has a reason and basis for every evidence strength', () => {
    for (const broker of brokers.brokers) {
      expect(broker.identityEvidence.strength.length).toBeGreaterThan(0);
      expect(broker.identityEvidence.reason.length).toBeGreaterThan(0);
      expect(broker.identityEvidence.basis.length).toBeGreaterThan(0);
      expect(broker.profileEvidence.strength.length).toBeGreaterThan(0);
      expect(broker.profileEvidence.reason.en.length).toBeGreaterThan(0);
      expect(broker.profileEvidence.reason.id.length).toBeGreaterThan(0);
      expect(broker.profileEvidence.basis.length).toBeGreaterThan(0);
      expect(broker.profileEvidence.sourceReference.length).toBeGreaterThan(0);
      expect(broker.note.en).toContain('does not establish customer identity');
    }
  });
});

describe('events availability', () => {
  it('uses publication date availability, not event/reporting date', () => {
    const event = {
      availableAt: '2026-09-24T00:00:00+07:00',
    };
    expect(isEventAvailableAtCutoff(event, '2026-09-23T23:59:59+07:00')).toBe(false);
    expect(isEventAvailableAtCutoff(event, '2026-09-24T00:00:00+07:00')).toBe(true);
  });

  it('keeps reviewed bilingual text and source URLs on every event', () => {
    for (const event of events.events) {
      expect(event.availableAt).toBe(`${event.publicationDate}T00:00:00+07:00`);
      expect(event.source.url.startsWith('https://')).toBe(true);
      expect(event.text.en.length).toBeGreaterThan(0);
      expect(event.text.id.length).toBeGreaterThan(0);
    }
  });
});
