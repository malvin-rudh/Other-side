# Deploying POST /api/explain to Alibaba Cloud Function Compute

This document describes how the live Qwen handler (`server/explain.ts`, via
`server/fc.ts`) is deployed as one Alibaba Cloud Function Compute (FC) HTTP
endpoint, and how the frontend reaches it.

## What runs

- `server/fc.ts` is the FC entry. It builds the platform-neutral explain
  handler ONCE per instance from function environment variables and reuses it
  across invocations. The request adapter in `server/nodeHttp.ts` maps the
  Node-style `(req, res)` web-function stream onto the same `Request ->
  Response` handler used by the local dev server (`npm run serve`).
- The frontend talks to the endpoint through `src/ai/liveClient.ts`. The
  endpoint URL is typed into the Thesis check panel (kept in the in-memory
  Zustand store only) so one build can point at any deployment.

## Local run

`npm run serve` starts the local server (`server/index.ts`). At startup it
loads the repo-root `.env` file (gitignored; copy `.env.example` and fill in
`DEMO_TOKEN`, `LIVE_ENABLED`, `QWEN_API_KEY` and friends). Values are never
printed, and variables already set in the real environment take precedence
over the file. On Function Compute no `.env` is read: the function
environment variables below are the only configuration.

## Function configuration

Runtime and packaging:

1. Create a Node.js function (web function style, HTTP trigger). FC custom
   runtimes also work, but the managed Node runtime is the supported path.
2. Use a supported Node LTS runtime (Node 18 or newer; the repo builds and
   tests on Node 24).
3. Code entry: the compiled `server/fc.ts` default export. Package the
   `server/` sources plus production dependencies; do NOT bundle
   `public/data` into the frontend artefact, the server loads the bundled
   dataset itself (`server/data.ts`).

Environment variables (function configuration, never in the repo):

- `DEMO_TOKEN` - the evaluator-typed demo token. Compared in constant time
  against the `Authorization: Bearer ...` header. If empty, every request is
  rejected `UNAUTHORIZED`.
- `LIVE_ENABLED` - must be exactly `true` for live answers. Anything else
  makes the endpoint answer `LIVE_DISABLED` (503).
- `QWEN_API_KEY` - Alibaba Cloud Model Studio API key, server side only.
- `QWEN_MODEL` - pinned model ID (default `qwen-plus`). Pin the exact
  deployment version before going live.
- `QWEN_STRUCTURED_MODE` - `json_schema` or `json_object`. Leave empty to
  probe at cold start; set explicitly once verified.
- `QWEN_BASE_URL`, `QWEN_TIMEOUT_MS` - override only if needed.
- `TICKER` - bundled dataset ticker (default `SINI`).
- `ALLOWED_ORIGIN` - the exact frontend origin, e.g.
  `https://<your-site>.qoder.site`. Only this origin receives CORS headers.

Concurrency and throttling:

- Set a reserved/max instance count that matches the Model Studio rate limit;
  FC concurrency multiplied by in-flight calls must stay under the model
  quota. Start with 1-2 instances and a small concurrency per instance.
- Configure FC throttling (max requests per second) so a burst returns FC's
  own 429 instead of exhausting the upstream model quota.

## Authentication vs CORS

Authentication is ONLY the `Authorization: Bearer <DEMO_TOKEN>` header checked
by the handler. CORS headers exist so the browser can read the response; they
are not authentication and are emitted only for the exact `ALLOWED_ORIGIN`.
Do not add additional origins.

## Response contract

Success: 200 with `{ requestId, contextKey, versions, mode: 'live', model,
generatedAt, usage, plan }`. The client accepts the envelope only when the
echoed `contextKey` and the sent `request_id` both match; anything else is
treated as stale and the UI falls back per the saved-answer rules.

Safe error codes: `UNAUTHORIZED` 401, `BAD_REQUEST` 400, `RATE_LIMITED` 429,
`INSUFFICIENT_DATA` 404, `UPSTREAM_TIMEOUT` 504, `VALIDATION_REJECTED` 502,
`LIVE_DISABLED` 503.

## Verification receipts

After deployment, capture three sanitized receipts (model, context key,
validation result, token counts; no prompts, no secrets) from:

1. an authenticated live answer in a fresh browser session,
2. an unauthenticated request (expected `UNAUTHORIZED`),
3. a timeout or validation-rejection path (expected `UPSTREAM_TIMEOUT` or
   `VALIDATION_REJECTED`).

Save them under `docs/ai-receipts/`. See docs/decisions.md for the current
status: no Alibaba Cloud account credentials are available in this
environment, so deployment and receipts are pending and are NOT fabricated.
