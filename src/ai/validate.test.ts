import { describe, expect, it } from 'vitest';
import brokersDoc from '../../public/data/brokers.json';
import eventsDoc from '../../public/data/sini/events.json';
import rowsDoc from '../../public/data/sini/rows.json';
import sessionsDoc from '../../public/data/sini/sessions.json';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { createRequestId } from '../engine/context';
import { buildFacts, type FactsContext, type FactsData } from '../engine/facts';
import { buildApprovedClaims, type ApprovedClaimsDocument } from './claims';
import { validateModelResponse, type ModelResponse } from './validate';

const rows = rowsDoc.rows as NormalizedBrokerRow[];
const brokers = brokersDoc.brokers as BrokerProfile[];
const sessions = sessionsDoc.sessions as SessionSummary[];
const events = eventsDoc.events as SiniEvent[];
const data: FactsData = { rows, sessions, brokers, events };

const AUG24_CUTOFF = '2026-08-25T00:00:00+07:00';

function context(overrides: Partial<FactsContext>): FactsContext {
  return {
    ticker: 'SINI',
    sessionDate: '2026-08-24',
    cutoffAt: AUG24_CUTOFF,
    periodStart: '2026-08-14',
    periodEnd: '2026-08-23',
    scenario: 'baseline',
    locale: 'en',
    dataVersion: sessionsDoc.dataVersion,
    taxonomyVersion: 'brokers-team-mapping-v1',
    claimVersion: 'sini-events-reviewed-v1',
    ...overrides,
  };
}

function approvedAt(overrides: Partial<FactsContext> = {}): ApprovedClaimsDocument {
  const ctx = context(overrides);
  return buildApprovedClaims(ctx, buildFacts(ctx, data));
}

const approved = approvedAt();
const requestId = createRequestId();

function makeResponse(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return {
    contextKey: approved.contextKey,
    requestId,
    answer_kind: 'claims',
    claims: [{ claim_id: 'CL-OBS-C12', wording_variant: 'short' }],
    follow_up_ids: ['Q-STREAK'],
    ...overrides,
  };
}

function validate(response: unknown, doc: ApprovedClaimsDocument = approved, cutoffAt: string = AUG24_CUTOFF) {
  return validateModelResponse({
    response,
    expectedContextKey: doc.contextKey,
    latestRequestId: requestId,
    approved: doc,
    cutoffAt,
  });
}

describe('validateModelResponse', () => {
  it('accepts the golden 24 Aug C12 answer', () => {
    const result = validate(makeResponse());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.claims[0]?.claim_id).toBe('CL-OBS-C12');
    }
  });

  it('rejects the C13 wording on 24 Aug because the claim is unavailable', () => {
    const result = validate(makeResponse({ claims: [{ claim_id: 'CL-OBS-C13', wording_variant: 'short' }] }));
    expect(result).toEqual({ ok: false, reason: 'claim not available at this cutoff: CL-OBS-C13' });
  });

  it('rejects unknown claim IDs', () => {
    const result = validate(makeResponse({ claims: [{ claim_id: 'CL-OBS-C99', wording_variant: 'short' }] }));
    expect(result).toEqual({ ok: false, reason: 'unknown claim_id: CL-OBS-C99' });
  });

  it('rejects other-context and stale responses', () => {
    const otherContext = validate(makeResponse({ contextKey: 'SINI|2026-08-24|bogus|x' }));
    expect(otherContext).toEqual({ ok: false, reason: 'stale or other-context response' });
    const stale = validate(makeResponse({ requestId: createRequestId() }));
    expect(stale).toEqual({ ok: false, reason: 'stale or other-context response' });
  });

  it('rejects tampered shapes and answer_kind consistency', () => {
    expect(validate({ ...makeResponse(), injected: true }).ok).toBe(false);
    expect(validate(makeResponse({ answer_kind: 'unavailable' })).ok).toBe(false);
    expect(
      validate(
        makeResponse({
          answer_kind: 'unavailable',
          claims: [],
          follow_up_ids: [],
        }),
      ).ok,
    ).toBe(true);
    expect(
      validate(makeResponse({ claims: [{ claim_id: 'CL-OBS-C12', wording_variant: 'long' as never }] })).ok,
    ).toBe(false);
    expect(validate(makeResponse({ follow_up_ids: ['Q-NOPE'] }))).toEqual({
      ok: false,
      reason: 'unknown follow_up_id: Q-NOPE',
    });
  });

  it('rejects duplicate claim IDs', () => {
    const result = validate(
      makeResponse({
        claims: [
          { claim_id: 'CL-OBS-C12', wording_variant: 'short' },
          { claim_id: 'CL-OBS-C12', wording_variant: 'explained' },
        ],
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'duplicate claim_id: CL-OBS-C12' });
  });

  it('rejects future references when a full-window answer is replayed at 24 Aug', () => {
    const fullWindow = approvedAt({
      sessionDate: '2026-09-23',
      cutoffAt: '2026-09-24T00:00:00+07:00',
      periodEnd: '2026-09-23',
    });
    const result = validate(
      makeResponse({
        contextKey: fullWindow.contextKey,
        claims: [{ claim_id: 'CL-OBS-C02', wording_variant: 'short' }],
        follow_up_ids: [],
      }),
      fullWindow,
      AUG24_CUTOFF,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'claim references a fact not yet available at cutoff: CL-OBS-C02',
    });
  });

  it('applies identically to a saved answer in the zh-CN locale', () => {
    const idDoc = approvedAt({ locale: 'zh-CN' });
    const result = validateModelResponse({
      response: makeResponse({ contextKey: idDoc.contextKey, claims: [{ claim_id: 'CL-OBS-C12', wording_variant: 'explained' }] }),
      expectedContextKey: idDoc.contextKey,
      latestRequestId: requestId,
      approved: idDoc,
      cutoffAt: AUG24_CUTOFF,
    });
    expect(result.ok).toBe(true);
  });
});
