// POST /api/explain: the only live-AI surface of the app. Platform-neutral
// (Request in, Response out) so the same handler runs under the local node
// entry and the Function Compute HTTP trigger. The server rebuilds the cutoff,
// facts and approved claims from the bundled data for every call, makes exactly
// one upstream call with a hard abort, validates the full plan, and answers
// either the success envelope or one safe error code. Facts, prompts and URLs
// from the client are rejected: the body schema admits none of them.
import { buildApprovedClaims, type ApprovedClaimsDocument } from '../src/ai/claims';
import { buildPlannerPrompt } from '../src/ai/plannerPrompt';
import { THESIS_IDS } from '../src/ai/thesisView';
import { validateModelResponse, type ModelResponse } from '../src/ai/validate';
import { createRequestId, type Locale } from '../src/engine/context';
import { buildFacts, type FactsContext } from '../src/engine/facts';
import { sessionAvailableAt } from '../src/engine/predicates';
import { parseWireScenario } from '../src/engine/whatIf';
import type { ServerDataBundle } from './data';
import { QwenError, type QwenProvider } from './qwen';

export type ExplainErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_DATA'
  | 'UPSTREAM_TIMEOUT'
  | 'VALIDATION_REJECTED'
  | 'LIVE_DISABLED';

export interface ExplainSuccess {
  requestId: string;
  contextKey: string;
  versions: { data: string; taxonomy: string; claims: string };
  mode: 'live';
  model: { id: string; structuredMode: string };
  generatedAt: string;
  usage: { inputTokens?: number; outputTokens?: number };
  plan: ModelResponse;
}

export interface ExplainHandlerDeps {
  data: ServerDataBundle;
  provider: QwenProvider | null;
  demoToken: string;
  allowedOrigin: string | null;
  now?: () => Date;
  upstreamTimeoutMs?: number;
  maxBodyBytes?: number;
}

export const DEFAULT_MAX_BODY_BYTES = 8 * 1024;
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_QUESTION_CHARS = 600;

const ERROR_STATUS: Record<ExplainErrorCode, number> = {
  UNAUTHORIZED: 401,
  BAD_REQUEST: 400,
  RATE_LIMITED: 429,
  INSUFFICIENT_DATA: 404,
  UPSTREAM_TIMEOUT: 504,
  VALIDATION_REJECTED: 502,
  LIVE_DISABLED: 503,
};

interface ExplainInput {
  ticker: string;
  date: string;
  scenario: string;
  locale: Locale;
  question: string;
  thesisId?: string;
  requestId?: string;
}

function validateInput(body: unknown): ExplainInput | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'body must be a JSON object';
  }
  const record = body as Record<string, unknown>;
  const allowed = new Set(['ticker', 'date', 'scenario', 'locale', 'question', 'thesis_id', 'request_id']);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return `unexpected field "${key}"`;
  }
  const { ticker, date, scenario, locale, question, thesis_id: thesisId, request_id: requestId } = record;
  if (typeof ticker !== 'string' || ticker.trim() === '' || ticker.length > 16) return 'ticker must be a short string';
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'date must be YYYY-MM-DD';
  if (typeof scenario !== 'string' || scenario.trim() === '' || scenario.length > 100) {
    return 'scenario must be a non-empty string of at most 100 chars';
  }
  if (locale !== 'en' && locale !== 'id' && locale !== 'zh-CN') return 'locale must be "en", "id" or "zh-CN"';
  if (typeof question !== 'string' || question.trim().length === 0) return 'question must be a non-empty string';
  if (question.length > MAX_QUESTION_CHARS) return `question exceeds ${MAX_QUESTION_CHARS} chars`;
  if (thesisId !== undefined && (typeof thesisId !== 'string' || thesisId.length > 32)) {
    return 'thesis_id must be a short string';
  }
  if (requestId !== undefined && (typeof requestId !== 'string' || requestId.trim() === '' || requestId.length > 64)) {
    return 'request_id must be a non-empty string of at most 64 chars';
  }
  return {
    ticker: ticker.trim(),
    date,
    scenario,
    locale,
    question,
    ...(typeof thesisId === 'string' ? { thesisId } : {}),
    ...(typeof requestId === 'string' ? { requestId: requestId.trim() } : {}),
  };
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export function hasValidDemoToken(authorizationHeader: string | null, demoToken: string): boolean {
  if (demoToken === '') return false;
  return timingSafeEqualStrings(authorizationHeader ?? '', `Bearer ${demoToken}`);
}

