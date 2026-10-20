import { describe, expect, it } from 'vitest';
import brokers from '../../public/data/brokers.json';
import events from '../../public/data/sini/events.json';
import rows from '../../public/data/sini/rows.json';
import sessions from '../../public/data/sini/sessions.json';
import type { PublicData } from '../data/publicData';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import type { FactsContext } from './facts';
import { buildStockView } from './stockView';

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

describe('buildStockView at the 24 Aug replay cutoff', () => {
  const view = buildStockView(context(), data);

  it('clamps the effective window to the last eligible session', () => {
    expect(view.effectiveWindow).toEqual({ start: '2026-08-14', end: '2026-08-24' });
    expect(view.selectedSessionDate).toBe('2026-08-24');
  });

  it('shows the selected-session price reference in the header', () => {
    expect(view.headerProxy.display).toBe(8777);
    expect(view.headerProxy.date).toBe('2026-08-24');
    expect(view.headerProxy.factId).toMatch(/^F-SINI-C11-20260821-20260824-/);
  });

  it('feeds the proxy chart only captured sessions through 24 Aug', () => {
    expect(view.proxyPoints.map((point) => point.date)).toEqual([
      '2026-08-14',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
    ]);
    expect(view.proxyPoints.every((point) => point.date <= '2026-08-24')).toBe(true);
    expect(view.proxyPoints.filter((point) => point.display !== null).length).toBeGreaterThan(0);
  });

  it('feeds the cumulative chart the same six sessions', () => {
    expect(view.cumulativePoints.map((point) => point.date)).toEqual([
      '2026-08-14',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
    ]);
  });

  it('agrees between the cumulative chart endpoint and the group-net facts', () => {
    const last = view.cumulativePoints[view.cumulativePoints.length - 1];
    const lotsByGroup = new Map(view.flow.groups.map((group) => [group.group, group.lots]));
    expect(last?.appFacing).toBe(lotsByGroup.get('app_facing'));
    expect(last?.institutionFacing).toBe(lotsByGroup.get('institution_facing'));
    expect(last?.otherMixed).toBe(lotsByGroup.get('other_mixed'));
    expect(last?.unknown).toBe(lotsByGroup.get('unknown'));
    expect(lotsByGroup.get('app_facing')).toBe(-57539);
  });

  it('lists only events published by the cutoff, split by layer', () => {
    expect(view.story.map((event) => event.id)).toEqual([
      'E-SINI-0525-RIGHTS-PLAN',
      'E-SINI-0722-RIGHTS-DONE',
    ]);
    expect(view.health.map((event) => event.id)).toEqual([
      'E-SINI-0707-SUSPENSION-LIFTED',
      'E-SINI-0820-H1',
      'E-SINI-0821-EQUITY',
    ]);
    const visible = [...view.story, ...view.health];
    expect(visible.some((event) => event.id === 'E-SINI-0831-BOARD-EXIT')).toBe(false);
    expect(visible.some((event) => event.id === 'E-SINI-0903-ATH')).toBe(false);
    for (const event of visible) {
      expect(event.text.length).toBeGreaterThan(0);
      expect(event.sourceUrl.startsWith('https://')).toBe(true);
    }
  });

  it('renders only available card claims with wording, strength and reason', () => {
    const claimIds = [
      ...view.card.observed,
      ...view.card.interpretation,
      ...view.card.unknown,
    ].map((claim) => claim.claimId);
    expect(claimIds).toContain('CL-OBS-C12');
    expect(claimIds).not.toContain('CL-OBS-C13');
    for (const claim of [...view.card.observed, ...view.card.interpretation, ...view.card.unknown]) {
      expect(claim.wording.length).toBeGreaterThan(0);
      expect(claim.reason.length).toBeGreaterThan(0);
      expect(['Strong', 'Moderate', 'Weak', 'Not enough data']).toContain(claim.strength);
    }
  });

  it('keeps the same claims and availability across locales', () => {
    const zhView = buildStockView(context({ locale: 'zh-CN' }), data);
    const enClaims = [...view.card.observed, ...view.card.interpretation, ...view.card.unknown].map((claim) => [
      claim.claimId,
      claim.strength,
    ]);
    const idClaims = [...zhView.card.observed, ...zhView.card.interpretation, ...zhView.card.unknown].map(
      (claim) => [claim.claimId, claim.strength],
    );
    expect(idClaims).toEqual(enClaims);
    expect(zhView.card.observed[0]?.wording).not.toBe(view.card.observed[0]?.wording);
  });

  it('exposes flow rankings with their fact IDs', () => {
    expect(view.flow.available).toBe(true);
    for (const entry of view.flow.topBuyers) {
      expect(entry.factId).toMatch(/^F-SINI-C08-/);
      expect(entry.netLots).toBeGreaterThan(0);
    }
    for (const entry of view.flow.topSellers) {
      expect(entry.factId).toMatch(/^F-SINI-C09-/);
    }
  });
});

