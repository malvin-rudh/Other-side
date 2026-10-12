// GET surface for the market-data provider: connection status, one quote and
// one symbol search. Platform-neutral like /api/explain so the same handler runs
// locally and on Function Compute.
//
// Status is readable without a token because it only reports whether this
// deployment has ever reached the provider. The two routes that cause an
// upstream call require the same demo token as /api/explain, typed by the
// evaluator and sent in the Authorization header.
import { hasValidDemoToken } from './explain';
import type { PlatformHandler } from './nodeHttp';
import {
  isHistoryRange,
  QuoteError,
  type ProviderStatus,
  type ProviderTracker,
  type QuoteErrorCode,
} from './quotes';

export interface ProviderApiDeps {
  tracker: ProviderTracker;
  demoToken: string;
  allowedOrigin: string | null;
  upstreamTimeoutMs?: number;
}

export const DEFAULT_QUOTE_TIMEOUT_MS = 8_000;

const ERROR_STATUS: Record<QuoteErrorCode, number> = {
  DISABLED: 503,
  BAD_SYMBOL: 400,
  UNAVAILABLE: 404,
  UNREACHABLE: 502,
  UPSTREAM_TIMEOUT: 504,
};

function corsHeaders(request: Request, allowedOrigin: string | null): Record<string, string> {
  if (!allowedOrigin) return {};
  const origin = request.headers.get('origin');
  if (origin !== allowedOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

function json(status: number, payload: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
  });
}

export function isProviderPath(pathname: string): boolean {
  return pathname === '/api/quote' || pathname.startsWith('/api/provider');
}

export function createProviderHandler(deps: ProviderApiDeps): PlatformHandler {
  const timeoutMs = deps.upstreamTimeoutMs ?? DEFAULT_QUOTE_TIMEOUT_MS;

  return async function handleProvider(request: Request): Promise<Response> {
    const cors = corsHeaders(request, deps.allowedOrigin);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors });
    }
    if (request.method !== 'GET') {
      return json(405, { error: 'BAD_REQUEST', message: 'only GET is supported' }, cors);
    }

    const url = new URL(request.url);
    const status: ProviderStatus = deps.tracker.status();

    if (url.pathname === '/api/provider/status') {
      return json(200, status, cors);
    }

    if (!hasValidDemoToken(request.headers.get('authorization'), deps.demoToken)) {
      return json(401, { error: 'UNAUTHORIZED', message: 'missing or invalid demo token' }, cors);
    }

    try {
      if (url.pathname === '/api/quote') {
        const symbol = url.searchParams.get('symbol') ?? '';
        const quote = await deps.tracker.quote(symbol, timeoutMs);
        return json(200, { status: deps.tracker.status(), quote }, cors);
      }
      if (url.pathname === '/api/provider/search') {
        const matches = await deps.tracker.search(url.searchParams.get('q') ?? '', timeoutMs);
        return json(200, { matches }, cors);
      }
      if (url.pathname === '/api/provider/history') {
        const rangeParam = url.searchParams.get('range');
        if (rangeParam !== null && !isHistoryRange(rangeParam)) {
          return json(400, { error: 'BAD_REQUEST', message: 'range must be one of 1mo, 3mo, 6mo, 1y' }, cors);
        }
        const symbol = url.searchParams.get('symbol') ?? '';
        const history = await deps.tracker.history(symbol, rangeParam ?? '3mo', timeoutMs);
        return json(200, { status: deps.tracker.status(), history }, cors);
      }
      return json(404, { error: 'BAD_REQUEST', message: `unknown path ${url.pathname}` }, cors);
    } catch (error: unknown) {
      if (error instanceof QuoteError) {
        return json(
          ERROR_STATUS[error.code],
          { error: error.code, message: error.message, status: deps.tracker.status() },
          cors,
        );
      }
      return json(502, { error: 'UNREACHABLE', message: 'provider answer could not be read' }, cors);
    }
  };
}
