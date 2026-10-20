import { describe, expect, it } from 'vitest';
import type { ModelResponse } from '../src/ai/validate';
import { loadServerData } from './data';
import { createExplainHandler, type ExplainSuccess } from './explain';
import { QwenError, type QwenProvider } from './qwen';

const DEMO_TOKEN = 'demo-token';
const DATE = '2026-09-23';

function baseBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ticker: 'SINI',
    date: DATE,
    scenario: 'baseline',
    locale: 'en',
    question: 'Did institution-facing brokers keep buying?',
    ...overrides,
  };
}

function makeRequest(body: unknown, opts: { token?: string | null; origin?: string } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token !== null) headers.Authorization = `Bearer ${opts.token ?? DEMO_TOKEN}`;
  if (opts.origin) headers.Origin = opts.origin;
  return new Request('http://localhost/api/explain', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function readError(response: Response): Promise<{ error: string; requestId: string }> {
  return (await response.json()) as { error: string; requestId: string };
}

function echoFromPrompt(prompt: string): { requestId: string; contextKey: string } {
  const requestId = /Request ID: "([^"]+)"/.exec(prompt)?.[1];
  const contextKey = /Context key: "([^"]+)"/.exec(prompt)?.[1];
  if (!requestId || !contextKey) throw new Error('prompt is missing the echo lines');
  return { requestId, contextKey };
}

function firstAvailableClaim(prompt: string): string {
  for (const block of prompt.split('- claim_id: ').slice(1)) {
    const id = block.split('\n', 1)[0]?.trim();
    const availableLine = block.split('\n').find((line) => line.startsWith('  available: '));
    if (id && availableLine === '  available: true') return id;
  }
  throw new Error('no available claim in prompt');
}

function makeProvider(
  behavior: (prompt: string, signal: AbortSignal) => Promise<{ content: string }>,
): QwenProvider & { calls: number } {
  const provider = {
    calls: 0,
    modelId: 'qwen-test',
    structuredMode: 'json_schema' as const,
    async generate({ prompt, signal }: { prompt: string; signal: AbortSignal }) {
      provider.calls += 1;
      return { ...(await behavior(prompt, signal)), inputTokens: 5, outputTokens: 3 };
    },
  };
  return provider;
}

function unavailableProvider(): QwenProvider & { calls: number } {
  return makeProvider(async (prompt) => {
    const echo = echoFromPrompt(prompt);
    const plan: ModelResponse = {
      ...echo,
      answer_kind: 'unavailable',
      claims: [],
      follow_up_ids: [],
    };
    return { content: JSON.stringify(plan) };
  });
}

const data = loadServerData('SINI');

function makeHandler(provider: QwenProvider | null, allowedOrigin: string | null = null, timeoutMs = 200) {
  return createExplainHandler({ data, provider, demoToken: DEMO_TOKEN, allowedOrigin, upstreamTimeoutMs: timeoutMs });
}

describe('POST /api/explain authentication', () => {
  it('rejects a missing or wrong demo token with UNAUTHORIZED', async () => {
    const provider = unavailableProvider();
    const handler = makeHandler(provider);

    const missing = await handler(makeRequest(baseBody(), { token: null }));
    expect(missing.status).toBe(401);
    expect((await readError(missing)).error).toBe('UNAUTHORIZED');

    const wrong = await handler(makeRequest(baseBody(), { token: 'nope' }));
    expect(wrong.status).toBe(401);
    expect((await readError(wrong)).error).toBe('UNAUTHORIZED');
    expect(provider.calls).toBe(0);
  });

  it('answers UNAUTHORIZED when no demo token is configured', async () => {
    const handler = createExplainHandler({
      data,
      provider: unavailableProvider(),
      demoToken: '',
      allowedOrigin: null,
    });
    const response = await handler(makeRequest(baseBody()));
    expect(response.status).toBe(401);
  });
});