function corsHeaders(request: Request, allowedOrigin: string | null): Record<string, string> {
  if (!allowedOrigin) return {};
  const origin = request.headers.get('origin');
  if (origin !== allowedOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

function errorResponse(
  code: ExplainErrorCode,
  requestId: string,
  message: string,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: code, requestId, message }), {
    status: ERROR_STATUS[code],
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('answer contains no JSON object');
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

function resolveQuestion(
  approved: ApprovedClaimsDocument,
  raw: string,
): { text: string; followUpIds: readonly string[] } {
  const allIds = Object.keys(approved.questions);
  const byId = approved.questions[raw];
  if (byId) return { text: byId.text.en, followUpIds: byId.follow_up_ids };
  const matched = allIds.find((id) => {
    const question = approved.questions[id];
    return question !== undefined && (question.text.en === raw || question.text.id === raw || question.text.zh === raw);
  });
  if (matched) {
    const question = approved.questions[matched];
    if (question) return { text: question.text.en, followUpIds: question.follow_up_ids };
  }
  return { text: raw, followUpIds: allIds };
}

export function createExplainHandler(deps: ExplainHandlerDeps): (request: Request) => Promise<Response> {
  const upstreamTimeoutMs = deps.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const now = deps.now ?? (() => new Date());

  return async function handleExplain(request: Request): Promise<Response> {
    let requestId = createRequestId();
    const cors = corsHeaders(request, deps.allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors });
    }
    if (request.method !== 'POST') {
      return errorResponse('BAD_REQUEST', requestId, 'only POST is supported', cors);
    }

    const authorization = request.headers.get('authorization') ?? '';
    if (!hasValidDemoToken(authorization, deps.demoToken)) {
      return errorResponse('UNAUTHORIZED', requestId, 'missing or invalid demo token', cors);
    }

    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > maxBodyBytes) {
      return errorResponse('BAD_REQUEST', requestId, `body exceeds ${maxBodyBytes} bytes`, cors);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
    } catch {
      return errorResponse('BAD_REQUEST', requestId, 'body is not valid JSON', cors);
    }
    const input = validateInput(parsed);
    if (typeof input === 'string') {
      return errorResponse('BAD_REQUEST', requestId, input, cors);
    }
    if (input.requestId !== undefined) {
      requestId = input.requestId;
    }

    if (!deps.provider) {
      return errorResponse('LIVE_DISABLED', requestId, 'live Qwen answers are disabled on this deployment', cors);
    }

    const bundle = deps.data;
    if (bundle.ticker.toUpperCase() !== input.ticker.toUpperCase()) {
      return errorResponse('INSUFFICIENT_DATA', requestId, `no bundled data for ticker ${input.ticker}`, cors);
    }
    const session = bundle.sessions.find((entry) => entry.date === input.date);
    if (!session || session.status !== 'captured') {
      return errorResponse(
        'INSUFFICIENT_DATA',
        requestId,
        `no captured market session for ${input.date}`,
        cors,
      );
    }
    if (input.thesisId && !(THESIS_IDS as readonly string[]).includes(input.thesisId)) {
      return errorResponse('BAD_REQUEST', requestId, `unknown thesis_id ${input.thesisId}`, cors);
    }
    const parsedScenario = parseWireScenario(input.scenario);
    if (parsedScenario === null) {
      return errorResponse(
        'BAD_REQUEST',
        requestId,
        'scenario must be "baseline" or "unknown-broker:<CODE>"',
        cors,
      );
    }
    if (
      parsedScenario.unknownBrokerCode !== null &&
      !bundle.brokers.some((broker) => broker.code === parsedScenario.unknownBrokerCode)
    ) {
      return errorResponse(
        'BAD_REQUEST',
        requestId,
        `unknown broker code in scenario: ${parsedScenario.unknownBrokerCode}`,
        cors,
      );
    }

    const context: FactsContext = {
      ticker: bundle.ticker,
      sessionDate: input.date,
      cutoffAt: sessionAvailableAt(input.date),
      periodStart: bundle.defaultWindow.start,
      periodEnd: bundle.defaultWindow.end,
      scenario: parsedScenario.scenario,
      locale: input.locale,
      dataVersion: bundle.versions.data,
      taxonomyVersion: bundle.versions.taxonomy,
      claimVersion: bundle.versions.claims,
      ...(parsedScenario.unknownBrokerCode !== null
        ? { unknownBrokerCodes: [parsedScenario.unknownBrokerCode] as const }
        : {}),
    };
    const approved = buildApprovedClaims(context, buildFacts(context, bundle));
    const question = resolveQuestion(approved, input.question.trim());
    const prompt = buildPlannerPrompt({
      approved,
      questionText: question.text,
      followUpIds: question.followUpIds,
      requestId,
      thesisId: input.thesisId ?? null,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), upstreamTimeoutMs);
    let call;
    try {
      call = await deps.provider.generate({ prompt, signal: controller.signal });
    } catch (error) {
      if (error instanceof QwenError) {
        if (error.code === 'TIMEOUT') {
          return errorResponse('UPSTREAM_TIMEOUT', requestId, 'the model call exceeded the time limit', cors);
        }
        if (error.code === 'RATE_LIMITED') {
          return errorResponse('RATE_LIMITED', requestId, 'the model provider rate limited the call', cors);
        }
        if (error.code === 'AUTH') {
          return errorResponse('UNAUTHORIZED', requestId, 'the model provider rejected the server credentials', cors);
        }
        return errorResponse('UPSTREAM_TIMEOUT', requestId, 'the model provider call failed', cors);
      }
      return errorResponse('UPSTREAM_TIMEOUT', requestId, 'the model provider call failed unexpectedly', cors);
    } finally {
      clearTimeout(timer);
    }

    let planJson: unknown;
    try {
      planJson = extractJson(call.content);
    } catch {
      return errorResponse('VALIDATION_REJECTED', requestId, 'the model answer contains no parseable plan', cors);
    }
    const validated = validateModelResponse({
      response: planJson,
      expectedContextKey: approved.contextKey,
      latestRequestId: requestId,
      approved,
      cutoffAt: context.cutoffAt,
    });
    if (!validated.ok) {
      return errorResponse('VALIDATION_REJECTED', requestId, `plan failed validation: ${validated.reason}`, cors);
    }

    const success: ExplainSuccess = {
      requestId,
      contextKey: approved.contextKey,
      versions: {
        data: bundle.versions.data,
        taxonomy: bundle.versions.taxonomy,
        claims: bundle.versions.claims,
      },
      mode: 'live',
      model: { id: deps.provider.modelId, structuredMode: deps.provider.structuredMode },
      generatedAt: now().toISOString(),
      usage: { inputTokens: call.inputTokens, outputTokens: call.outputTokens },
      plan: validated.response,
    };
    return new Response(JSON.stringify(success), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  };
}
