// Client for POST /api/explain (server/explain.ts). Sends only bounded
// selectors plus the demo token, aborts after a hard timeout, retries never,
// and accepts an envelope only when the echoed context key and the latest
// request ID both match, mirroring the server-side acceptance rule.
import { createRequestId, isCurrentResponse } from '../engine/context';
import type { Locale } from '../engine/context';
import type { ModelResponse } from './validate';

export type LiveErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_DATA'
  | 'UPSTREAM_TIMEOUT'
  | 'VALIDATION_REJECTED'
  | 'LIVE_DISABLED'
  | 'NETWORK';

export interface LiveExplainEnvelope {
  requestId: string;
  contextKey: string;
  versions: { data: string; taxonomy: string; claims: string };
  mode: 'live';
  model: { id: string; structuredMode: string };
  generatedAt: string;
  usage: { inputTokens?: number; outputTokens?: number };
  plan: ModelResponse;
}

export type LiveExplainResult =
  | { ok: true; requestId: string; envelope: LiveExplainEnvelope }
  | { ok: false; code: LiveErrorCode };

export interface LiveExplainRequest {
  endpoint: string;
  token: string;
  ticker: string;
  date: string;
  scenario: string;
  locale: Locale;
  question: string;
  thesisId: string | null;
  expectedContextKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const ERROR_STATUS: Record<number, LiveErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  404: 'INSUFFICIENT_DATA',
  429: 'RATE_LIMITED',
  502: 'VALIDATION_REJECTED',
  503: 'LIVE_DISABLED',
  504: 'UPSTREAM_TIMEOUT',
};

export async function requestLiveExplanation(input: LiveExplainRequest): Promise<LiveExplainResult> {
  const requestId = createRequestId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
  let http: Response;
  try {
    http = await (input.fetchImpl ?? fetch)(input.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({
        ticker: input.ticker,
        date: input.date,
        scenario: input.scenario,
        locale: input.locale,
        question: input.question,
        request_id: requestId,
        ...(input.thesisId !== null ? { thesis_id: input.thesisId } : {}),
      }),
      signal: controller.signal,
    });
  } catch {
    return { ok: false, code: 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }

  if (!http.ok) {
    return { ok: false, code: ERROR_STATUS[http.status] ?? 'NETWORK' };
  }

  let envelope: LiveExplainEnvelope;
  try {
    envelope = (await http.json()) as LiveExplainEnvelope;
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
  if (!isCurrentResponse(input.expectedContextKey, requestId, envelope)) {
    return { ok: false, code: 'NETWORK' };
  }
  return { ok: true, requestId, envelope };
}
