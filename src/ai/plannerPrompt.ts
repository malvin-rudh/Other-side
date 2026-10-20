// Single reviewed prompt used by both the saved-answer generator
// (scripts/generate-saved-answers.ts) and the live server (server/explain.ts),
// so a saved plan and a live plan for the same context see byte-identical prompts.
import type { ApprovedClaimsDocument } from './claims';

export interface PlannerPromptInput {
  approved: ApprovedClaimsDocument;
  questionText: string;
  followUpIds: readonly string[];
  requestId: string;
  thesisId?: string | null;
}

export function buildPlannerPrompt(input: PlannerPromptInput): string {
  const { approved } = input;
  const context = approved.context;
  const claimLines = approved.claims
    .map((claim) => {
      const thesis = claim.thesis ? `\n  thesis: ${claim.thesis}` : '';
      return [
        `- claim_id: ${claim.claim_id}`,
        `  section: ${claim.section}${thesis}`,
        `  available: ${claim.available}`,
        `  wording short: ${claim.wording.short.en}`,
        `  wording explained: ${claim.wording.explained.en}`,
      ].join('\n');
    })
    .join('\n');
  const factLines = approved.facts
    .map(
      (fact) =>
        `- ${fact.key}: available=${fact.available} available_at=${fact.available_at} summary="${fact.approximate.en}"`,
    )
    .join('\n');
  const thesisLine = input.thesisId ? `Thesis under test: ${input.thesisId}.\n` : '';
  return [
    'You are the answer planner for O-Side, a historical replay feature that explains broker flow.',
    'You receive one bounded question plus the reviewed fact and claim registry for one analytical context.',
    'You return only approved claim IDs, their order and one allowed wording variant. You invent nothing.',
    '',
    `Bounded question: "${input.questionText}"`,
    `${thesisLine}Analytical context: ticker ${approved.ticker}, session ${context.sessionDate}, cutoff ${context.cutoffAt}, period ${context.periodStart}..${context.periodEnd}, scenario ${context.scenario}.`,
    `Context key: "${approved.contextKey}"`,
    `Request ID: "${input.requestId}"`,
    '',
    'Approved claims (use only these IDs, and only a claim whose available flag is true at this cutoff):',
    claimLines,
    '',
    'Facts behind the claims (available_at is the replay availability time; never rely on a fact whose available flag is false):',
    factLines,
    '',
    'Rules:',
    '- Answer only the bounded question above.',
    '- Pick the 3 to 5 most direct available claims, strongest support first, and set wording_variant to "short" or "explained" per claim.',
    '- If the available evidence is too weak to address the question honestly, set answer_kind to "unavailable" with an empty claims list.',
    `- follow_up_ids must be drawn from this list: ${input.followUpIds.join(', ')}.`,
    '- Echo the context key and request ID exactly as given.',
    '- Return one JSON object and nothing else, exactly matching this shape:',
    '{"contextKey":"...","requestId":"...","answer_kind":"claims","claims":[{"claim_id":"...","wording_variant":"explained"}],"follow_up_ids":["..."]}',
  ].join('\n');
}
