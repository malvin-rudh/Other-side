import { describe, expect, it } from 'vitest';
import { requestLiveExplanation, type LiveExplainEnvelope } from './liveClient';

const CONTEXT_KEY = 'SINI|2026-08-24|2026-08-25T00:00:00+07:00|default|en|d1|t1|c1';

function makeEnvelope(requestId: string, contextKey: string): LiveExplainEnvelope {
  return {
    requestId,
    contextKey,
    versions: { data: 'd1', taxonomy: 't1', claims: 'c1' },
    mode: 'live',
    model: { id: 'qwen-plus', structuredMode: 'json_schema' },
    generatedAt: '2026-10-09T00:00:00Z',
    usage: { inputTokens: 10, outputTokens: 5 },
    plan: { contextKey, requestId, answer_kind: 'unavailable', claims: [], follow_up_ids: [] },
  };
}

function baseInput(fetchImpl: typeof fetch) {
  return {
    endpoint: 'https://example.test/api/explain',
    token: 'demo-token',
    ticker: 'SINI',
    date: '2026-08-24',
    scenario: 'default',
    locale: 'en' as const,
    question: 'Institutions are accumulating',
    thesisId: 'T-INST-LED',
    expectedContextKey: CONTEXT_KEY,
    fetchImpl,
  };
}

describe('requestLiveExplanation', () => {
  it('accepts an envelope only when the echoed request ID and context key match', async () => {
    let seenBody = '';
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      seenBody = String(init?.body ?? '');
      const { request_id: requestId } = JSON.parse(seenBody) as { request_id: string };
      return new Response(JSON.stringify(makeEnvelope(requestId, CONTEXT_KEY)), { status: 200 });
    }) as typeof fetch;

    const result = await requestLiveExplanation(baseInput(fetchImpl));
    expect(result.ok).toBe(true);
    const sent = JSON.parse(seenBody) as Record<string, unknown>;
    expect(sent.request_id).toEqual(expect.any(String));
    expect(sent.thesis_id).toBe('T-INST-LED');
    expect(Object.keys(sent).sort()).toEqual(['date', 'locale', 'question', 'request_id', 'scenario', 'thesis_id', 'ticker']);
  });

  it('rejects a stale envelope whose context key does not match', async () => {
    const fetchImpl = (async (_input: unknown, _init?: RequestInit) => {
      return new Response(JSON.stringify(makeEnvelope('req-other', 'SINI|other-key')), { status: 200 });
    }) as typeof fetch;

    const result = await requestLiveExplanation(baseInput(fetchImpl));
    expect(result).toEqual({ ok: false, code: 'NETWORK' });
  });

  it('maps a 401 to UNAUTHORIZED and a 504 to UPSTREAM_TIMEOUT', async () => {
    const unauthorized = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    expect(await requestLiveExplanation(baseInput(unauthorized))).toEqual({ ok: false, code: 'UNAUTHORIZED' });

    const timeout = (async () => new Response('{}', { status: 504 })) as typeof fetch;
    expect(await requestLiveExplanation(baseInput(timeout))).toEqual({ ok: false, code: 'UPSTREAM_TIMEOUT' });
  });

  it('returns NETWORK when the request is aborted and never retries', async () => {
    let calls = 0;
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      calls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as typeof fetch;

    const result = await requestLiveExplanation({ ...baseInput(fetchImpl), timeoutMs: 20 });
    expect(result).toEqual({ ok: false, code: 'NETWORK' });
    expect(calls).toBe(1);
  });
});
