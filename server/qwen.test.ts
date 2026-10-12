import { describe, expect, it } from 'vitest';
import { createQwenProvider, probeStructuredOutputMode, QwenError } from './qwen';

const CONFIG = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'qwen-test',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function completion(content: string): Response {
  return jsonResponse(200, {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  });
}

function fetchImpl(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init ?? {});
  }) as typeof fetch;
}

describe('createQwenProvider', () => {
  it('returns content and token usage on success', async () => {
    const seen: RequestInit[] = [];
    const provider = createQwenProvider({
      ...CONFIG,
      structuredMode: 'json_object',
      fetchImpl: fetchImpl((_url, init) => {
        seen.push(init);
        return completion('{"ok":true}');
      }),
    });
    const result = await provider.generate({ prompt: 'p', signal: new AbortController().signal });
    expect(result.content).toBe('{"ok":true}');
    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBe(7);
    const body = JSON.parse(String(seen[0]?.body)) as {
      model: string;
      response_format: { type: string };
      messages: { role: string }[];
    };
    expect(body.model).toBe('qwen-test');
    expect(body.response_format.type).toBe('json_object');
    expect(body.messages).toHaveLength(2);
  });

  it('sends a json_schema response_format in json_schema mode', async () => {
    let captured: { type: string } | null = null;
    const provider = createQwenProvider({
      ...CONFIG,
      structuredMode: 'json_schema',
      fetchImpl: fetchImpl((_url, init) => {
        const body = JSON.parse(String(init.body)) as { response_format: { type: string } };
        captured = body.response_format;
        return completion('{}');
      }),
    });
    await provider.generate({ prompt: 'p', signal: new AbortController().signal });
    expect(captured).toMatchObject({ type: 'json_schema' });
  });

  it('sends the key only in the Authorization header', async () => {
    const capturedHeaders: Headers[] = [];
    const provider = createQwenProvider({
      ...CONFIG,
      structuredMode: 'json_object',
      fetchImpl: fetchImpl((_url, init) => {
        capturedHeaders.push(new Headers(init.headers));
        return completion('{}');
      }),
    });
    await provider.generate({ prompt: 'p', signal: new AbortController().signal });
    const headers = capturedHeaders[0];
    expect(headers?.get('authorization')).toBe('Bearer test-key');
    expect(JSON.stringify(headers)).not.toContain('test-key"');
  });

  it('maps 401 and 403 to AUTH', async () => {
    for (const status of [401, 403]) {
      const provider = createQwenProvider({
        ...CONFIG,
        structuredMode: 'json_object',
        fetchImpl: fetchImpl(() => jsonResponse(status, { error: 'unauthorized' })),
      });
      const failure = await provider
        .generate({ prompt: 'p', signal: new AbortController().signal })
        .then(() => null)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(QwenError);
      expect((failure as QwenError).code).toBe('AUTH');
      expect((failure as QwenError).status).toBe(status);
    }
  });

  it('maps 429 to RATE_LIMITED', async () => {
    const provider = createQwenProvider({
      ...CONFIG,
      structuredMode: 'json_object',
      fetchImpl: fetchImpl(() => jsonResponse(429, { error: 'rate limit' })),
    });
    const failure = await provider
      .generate({ prompt: 'p', signal: new AbortController().signal })
      .then(() => null)
      .catch((error: unknown) => error);
    expect((failure as QwenError).code).toBe('RATE_LIMITED');
  });

  it('maps an abort to TIMEOUT', async () => {
    const provider = createQwenProvider({
      ...CONFIG,
      structuredMode: 'json_object',
      fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        await new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
        return completion('{}');
      }) as typeof fetch,
    });
    const controller = new AbortController();
    const pending = provider.generate({ prompt: 'p', signal: controller.signal });
    controller.abort();
    const failure = await pending.then(() => null).catch((error: unknown) => error);
    expect((failure as QwenError).code).toBe('TIMEOUT');
  });

  it('maps other failures and empty answers to UPSTREAM', async () => {
    const failing = createQwenProvider({
      ...CONFIG,
      structuredMode: 'json_object',
      fetchImpl: fetchImpl(() => jsonResponse(500, { error: 'boom' })),
    });
    const failure = await failing
      .generate({ prompt: 'p', signal: new AbortController().signal })
      .then(() => null)
      .catch((error: unknown) => error);
    expect((failure as QwenError).code).toBe('UPSTREAM');

    const empty = createQwenProvider({
      ...CONFIG,
      structuredMode: 'json_object',
      fetchImpl: fetchImpl(() => completion('')),
    });
    const emptyFailure = await empty
      .generate({ prompt: 'p', signal: new AbortController().signal })
      .then(() => null)
      .catch((error: unknown) => error);
    expect((emptyFailure as QwenError).code).toBe('UPSTREAM');
  });

  it('refuses an empty api key', () => {
    expect(() => createQwenProvider({ ...CONFIG, apiKey: '', structuredMode: 'json_object' })).toThrow(QwenError);
  });
});

describe('probeStructuredOutputMode', () => {
  it('returns json_schema when the model accepts it', async () => {
    const mode = await probeStructuredOutputMode({
      ...CONFIG,
      fetchImpl: fetchImpl(() => completion('{"ok":true}')),
    });
    expect(mode).toBe('json_schema');
  });

  it('falls back to json_object when json_schema is rejected', async () => {
    const modes: string[] = [];
    const mode = await probeStructuredOutputMode({
      ...CONFIG,
      fetchImpl: fetchImpl((_url, init) => {
        const body = JSON.parse(String(init.body)) as { response_format: { type: string } };
        modes.push(body.response_format.type);
        return body.response_format.type === 'json_schema'
          ? jsonResponse(400, { error: 'unsupported response_format' })
          : completion('{"ok":true}');
      }),
    });
    expect(mode).toBe('json_object');
    expect(modes).toEqual(['json_schema', 'json_object']);
  });

  it('throws CONFIG when neither mode is accepted', async () => {
    const failure = await probeStructuredOutputMode({
      ...CONFIG,
      fetchImpl: fetchImpl(() => jsonResponse(400, { error: 'no structured output' })),
    })
      .then(() => null)
      .catch((error: unknown) => error);
    expect((failure as QwenError).code).toBe('CONFIG');
  });

  it('propagates auth failures instead of guessing a mode', async () => {
    const failure = await probeStructuredOutputMode({
      ...CONFIG,
      fetchImpl: fetchImpl(() => jsonResponse(401, { error: 'bad key' })),
    })
      .then(() => null)
      .catch((error: unknown) => error);
    expect((failure as QwenError).code).toBe('AUTH');
  });
});
