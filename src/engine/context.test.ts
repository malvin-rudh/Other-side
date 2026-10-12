import { describe, expect, it } from 'vitest';
import {
  computeContextKey,
  createRequestId,
  isCurrentResponse,
  type AnalyticalContext,
} from './context';

function makeContext(overrides: Partial<AnalyticalContext> = {}): AnalyticalContext {
  return {
    ticker: 'SINI',
    selectedSessionDate: '2026-09-23',
    cutoffAt: '2026-09-24T00:00:00+07:00',
    periodStart: '2026-08-14',
    periodEnd: '2026-09-23',
    scenario: 'default',
    locale: 'en',
    dataVersion: 'unavailable',
    taxonomyVersion: 'unavailable',
    claimVersion: 'unavailable',
    ...overrides,
  };
}

describe('computeContextKey', () => {
  it('is deterministic for identical input', () => {
    const a = computeContextKey(makeContext());
    const b = computeContextKey(makeContext());
    expect(a).toBe(b);
  });

  it('encodes ticker, session, cutoff, period, scenario, locale and versions', () => {
    const base = computeContextKey(makeContext());
    expect(base).toContain('SINI');
    expect(base).toContain('2026-09-23');
    expect(base).toContain('default');
    expect(base).toContain('unavailable');

    expect(computeContextKey(makeContext({ locale: 'id' }))).not.toBe(base);
    expect(computeContextKey(makeContext({ scenario: 'alt' }))).not.toBe(base);
    expect(computeContextKey(makeContext({ dataVersion: 'v1' }))).not.toBe(base);
    expect(computeContextKey(makeContext({ selectedSessionDate: null }))).not.toBe(base);
  });

  it('serialises null fields deterministically', () => {
    const key = computeContextKey(
      makeContext({ selectedSessionDate: null, cutoffAt: null, periodStart: null, periodEnd: null }),
    );
    expect(key).toBe(
      ['SINI', 'none', 'none', 'none..none', 'default', 'en', 'unavailable', 'unavailable', 'unavailable'].join(
        '|',
      ),
    );
  });
});

describe('createRequestId', () => {
  it('returns unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRequestId()));
    expect(ids.size).toBe(200);
  });
});

describe('isCurrentResponse', () => {
  const key = computeContextKey(makeContext());
  const request1 = createRequestId();
  const request2 = createRequestId();

  it('accepts a response matching context key and latest request id', () => {
    expect(isCurrentResponse(key, request1, { contextKey: key, requestId: request1 })).toBe(true);
  });

  it('rejects a response built for an older context', () => {
    const oldKey = computeContextKey(makeContext({ selectedSessionDate: '2026-09-22' }));
    expect(isCurrentResponse(key, request1, { contextKey: oldKey, requestId: request1 })).toBe(
      false,
    );
  });

  it('rejects an older request that arrives after a newer one in the same context', () => {
    // request1 was superseded by request2; a late arrival of request1 must be dropped
    // even though its context key still matches.
    expect(isCurrentResponse(key, request2, { contextKey: key, requestId: request1 })).toBe(false);
  });

  it('rejects a response matching the request id but not the context', () => {
    const otherKey = computeContextKey(makeContext({ locale: 'id' }));
    expect(isCurrentResponse(otherKey, request1, { contextKey: key, requestId: request1 })).toBe(
      false,
    );
  });
});
