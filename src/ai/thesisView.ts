import type { ApprovedClaim, ApprovedClaimsDocument, RenderedPart } from './claims';
import { pickText } from '../engine/facts';
import type { Locale } from '../engine/context';

// Window-result and recency-qualifier IDs live with the claim registry;
// re-exported here for the renderer.
export { NON_BUCKET_CLAIM_IDS } from './claims';

export type ThesisBucketKey = 'supports' | 'contradicts' | 'unknown';

export interface ThesisItemView {
  claimId: string;
  parts: RenderedPart[];
  factId: string | null;
  evaluable: boolean;
  caveats: string[];
}

export interface ThesisView {
  thesisId: string;
  supports: ThesisItemView[];
  contradicts: ThesisItemView[];
  unknown: ThesisItemView[];
  // The concise lead answer to the cumulative-flow question for theses that
  // define one: net buying, net selling, flat, or unavailable. Computed locally
  // so it renders identically in rule-based, saved and live modes.
  windowNet: ThesisItemView | null;
  // The recency qualifier for theses that define one (currently the institution
  // net-buying thesis). Computed locally from the streak fact, so it renders the
  // same in rule-based, saved and live modes and never enters a bucket.
  streak: ThesisItemView | null;
  caveats: string[];
}

export const THESIS_IDS = ['T-INST-LED', 'T-HP-SMART', 'T-PRICE-PROOF'] as const;

export const THESIS_QUESTION_ID: Record<string, string> = {
  'T-INST-LED': 'Q-THESIS-INST',
  'T-HP-SMART': 'Q-THESIS-HP',
  'T-PRICE-PROOF': 'Q-THESIS-PRICE',
};

export function buildThesisView(
  approved: ApprovedClaimsDocument,
  thesisId: string,
  locale: Locale,
): ThesisView | null {
  const thesis = approved.theses[thesisId];
  if (!thesis) return null;
  const byId = new Map(approved.claims.map((claim) => [claim.claim_id, claim]));
  const factIdOf = (claim: ApprovedClaim): string | null => {
    const key = claim.facts[0];
    if (!key) return null;
    const fact = approved.facts.find((entry) => entry.key === key);
    return fact?.available ? (fact.fact_id ?? null) : null;
  };
  const evaluableItem = (claim: ApprovedClaim): ThesisItemView => ({
    claimId: claim.claim_id,
    parts: claim.parts.explained[locale] ?? [{ kind: 'text', text: pickText(claim.wording.explained, locale) }],
    factId: factIdOf(claim),
    evaluable: true,
    caveats: claim.caveats.map((caveat) => pickText(caveat, locale)),
  });
  const unevaluableItem = (claim: ApprovedClaim): ThesisItemView => ({
    claimId: claim.claim_id,
    parts: [{ kind: 'text', text: pickText(claim.wording.short, locale) }],
    factId: null,
    evaluable: false,
    caveats: claim.caveats.map((caveat) => pickText(caveat, locale)),
  });

  const depsAvailable = (claim: ApprovedClaim): boolean =>
    claim.facts.every((key) => approved.facts.find((fact) => fact.key === key)?.available === true);

  const supports: ThesisItemView[] = [];
  const contradicts: ThesisItemView[] = [];
  const unknown: ThesisItemView[] = [];

  for (const id of thesis.supports) {
    const claim = byId.get(id);
    if (!claim) continue;
    if (claim.available) supports.push(evaluableItem(claim));
    else if (!depsAvailable(claim)) unknown.push(unevaluableItem(claim));
  }
  for (const id of thesis.contradicts) {
    const claim = byId.get(id);
    if (!claim) continue;
    if (claim.available) contradicts.push(evaluableItem(claim));
    else if (!depsAvailable(claim)) unknown.push(unevaluableItem(claim));
  }
  for (const id of thesis.unknown) {
    const claim = byId.get(id);
    if (!claim) continue;
    unknown.push(claim.available ? evaluableItem(claim) : unevaluableItem(claim));
  }

  // Exactly one window-result claim is available at a cutoff: net buying, net
  // selling, flat, or unavailable. The first available one is the lead answer.
  let windowNet: ThesisItemView | null = null;
  for (const id of thesis.window ?? []) {
    const claim = byId.get(id);
    if (claim?.available) {
      windowNet = evaluableItem(claim);
      break;
    }
  }

  // Exactly one qualifier claim is available at a cutoff: pass, fail, or the
  // not-enough-captured-sessions case. The first available one wins.
  let streak: ThesisItemView | null = null;
  for (const id of thesis.streak ?? []) {
    const claim = byId.get(id);
    if (claim?.available) {
      streak = evaluableItem(claim);
      break;
    }
  }

  const caveats = [...new Set([...supports, ...contradicts, ...unknown].flatMap((item) => item.caveats))];
  return { thesisId, supports, contradicts, unknown, windowNet, streak, caveats };
}
