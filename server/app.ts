// Builds the platform-neutral POST /api/explain handler from process.env.
// Shared by the local dev server (index.ts) and the Function Compute
// web-function entry (fc.ts). Secrets are read here only, never from requests.
import { loadConfig, type ServerConfig } from './config';
import { loadServerData } from './data';
import { createExplainHandler } from './explain';
import { createProviderHandler, isProviderPath } from './providerApi';
import { createQwenProvider, probeStructuredOutputMode, QwenError, type QwenProvider } from './qwen';
import { createQuoteAdapterFromEnv, createProviderTracker } from './quotes';
import type { PlatformHandler } from './nodeHttp';

export async function resolveProvider(config: ServerConfig): Promise<QwenProvider | null> {
  if (!config.liveEnabled) {
    console.log('live mode disabled (LIVE_ENABLED is not "true"); the endpoint answers LIVE_DISABLED.');
    return null;
  }
  if (config.qwen.apiKey === '') {
    console.error('LIVE_ENABLED is true but QWEN_API_KEY is missing; refusing to start live mode.');
    return null;
  }
  const structuredMode =
    config.qwen.structuredMode ??
    (await probeStructuredOutputMode({
      baseUrl: config.qwen.baseUrl,
      apiKey: config.qwen.apiKey,
      model: config.qwen.model,
      timeoutMs: config.qwen.upstreamTimeoutMs,
    }).catch((error: unknown) => {
      const reason = error instanceof QwenError ? `${error.code}: ${error.message}` : String(error);
      console.error(`structured-output probe failed for model ${config.qwen.model}: ${reason}`);
      console.error('set QWEN_STRUCTURED_MODE=json_object or json_schema explicitly after checking the model docs.');
      return null;
    }));
  if (structuredMode === null) {
    console.error('live mode disabled: no working structured-output mode was found.');
    return null;
  }
  console.log(`live mode ready: model ${config.qwen.model}, structured output ${structuredMode}`);
  return createQwenProvider({
    baseUrl: config.qwen.baseUrl,
    apiKey: config.qwen.apiKey,
    model: config.qwen.model,
    structuredMode,
  });
}

export async function buildExplainHandlerFromEnv(): Promise<PlatformHandler> {
  const config = loadConfig(process.env);
  const data = loadServerData(config.ticker);
  const provider = await resolveProvider(config);
  if (config.demoToken === '') {
    console.error('DEMO_TOKEN is not set; every request will be rejected as UNAUTHORIZED.');
  }
  return createExplainHandler({
    data,
    provider,
    demoToken: config.demoToken,
    allowedOrigin: config.allowedOrigin,
    upstreamTimeoutMs: config.qwen.upstreamTimeoutMs,
  });
}

// One handler for the whole API surface. The provider adapter is optional: when
// QUOTE_ENABLED is not "true" the tracker reports a disabled deployment instead
// of pretending a connection exists.
export async function buildApiHandlerFromEnv(): Promise<PlatformHandler> {
  const config = loadConfig(process.env);
  const explain = await buildExplainHandlerFromEnv();
  const adapter = createQuoteAdapterFromEnv(process.env);
  if (adapter === null) {
    console.log('quote provider disabled (QUOTE_ENABLED is not "true"); /api/quote answers DISABLED.');
  }
  const provider = createProviderHandler({
    tracker: createProviderTracker(adapter),
    demoToken: config.demoToken,
    allowedOrigin: config.allowedOrigin,
    upstreamTimeoutMs: config.quoteTimeoutMs,
  });
  return async function handleApi(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    return isProviderPath(pathname) ? provider(request) : explain(request);
  };
}
