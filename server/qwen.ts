// Server-only Qwen adapter for Alibaba Cloud Model Studio (OpenAI-compatible).
// Credentials arrive via constructor config only, never via the request, and are
// sent solely in the Authorization header. One HTTP call per generate(), the
// caller supplies the AbortSignal, there is no retry loop.
import { responseSchema } from '../src/ai/validate';

export type StructuredMode = 'json_schema' | 'json_object';

export type QwenErrorCode = 'AUTH' | 'RATE_LIMITED' | 'TIMEOUT' | 'UPSTREAM' | 'CONFIG';

export class QwenError extends Error {
  constructor(
    readonly code: QwenErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'QwenError';
  }
}

export interface QwenCallResult {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface QwenProvider {
  readonly modelId: string;
  readonly structuredMode: StructuredMode;
  generate(input: { prompt: string; signal: AbortSignal }): Promise<QwenCallResult>;
}

export interface QwenProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  structuredMode: StructuredMode;
  fetchImpl?: typeof fetch;
}

function responseFormatFor(mode: StructuredMode): Record<string, unknown> {
  if (mode === 'json_object') return { type: 'json_object' };
  return {
    type: 'json_schema',
    json_schema: {
      name: 'answer_plan',
      strict: true,
      schema: responseSchema,
    },
  };
}

export function createQwenProvider(config: QwenProviderConfig): QwenProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;
  if (config.apiKey === '') throw new QwenError('CONFIG', 'Qwen api key is empty');

  return {
    modelId: config.model,
    structuredMode: config.structuredMode,

    async generate({ prompt, signal }): Promise<QwenCallResult> {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            response_format: responseFormatFor(config.structuredMode),
            messages: [
              { role: 'system', content: 'You plan answers strictly from a reviewed claim registry.' },
              { role: 'user', content: prompt },
            ],
          }),
          signal,
        });
      } catch (error) {
        if (signal.aborted) {
          throw new QwenError('TIMEOUT', 'Qwen call aborted by caller timeout');
        }
        throw new QwenError('UPSTREAM', `Qwen call failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new QwenError('AUTH', `Qwen rejected the credentials with HTTP ${res.status}`, res.status);
        }
        if (res.status === 429) {
          throw new QwenError('RATE_LIMITED', 'Qwen rate limited the call', res.status);
        }
        throw new QwenError('UPSTREAM', `Qwen request failed with HTTP ${res.status}`, res.status);
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new QwenError('UPSTREAM', 'Qwen returned an empty answer');
      }
      return {
        content,
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
      };
    },
  };
}

// Probe which structured-output mode the configured model actually supports:
// JSON Schema first, JSON Object as fallback. Throws QwenError CONFIG when
// neither mode is accepted, so callers can report an honest blocker.
export async function probeStructuredOutputMode(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<StructuredMode> {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const probeSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false,
  } as const;

  const tryMode = async (mode: StructuredMode): Promise<boolean> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          temperature: 0,
          max_tokens: 16,
          response_format:
            mode === 'json_object'
              ? { type: 'json_object' }
              : { type: 'json_schema', json_schema: { name: 'probe', strict: true, schema: probeSchema } },
          messages: [{ role: 'user', content: 'Reply with the JSON object {"ok":true}.' }],
        }),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        throw new QwenError('AUTH', `Qwen rejected the credentials with HTTP ${res.status}`, res.status);
      }
      if (res.status === 429) {
        throw new QwenError('RATE_LIMITED', 'Qwen rate limited the probe', res.status);
      }
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  };

  if (await tryMode('json_schema')) return 'json_schema';
  if (await tryMode('json_object')) return 'json_object';
  throw new QwenError('CONFIG', `model ${input.model} accepted neither json_schema nor json_object response_format`);
}
