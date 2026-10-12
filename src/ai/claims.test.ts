import { describe, expect, it } from 'vitest';
import brokersDoc from '../../public/data/brokers.json';
import eventsDoc from '../../public/data/sini/events.json';
import rowsDoc from '../../public/data/sini/rows.json';
import sessionsDoc from '../../public/data/sini/sessions.json';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { computeContextKey } from '../engine/context';
import { buildFacts, type FactsContext, type FactsData } from '../engine/facts';
import { buildApprovedClaims, CLAIMS, CLAIMS_BY_ID, THESES } from './claims';
import { CAVEATS, CLAIM_TEMPLATES, CURATED_QUESTIONS } from './templates';

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

function approved(overrides: Partial<FactsContext> = {}) {
  const ctx = context(overrides);
  return buildApprovedClaims(ctx, buildFacts(ctx, data));
}

describe('claim registry integrity', () => {
  it('wires every claim to a template and every template to a claim', () => {
    const claimIds = CLAIMS.map((claim) => claim.claim_id);
    expect(new Set(claimIds).size).toBe(claimIds.length);
    for (const claim of CLAIMS) {
      expect(CLAIM_TEMPLATES[claim.claim_id], claim.claim_id).toBeDefined();
    }
    for (const templateId of Object.keys(CLAIM_TEMPLATES)) {
      expect(CLAIMS_BY_ID.has(templateId), templateId).toBe(true);
    }
  });

  it('keeps both wording variants bilingual and non-empty', () => {
    for (const [id, template] of Object.entries(CLAIM_TEMPLATES)) {
      for (const variant of ['short', 'explained'] as const) {
        expect(template[variant].length, `${id}.${variant}`).toBeGreaterThan(0);
        const hasText = template[variant].some((node) => node.kind === 'text');
        expect(hasText, `${id}.${variant}`).toBe(true);
        for (const node of template[variant]) {
          if (node.kind === 'text') {
            expect(node.text.en.trim().length, `${id}.${variant}.en`).toBeGreaterThan(0);
            expect(node.text.id.trim().length, `${id}.${variant}.id`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('attaches resolvable caveats and thesis wiring to every claim', () => {
    for (const claim of CLAIMS) {
      expect(claim.required_caveats.length, claim.claim_id).toBeGreaterThan(0);
      for (const key of claim.required_caveats) {
        expect(CAVEATS[key].en.length, `${claim.claim_id}.${key}`).toBeGreaterThan(0);
        expect(CAVEATS[key].id.length, `${claim.claim_id}.${key}`).toBeGreaterThan(0);
      }
      if (claim.thesis) {
        expect(THESES[claim.thesis], claim.claim_id).toBeDefined();
      }
    }
    for (const [thesisId, thesis] of Object.entries(THESES)) {
      for (const id of [...thesis.supports, ...thesis.contradicts]) {
        expect(CLAIMS_BY_ID.get(id)?.thesis, `${thesisId}:${id}`).toBe(thesisId);
      }
    }
  });

  it('keeps curated question references inside the registry', () => {
    for (const [questionId, question] of Object.entries(CURATED_QUESTIONS)) {
      expect(question.claim_ids.length, questionId).toBeGreaterThan(0);
      for (const id of [...question.claim_ids, ...question.follow_up_ids]) {
        expect(CLAIMS_BY_ID.has(id) || id in CURATED_QUESTIONS, `${questionId}:${id}`).toBe(true);
      }
      for (const id of question.claim_ids) {
        expect(CLAIMS_BY_ID.has(id), `${questionId}:${id}`).toBe(true);
      }
    }
  });
});

describe('buildApprovedClaims availability', () => {
  it('marks C12 allowed and C13 unavailable on 24 Aug', () => {
    const doc = approved({ sessionDate: '2026-08-24', cutoffAt: AUG24_CUTOFF });
    const byId = new Map(doc.claims.map((claim) => [claim.claim_id, claim]));
    expect(byId.get('CL-OBS-C12')?.available).toBe(true);
    expect(byId.get('CL-OBS-C13')?.available).toBe(false);
    expect(byId.get('CL-SUP-INST-LED')?.available).toBe(true);
    expect(byId.get('CL-CON-INST-LED')?.available).toBe(false);
    expect(byId.get('CL-SUP-APP-SELLING')?.available).toBe(true);
    expect(byId.get('CL-CON-APP-SELLING')?.available).toBe(false);
  });

  it('flips the institution thesis on 23 Sep when the streak fails', () => {
    const doc = approved({});
    const byId = new Map(doc.claims.map((claim) => [claim.claim_id, claim]));
    expect(byId.get('CL-OBS-C12')?.available).toBe(false);
    expect(byId.get('CL-OBS-C13')?.available).toBe(false);
    expect(byId.get('CL-SUP-INST-LED')?.available).toBe(false);
    expect(byId.get('CL-CON-INST-LED')?.available).toBe(true);
  });

  it('keeps claim IDs, predicates and caveats identical across locales', () => {
    const en = approved({ locale: 'en' });
    const id = approved({ locale: 'id' });
    expect(en.claims.map((claim) => claim.claim_id)).toEqual(id.claims.map((claim) => claim.claim_id));
    for (let i = 0; i < en.claims.length; i += 1) {
      const a = en.claims[i]!;
      const b = id.claims[i]!;
      expect(a.predicate).toEqual(b.predicate);
      expect(a.facts).toEqual(b.facts);
      expect(a.required_caveats).toEqual(b.required_caveats);
      expect(a.available).toBe(b.available);
      expect(a.wording.short.id.length).toBeGreaterThan(0);
      expect(a.caveats.every((caveat) => caveat.id.length > 0)).toBe(true);
    }
  });

  it('embeds the deterministic context key and the evaluated facts', () => {
    const ctx = context({ sessionDate: '2026-08-24', cutoffAt: AUG24_CUTOFF });
    const doc = buildApprovedClaims(ctx, buildFacts(ctx, data));
    expect(doc.contextKey).toBe(computeContextKey({ ...ctx, selectedSessionDate: ctx.sessionDate }));
    expect(doc.facts.length).toBe(28);
    expect(doc.claims.every((claim) => claim.wording.short.en.length > 0)).toBe(true);
  });
});