describe('O-Side card value slots', () => {
  const view = buildStockView(context(), data);

  function allClaims(cardView: typeof view.card) {
    return [...cardView.observed, ...cardView.interpretation, ...cardView.unknown];
  }

  it('fills C04 with direction, compact lots and window dates at 24 Aug', () => {
    const claim = view.card.observed.find((entry) => entry.claimId === 'CL-OBS-C04');
    expect(claim).toBeDefined();
    const values = claim!.parts.filter((part) => part.kind === 'value');
    expect(values.map((part) => part.text)).toEqual(['net sellers', '57.5k', '14 Aug', '24 Aug']);
    expect(values.map((part) => part.tone)).toEqual(['sell', 'sell', 'neutral', 'neutral']);
    expect(values.every((part) => part.factId === 'F-SINI-C04-20260814-20260824-baseline')).toBe(true);
  });

  it('renders C12 streak dates, C11 session prices and C10 window price', () => {
    const c12 = view.card.observed.find((entry) => entry.claimId === 'CL-OBS-C12');
    expect(c12?.parts.filter((part) => part.kind === 'value').map((part) => part.text)).toEqual(['18 Aug', '24 Aug']);
    const c11 = view.card.interpretation.find((entry) => entry.claimId === 'CL-INT-C11');
    expect(c11?.parts.filter((part) => part.kind === 'value').map((part) => part.text)).toEqual([
      'Rp7,994',
      'Rp8,777',
      '21 Aug',
      '24 Aug',
    ]);
    const c10 = view.card.observed.find((entry) => entry.claimId === 'CL-OBS-C10');
    expect(c10?.parts.filter((part) => part.kind === 'value').map((part) => part.text)).toEqual(['Rp8,220']);
    expect(c10?.wording).toBe('The window average net-flow implied price reference is about Rp8,220.');
  });

  it('fills C18 with the broker and baseline-to-overridden institution lots', () => {
    const c18 = view.card.interpretation.find((entry) => entry.claimId === 'CL-INT-C18');
    expect(c18).toBeDefined();
    const values = c18!.parts.filter((part) => part.kind === 'value');
    expect(values.map((part) => part.text)).toEqual(['ZP', '17.6k', '8.5k']);
  });

  it('words the unknown items with dates and gates the missing item on capture', () => {
    const c01 = view.card.unknown.find((entry) => entry.claimId === 'CL-UNK-C01');
    expect(c01?.parts.filter((part) => part.kind === 'value').map((part) => part.text)).toEqual(['13 Aug']);
    expect(c01?.wording).toBe('13 Aug is excluded: overlapping screenshots put the same brokers on both sides.');
    expect(view.card.unknown.find((entry) => entry.claimId === 'CL-UNK-C03')).toBeUndefined();
    const c24 = view.card.unknown.find((entry) => entry.claimId === 'CL-UNK-C24');
    expect(c24?.wording).toBe('Who the end clients are, and whether they still hold the shares.');
    expect(c24?.parts.every((part) => part.kind === 'text')).toBe(true);
  });

  it('shows CC reversal lots with explicit signs and per-value tones', () => {
    const claim = view.card.observed.find((entry) => entry.claimId === 'CL-OBS-C16');
    expect(claim).toBeDefined();
    const values = claim!.parts.filter((part) => part.kind === 'value');
    expect(values.map((part) => part.text)).toEqual(['\u22121,700', '21 Aug', '+12,000', '24 Aug']);
    expect(values.map((part) => part.tone)).toEqual(['sell', 'neutral', 'buy', 'neutral']);
  });

  it('keeps parts, fact IDs and tones identical across locales while localising the text', () => {
    const zhView = buildStockView(context({ locale: 'zh-CN' }), data);
    for (const enClaim of allClaims(view.card)) {
      const idClaim = allClaims(zhView.card).find((entry) => entry.claimId === enClaim.claimId);
      expect(idClaim, enClaim.claimId).toBeDefined();
      expect(
        idClaim!.parts.map((part) => [part.kind, part.factId, part.tone]),
        enClaim.claimId,
      ).toEqual(enClaim.parts.map((part) => [part.kind, part.factId, part.tone]));
    }
    const c04Zh = zhView.card.observed.find((entry) => entry.claimId === 'CL-OBS-C04')!;
    expect(c04Zh.parts.filter((part) => part.kind === 'value').map((part) => part.text)).toEqual([
      '净卖出',
      '5.75万',
      '8月14日',
      '8月24日',
    ]);
    const c18Zh = zhView.card.interpretation.find((entry) => entry.claimId === 'CL-INT-C18')!;
    expect(c18Zh.parts.filter((part) => part.kind === 'value').map((part) => part.text)).toEqual(['ZP', '1.76万', '8,499']);
    const c01Zh = zhView.card.unknown.find((entry) => entry.claimId === 'CL-UNK-C01')!;
    expect(c01Zh.wording).toBe('8月13日 被排除：重叠的截图使相同的券商同时出现在两侧。');
  });

  it('joins parts back to the plain wording and gives every value a fact ID', () => {
    for (const claim of allClaims(view.card)) {
      expect(claim.parts.map((part) => part.text).join(''), claim.claimId).toBe(claim.wording);
      for (const part of claim.parts) {
        if (part.kind === 'value') expect(part.factId, claim.claimId).toMatch(/^F-SINI-/);
      }
    }
  });
});