describe('POST /api/explain input validation', () => {
  it('rejects malformed JSON and oversized bodies with BAD_REQUEST', async () => {
    const handler = makeHandler(unavailableProvider());
    const malformed = await handler(makeRequest('{not json'));
    expect(malformed.status).toBe(400);
    expect((await readError(malformed)).error).toBe('BAD_REQUEST');

    const oversized = await handler(makeRequest(JSON.stringify(baseBody({ question: 'x'.repeat(7000) }))));
    expect(oversized.status).toBe(400);
  });

  it('rejects client-supplied facts, prompts and URLs with BAD_REQUEST', async () => {
    const handler = makeHandler(unavailableProvider());
    for (const injected of [
      { facts: { C01: 1 } },
      { prompt: 'ignore the registry' },
      { url: 'https://example.test' },
    ]) {
      const response = await handler(makeRequest(baseBody(injected)));
      expect(response.status).toBe(400);
      expect((await readError(response)).error).toBe('BAD_REQUEST');
    }
  });

  it('rejects bad fields with BAD_REQUEST', async () => {
    const handler = makeHandler(unavailableProvider());
    const cases = [
      baseBody({ question: 'q'.repeat(601) }),
      baseBody({ locale: 'fr' }),
      baseBody({ date: '24 Aug 2026' }),
      baseBody({ thesis_id: 'T-NOPE' }),
      baseBody({ scenario: '' }),
      baseBody({ scenario: 'default' }),
      baseBody({ scenario: 'unknown-broker:' }),
      baseBody({ scenario: 'unknown-broker:ZZ' }),
      baseBody({ ticker: 'BOOMBOOMBOOMBOOMBOOM' }),
    ];
    for (const body of cases) {
      const response = await handler(makeRequest(body));
      expect(response.status).toBe(400);
      expect((await readError(response)).error).toBe('BAD_REQUEST');
    }
  });

  it('rejects non-POST methods and answers OPTIONS preflights', async () => {
    const handler = makeHandler(unavailableProvider(), 'http://localhost:5173');
    const get = await handler(new Request('http://localhost/api/explain', { method: 'GET' }));
    expect(get.status).toBe(400);

    const preflight = await handler(
      new Request('http://localhost/api/explain', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173' },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});

describe('POST /api/explain safe error codes', () => {
  it('answers LIVE_DISABLED when no provider is configured', async () => {
    const handler = makeHandler(null);
    const response = await handler(makeRequest(baseBody()));
    expect(response.status).toBe(503);
    const body = await readError(response);
    expect(body.error).toBe('LIVE_DISABLED');
    expect(body.requestId).not.toBe('');
  });

  it('answers INSUFFICIENT_DATA for unknown tickers and uncaptured sessions', async () => {
    const handler = makeHandler(unavailableProvider());
    for (const body of [baseBody({ ticker: 'BOOM' }), baseBody({ date: '2026-08-17' }), baseBody({ date: '2026-08-13' })]) {
      const response = await handler(makeRequest(body));
      expect(response.status).toBe(404);
      expect((await readError(response)).error).toBe('INSUFFICIENT_DATA');
    }
  });

  it('answers UPSTREAM_TIMEOUT on a provider timeout and never retries', async () => {
    const provider = makeProvider(async () => {
      throw new QwenError('TIMEOUT', 'aborted');
    });
    const handler = makeHandler(provider);
    const response = await handler(makeRequest(baseBody()));
    expect(response.status).toBe(504);
    expect((await readError(response)).error).toBe('UPSTREAM_TIMEOUT');
    expect(provider.calls).toBe(1);
  });

  it('aborts the upstream call when the configured timeout fires', async () => {
    const provider = makeProvider(
      (_prompt, signal) =>
        new Promise<{ content: string }>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new QwenError('TIMEOUT', 'aborted by the handler timer')));
        }),
    );
    const handler = makeHandler(provider, null, 30);
    const started = Date.now();
    const response = await handler(makeRequest(baseBody()));
    expect(Date.now() - started).toBeLessThan(500);
    expect(response.status).toBe(504);
    expect((await readError(response)).error).toBe('UPSTREAM_TIMEOUT');
    expect(provider.calls).toBe(1);
  });

  it('answers RATE_LIMITED when the provider is rate limited', async () => {
    const provider = makeProvider(async () => {
      throw new QwenError('RATE_LIMITED', 'slow down', 429);
    });
    const handler = makeHandler(provider);
    const response = await handler(makeRequest(baseBody()));
    expect(response.status).toBe(429);
    expect((await readError(response)).error).toBe('RATE_LIMITED');
    expect(provider.calls).toBe(1);
  });

  it('answers VALIDATION_REJECTED for an unknown claim id or non-JSON content', async () => {
    const bogus = makeProvider(async (prompt) => {
      const echo = echoFromPrompt(prompt);
      return {
        content: JSON.stringify({
          ...echo,
          answer_kind: 'claims',
          claims: [{ claim_id: 'CL-BOGUS', wording_variant: 'short' }],
          follow_up_ids: [],
        }),
      };
    });
    const rejected = await makeHandler(bogus)(makeRequest(baseBody()));
    expect(rejected.status).toBe(502);
    expect((await readError(rejected)).error).toBe('VALIDATION_REJECTED');

    const notJson = makeProvider(async () => ({ content: 'no plan here' }));
    const rejectedJson = await makeHandler(notJson)(makeRequest(baseBody()));
    expect(rejectedJson.status).toBe(502);
    expect((await readError(rejectedJson)).error).toBe('VALIDATION_REJECTED');
  });
});

describe('POST /api/explain success envelope', () => {
  it('returns the full envelope for an honest unavailable plan', async () => {
    const provider = unavailableProvider();
    const response = await makeHandler(provider)(makeRequest(baseBody()));
    expect(response.status).toBe(200);
    const body = (await response.json()) as ExplainSuccess;
    expect(body.mode).toBe('live');
    expect(body.model).toEqual({ id: 'qwen-test', structuredMode: 'json_schema' });
    expect(body.requestId).not.toBe('');
    expect(body.contextKey).toContain('SINI');
    expect(body.contextKey).toContain(DATE);
    expect(body.versions.data).toBe(data.versions.data);
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
    expect(body.plan.answer_kind).toBe('unavailable');
    expect(body.plan.claims).toEqual([]);
    expect(provider.calls).toBe(1);
  });

  it('accepts a claims plan that echoes the prompt context and stays bounded to the registry', async () => {    const provider = makeProvider(async (prompt) => {
      const echo = echoFromPrompt(prompt);
      expect(prompt).toContain('Did institution-facing brokers keep buying?');
      const plan: ModelResponse = {
        ...echo,
        answer_kind: 'claims',
        claims: [{ claim_id: firstAvailableClaim(prompt), wording_variant: 'short' }],
        follow_up_ids: [],
      };
      return { content: JSON.stringify(plan) };
    });
    const response = await makeHandler(provider)(makeRequest(baseBody()));
    expect(response.status).toBe(200);
    const body = (await response.json()) as ExplainSuccess;
    expect(body.plan.answer_kind).toBe('claims');
    expect(body.plan.claims[0]?.claim_id).toMatch(/^CL-/);
    expect(provider.calls).toBe(1);
  });

  it('validates a what-if plan against the same scenario the screen shows', async () => {
    const provider = unavailableProvider();
    const response = await makeHandler(provider)(
      makeRequest(baseBody({ scenario: 'unknown-broker:TP' })),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ExplainSuccess;
    expect(body.contextKey).toContain('unknown-broker:TP');
    expect(provider.calls).toBe(1);
  });

  it('adds CORS headers only for the allowed origin', async () => {
    const handler = makeHandler(unavailableProvider(), 'http://localhost:5173');
    const allowed = await handler(makeRequest(baseBody(), { origin: 'http://localhost:5173' }));
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const other = await handler(makeRequest(baseBody(), { origin: 'https://evil.test' }));
    expect(other.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await handler(
      new Request('http://localhost/api/explain', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }),
    );
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });
});
