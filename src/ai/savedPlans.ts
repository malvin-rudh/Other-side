import type { ApprovedClaimsDocument } from './claims';
import { THESIS_QUESTION_ID } from './thesisView';
import { validateModelResponse, type ModelResponse } from './validate';

export interface SavedPlanContext {
  sessionDate: string;
  cutoffAt: string;
  periodStart: string;
  periodEnd: string;
  scenario: string;
  dataVersion: string;
  taxonomyVersion: string;
  claimVersion: string;
}

export interface SavedPlanMeta {
  questionId: string;
  thesisId: string;
  context: SavedPlanContext;
  model: {
    id: string;
    generatedAt: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  };
}

export type SavedPlanResult =
  | { status: 'valid'; meta: SavedPlanMeta; response: ModelResponse }
  | { status: 'missing' }
  | { status: 'invalid'; reason: string };

export interface SavedPlanFile {
  meta: SavedPlanMeta;
  contextKey: string;
  response: unknown;
}

const CONTEXT_FIELDS: readonly (keyof SavedPlanContext)[] = [
  'sessionDate',
  'cutoffAt',
  'periodStart',
  'periodEnd',
  'scenario',
  'dataVersion',
  'taxonomyVersion',
  'claimVersion',
];

function isStringMap(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => typeof record[key] === 'string');
}

function isUsage(value: unknown): value is { inputTokens?: number; outputTokens?: number } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.inputTokens === undefined || typeof record.inputTokens === 'number') &&
    (record.outputTokens === undefined || typeof record.outputTokens === 'number')
  );
}

export function serializeSavedPlan(meta: SavedPlanMeta, contextKey: string, response: ModelResponse): string {
  const file: SavedPlanFile = { meta, contextKey, response };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function parseSavedPlan(payload: unknown): SavedPlanFile | { invalid: string } {
  if (typeof payload !== 'object' || payload === null) return { invalid: 'file is not an object' };
  const file = payload as Record<string, unknown>;
  if (typeof file.contextKey !== 'string') return { invalid: 'contextKey missing' };
  if (typeof file.response !== 'object' || file.response === null) return { invalid: 'response missing' };
  const meta = file.meta as Record<string, unknown> | undefined;
  if (typeof meta !== 'object' || meta === null) return { invalid: 'meta missing' };
  if (typeof meta.questionId !== 'string' || typeof meta.thesisId !== 'string') {
    return { invalid: 'meta question or thesis missing' };
  }
  if (!isStringMap(meta.context, CONTEXT_FIELDS)) {
    return { invalid: 'meta context is missing or not all strings' };
  }
  const model = meta.model as Record<string, unknown> | undefined;
  if (typeof model !== 'object' || model === null) return { invalid: 'meta model missing' };
  if (typeof model.id !== 'string' || typeof model.generatedAt !== 'string') {
    return { invalid: 'meta model id or generatedAt missing' };
  }
  return {
    meta: {
      questionId: meta.questionId,
      thesisId: meta.thesisId,
      context: meta.context as unknown as SavedPlanContext,
      model: {
        id: model.id,
        generatedAt: model.generatedAt,
        ...(isUsage(model.usage) ? { usage: model.usage } : {}),
      },
    },
    contextKey: file.contextKey,
    response: file.response,
  };
}

function contextMatches(file: SavedPlanContext, approved: ApprovedClaimsDocument): boolean {
  const live = approved.context;
  return CONTEXT_FIELDS.every((field) => file[field] === live[field]);
}

export async function loadSavedPlan(
  ticker: string,
  sessionDate: string,
  thesisId: string,
  approved: ApprovedClaimsDocument,
  fetchImpl: typeof fetch = fetch,
): Promise<SavedPlanResult> {
  const url = `/data/${ticker.toLowerCase()}/ai/${sessionDate}/${thesisId}.json`;
  let payload: unknown;
  try {
    const http = await fetchImpl(url);
    if (!http.ok) return { status: 'missing' };
    payload = await http.json();
  } catch {
    return { status: 'missing' };
  }

  const parsed = parseSavedPlan(payload);
  if ('invalid' in parsed) return { status: 'invalid', reason: parsed.invalid };
  if (parsed.meta.thesisId !== thesisId) {
    return { status: 'invalid', reason: 'saved plan thesis does not match the requested thesis' };
  }
  const curatedQuestionId = THESIS_QUESTION_ID[parsed.meta.thesisId];
  if (curatedQuestionId === undefined || parsed.meta.questionId !== curatedQuestionId) {
    return { status: 'invalid', reason: 'saved plan question does not match the curated thesis question' };
  }
  if (!contextMatches(parsed.meta.context, approved)) {
    return { status: 'invalid', reason: 'saved context does not match the current analytical context' };
  }
  if (parsed.contextKey !== approved.contextKey) {
    return { status: 'invalid', reason: 'saved context key does not match the current context key' };
  }

  const latestRequestId = (parsed.response as { requestId?: unknown }).requestId;
  const validated = validateModelResponse({
    response: parsed.response,
    expectedContextKey: approved.contextKey,
    latestRequestId: typeof latestRequestId === 'string' ? latestRequestId : '',
    approved,
    cutoffAt: approved.context.cutoffAt,
  });
  if (!validated.ok) return { status: 'invalid', reason: validated.reason };
  return { status: 'valid', meta: parsed.meta, response: validated.response };
}
