// Server configuration from process.env only. Secrets never come from the
// request, from VITE_* variables or from any committed file.
import type { StructuredMode } from './qwen';

export interface ServerConfig {
  ticker: string;
  port: number;
  demoToken: string;
  liveEnabled: boolean;
  allowedOrigin: string | null;
  quoteTimeoutMs: number;
  qwen: {
    baseUrl: string;
    apiKey: string;
    model: string;
    structuredMode: StructuredMode | null;
    upstreamTimeoutMs: number;
  };
}

export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const structured = env.QWEN_STRUCTURED_MODE;
  return {
    ticker: env.TICKER ?? 'SINI',
    port: Number.parseInt(env.PORT ?? '8787', 10),
    demoToken: env.DEMO_TOKEN ?? '',
    liveEnabled: env.LIVE_ENABLED === 'true',
    allowedOrigin: env.ALLOWED_ORIGIN ?? null,
    quoteTimeoutMs: Number.parseInt(env.QUOTE_TIMEOUT_MS ?? '8000', 10),
    qwen: {
      baseUrl: (env.QWEN_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
      apiKey: env.QWEN_API_KEY ?? '',
      model: env.QWEN_MODEL ?? 'qwen-plus',
      structuredMode: structured === 'json_schema' || structured === 'json_object' ? structured : null,
      upstreamTimeoutMs: Number.parseInt(env.QWEN_TIMEOUT_MS ?? '10000', 10),
    },
  };
}
