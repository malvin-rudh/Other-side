// Version of the approved claim and template contract in src/ai/claims.ts and
// src/ai/templates.ts. This is a code-contract version, deliberately separate
// from the broker data, taxonomy and events dataset versions: it changes when
// claim IDs, predicates, wording or thesis wiring change, so saved answer plans
// built against an older contract are rejected even when their claim IDs and the
// underlying data are unchanged.
export const CLAIMS_VERSION = 'other-side-claims-v3';
