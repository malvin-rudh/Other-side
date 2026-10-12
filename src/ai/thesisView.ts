import type { ApprovedClaim, ApprovedClaimsDocument, RenderedPart } from './claims';
import { pickText } from '../engine/facts';
import type { Locale } from '../engine/context';

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

  const caveats = [...new Set([...supports, ...contradicts, ...unknown].flatMap((item) => item.caveats))];
  return { thesisId, supports, contradicts, unknown, caveats };
}
