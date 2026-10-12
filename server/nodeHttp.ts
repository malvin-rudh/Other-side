// Shared plumbing that adapts a platform-neutral Request -> Response handler
// onto Node-style (req, res) streams. Used by the local dev server (index.ts)
// and by the Alibaba Function Compute web-function entry (fc.ts).
import type http from 'node:http';

export type PlatformHandler = (request: Request) => Promise<Response>;

export const DEFAULT_MAX_BODY_BYTES = 8192;

export interface NodeHttpOptions {
  maxBodyBytes?: number;
  isAuthorized?: (authorizationHeader: string | null) => boolean;
}

const json = (status: number, payload: unknown, res: http.ServerResponse): void => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

export function handleNodeRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  handler: PlatformHandler,
  options: NodeHttpOptions = {},
): void {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const hasBody = !['GET', 'HEAD'].includes(req.method ?? '');

  // Reject unauthorized body-bearing requests before buffering anything, and
  // drain the socket so the client is not left hanging.
  if (hasBody && options.isAuthorized && !options.isAuthorized(req.headers.authorization ?? null)) {
    req.resume();
    json(401, { error: 'UNAUTHORIZED', requestId: null }, res);
    return;
  }

  const chunks: Buffer[] = [];
  let received = 0;
  let tooLarge = false;
  req.on('data', (chunk: Buffer) => {
    if (tooLarge) return;
    received += chunk.length;
    if (received > maxBodyBytes) {
      tooLarge = true;
      req.resume();
      json(400, { error: 'BAD_REQUEST', requestId: null }, res);
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooLarge || res.writableEnded) return;
    const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    handler(request)
      .then(async (response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        const body = await response.arrayBuffer();
        res.end(Buffer.from(body));
      })
      .catch((error: unknown) => {
        console.error(error);
        json(500, { error: 'UPSTREAM', requestId: null }, res);
      });
  });
  req.on('error', () => {
    if (res.writableEnded) return;
    json(400, { error: 'BAD_REQUEST', requestId: null }, res);
  });
}
