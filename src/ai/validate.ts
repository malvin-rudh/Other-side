import Ajv from 'ajv';
import { isCurrentResponse } from '../engine/context';
import type { FactKey } from '../engine/facts';
import type { ApprovedClaimsDocument } from './claims';
import type { WordingVariant } from './templates';

export interface ModelClaimRef {
  claim_id: string;
  wording_variant: WordingVariant;
}

export interface ModelResponse {
  contextKey: string;
  requestId: string;
  answer_kind: 'claims' | 'unavailable';
  claims: ModelClaimRef[];
  follow_up_ids: string[];
}

export type ValidationResult = { ok: true; response: ModelResponse } | { ok: false; reason: string };

export const responseSchema = {
  type: 'object',
  required: ['contextKey', 'requestId', 'answer_kind', 'claims', 'follow_up_ids'],
  additionalProperties: false,
  properties: {
    contextKey: { type: 'string' },
    requestId: { type: 'string' },
    answer_kind: { type: 'string', enum: ['claims', 'unavailable'] },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim_id', 'wording_variant'],
        additionalProperties: false,
        properties: {
          claim_id: { type: 'string' },
          wording_variant: { type: 'string', enum: ['short', 'explained'] },
        },
      },
    },
    follow_up_ids: { type: 'array', items: { type: 'string' } },
  },
} as const;

const ajv = new Ajv();
const validateShape = ajv.compile(responseSchema);

export interface ValidateModelResponseInput {
  response: unknown;
  expectedContextKey: string;
  latestRequestId: string;
  approved: ApprovedClaimsDocument;
  cutoffAt: string;
}

export function validateModelResponse(input: ValidateModelResponseInput): ValidationResult {
  if (!validateShape(input.response)) {
    return { ok: false, reason: 'response failed schema validation' };
  }
  const response = input.response as ModelResponse;

  if (response.answer_kind === 'claims' && response.claims.length === 0) {
    return { ok: false, reason: 'claims answer has no claims' };
  }
  if (response.answer_kind === 'unavailable' && response.claims.length > 0) {
    return { ok: false, reason: 'unavailable answer carries claims' };
  }

  if (!isCurrentResponse(input.expectedContextKey, input.latestRequestId, response)) {
    return { ok: false, reason: 'stale or other-context response' };
  }

  const seen = new Set<string>();
  for (const ref of response.claims) {
    if (seen.has(ref.claim_id)) {
      return { ok: false, reason: `duplicate claim_id: ${ref.claim_id}` };
    }
    seen.add(ref.claim_id);

    const claim = input.approved.claims.find((entry) => entry.claim_id === ref.claim_id);
    if (!claim) {
      return { ok: false, reason: `unknown claim_id: ${ref.claim_id}` };
    }
    if (!claim.available) {
      return { ok: false, reason: `claim not available at this cutoff: ${ref.claim_id}` };
    }
    // A requested wording variant must actually be renderable in the locale this
    // context was built for. A variant whose value slots resolved to nothing has
    // null parts, and falling back to template prose would print a sentence with
    // no numbers where the model asked for numbers.
    if (claim.parts[ref.wording_variant][input.approved.context.locale] === null) {
      return {
        ok: false,
        reason: `wording variant ${ref.wording_variant} is not renderable in ${input.approved.context.locale}: ${ref.claim_id}`,
      };
    }
    const future = claim.facts.find((key: FactKey) => factAvailableAfter(key, input.approved, input.cutoffAt));
    if (future) {
      return { ok: false, reason: `claim references a fact not yet available at cutoff: ${ref.claim_id}` };
    }
  }

  for (const followUpId of response.follow_up_ids) {
    if (!(followUpId in input.approved.questions)) {
      return { ok: false, reason: `unknown follow_up_id: ${followUpId}` };
    }
  }

  return { ok: true, response };
}

function factAvailableAfter(key: FactKey, approved: ApprovedClaimsDocument, cutoffAt: string): boolean {
  const fact = approved.facts.find((entry) => entry.key === key);
  if (!fact) return true;
  return Date.parse(fact.available_at) > Date.parse(cutoffAt);
}