describe('O-Side card claim priority', () => {
  const view = buildStockView(context(), data);

  it('orders the sections C12, C04, C05 first so the three-claim cap keeps them visible', () => {
    expect(view.card.observed.map((claim) => claim.claimId).slice(0, 3)).toEqual([
      'CL-OBS-C12',
      'CL-OBS-C04',
      'CL-OBS-C05',
    ]);
    expect(view.card.observed).toHaveLength(12);
    expect(view.card.interpretation[0]?.claimId).toBe('CL-INT-C11');
  });
});

describe('buildStockView at the full-window 23 Sep cutoff', () => {
  const view = buildStockView(
    context({ sessionDate: '2026-09-23', cutoffAt: SEP23_CUTOFF }),
    data,
  );

  it('covers all 26 captured sessions and shows the 8 Sep gap as a null point', () => {
    expect(view.effectiveWindow).toEqual({ start: '2026-08-14', end: '2026-09-23' });
    expect(view.proxyPoints).toHaveLength(27);
    expect(view.cumulativePoints).toHaveLength(27);
    expect(view.proxyPoints.filter((point) => point.display !== null)).toHaveLength(26);
    expect(view.proxyPoints.find((point) => point.date === '2026-09-08')?.display).toBeNull();
    const gap = view.cumulativePoints.find((point) => point.date === '2026-09-08');
    expect(gap).toMatchObject({ appFacing: null, institutionFacing: null, otherMixed: null, unknown: null });
    expect(view.proxyPoints[view.proxyPoints.length - 1]?.date).toBe('2026-09-23');
    expect(view.headerProxy.display).toBe(17873);
    expect(view.headerProxy.date).toBe('2026-09-23');
  });

  it('lists all three unknown items across the full window', () => {
    expect(view.card.unknown.map((claim) => claim.claimId)).toEqual(['CL-UNK-C01', 'CL-UNK-C03', 'CL-UNK-C24']);
    const c03 = view.card.unknown.find((entry) => entry.claimId === 'CL-UNK-C03');
    expect(c03?.parts.filter((part) => part.kind === 'value').map((part) => part.text)).toHaveLength(1);
    expect(c03?.wording).toMatch(/^8 Sep(t)? was not captured, so its flows are unknown, not zero\.$/);
  });

  it('fills C18 with TP at the full window', () => {
    const c18 = view.card.interpretation.find((entry) => entry.claimId === 'CL-INT-C18');
    expect(c18?.parts.filter((part) => part.kind === 'value').map((part) => part.text)).toEqual(['TP', '181.3k', '140.1k']);
  });

  it('includes the 31 Aug board exit and the September event', () => {
    const storyIds = view.story.map((event) => event.id);
    expect(storyIds).toContain('E-SINI-0831-BOARD-EXIT');
    expect(storyIds).toContain('E-SINI-0903-ATH');
  });
});

describe('buildStockView changed strip (C25)', () => {
  it('names both sessions and caps the strip at three moves for 24 Aug', () => {
    const view = buildStockView(context(), data);
    expect(view.changed).not.toBeNull();
    expect(view.changed?.fromDate).toBe('2026-08-21');
    expect(view.changed?.toDate).toBe('2026-08-24');
    const moves = view.changed?.moves ?? [];
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(3);
    for (const move of moves) {
      expect(move.fromLots).not.toBe(move.toLots);
    }
    const deltas = moves.map((move) => Math.abs(move.toLots - move.fromLots));
    expect([...deltas].sort((a, b) => b - a)).toEqual(deltas);
  });

  it('compares 18 Aug against 14 Aug across the holiday gap', () => {
    const view = buildStockView(
      context({ sessionDate: '2026-08-18', cutoffAt: '2026-08-19T00:00:00+07:00' }),
      data,
    );
    expect(view.changed).not.toBeNull();
    expect(view.changed?.fromDate).toBe('2026-08-14');
    expect(view.changed?.toDate).toBe('2026-08-18');
  });

  it('is null at the first captured session, where nothing can be compared', () => {
    const view = buildStockView(
      context({ sessionDate: '2026-08-14', cutoffAt: '2026-08-15T00:00:00+07:00' }),
      data,
    );
    expect(view.changed).toBeNull();
  });
});

