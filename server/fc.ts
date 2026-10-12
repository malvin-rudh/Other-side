// Alibaba Cloud Function Compute HTTP-trigger entry (Node.js web function).
// The handler is built ONCE per instance from function environment variables
// (secrets included) and reused across invocations; each request is still
// answered by the same platform-neutral explain handler as the local server.
// Deploy steps and throttling guidance: docs/deploy-fc.md.
import type http from 'node:http';
import { buildApiHandlerFromEnv } from './app';
import { loadConfig } from './config';
import { hasValidDemoToken } from './explain';
import { handleNodeRequest, type PlatformHandler } from './nodeHttp';

const config = loadConfig(process.env);
const handlerPromise: Promise<PlatformHandler> = buildApiHandlerFromEnv();

export default async function handler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  _context: unknown,
): Promise<void> {
  const explain = await handlerPromise;
  handleNodeRequest(req, res, explain, {
    isAuthorized: (authorization) => hasValidDemoToken(authorization, config.demoToken),
  });
}
