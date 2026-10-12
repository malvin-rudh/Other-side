# Other Side

## What it is

Other Side is a proposed feature for Mirae Asset's investing app, built in this repo as an Indonesia-first historical prototype. It replays the daily broker summary for SINI over 14 Aug to 23 Sep 2026 and explains in plain words who has been buying and selling the stock by broker channel, at roughly what net-flow implied price references, and when that starts to change. It is a historical replay of captured data, not an operating brokerage: it sends no trading request, and it never gives trade instructions, price targets, or stock rankings.

## Setup

1. Install Node.js 20 or newer (the repo is developed and verified on Node 24).
2. `npm install`
3. `npm run dev`
4. Open http://localhost:5173
5. Add `?demo=1` to the URL for the guided demo tour (Next, Back, Hide buttons walk through the screens on pinned replay dates).

The frontend runs fully static from captured data. You only need the server (and a Qwen API key) if you want live Qwen answers; rule-based previews and saved answers work without it.

## Environment

Copy `.env.example` to `.env` at the repo root and fill in the values you need:

- `QWEN_API_KEY`: key for the Qwen compatible endpoint, used by the local server and by the saved-answer generator.
- `QWEN_MODEL`: model name, for example `qwen-plus`.
- `DEMO_TOKEN`: the token the evaluator types in the app UI; the app keeps it in memory and sends it in the Authorization header.
- `LIVE_ENABLED`: `true` turns on the live Qwen path; anything else serves an honest LIVE_DISABLED response.
- `ALLOWED_ORIGIN`: exact frontend origin for CORS headers, for example `http://localhost:5173`; empty sends no CORS headers.
- `QUOTE_ENABLED`: `true` turns the market-data provider adapter on; anything else answers DISABLED and the UI reports an honest unavailable state.
- `QUOTE_CHART_BASE_URL`, `QUOTE_SEARCH_BASE_URL`, `QUOTE_TIMEOUT_MS`: provider endpoints and timeout for the adapter; point them at a licensed vendor to replace Yahoo. The adapter runs only on the server; the browser never calls the provider directly.

`.env` is git-ignored. Never commit it, and never paste its values into chat, tickets, or any other file. Secrets live only in the server process or your local generation environment, never in `VITE_*` variables, public JSON, or the frontend bundle.

## Commands

- `npm run dev`: Vite dev server on http://localhost:5173.
- `npm run build`: type-checks the app and the server, then builds the production bundle into `dist/`.
- `npm test`: runs the Vitest unit suite once.
- `npm run build:data`: regenerates the public dataset in `public/data/` from the raw capture (sessions, broker rows, events, validation report).
- `npm run generate:saved-answers`: calls Qwen with reviewed prompts and writes saved answer plans for curated questions (needs `QWEN_API_KEY` in `.env`).
- `npm run serve`: runs the local explain API, a `POST /api/explain` endpoint on port 8787; it loads `.env` at startup and never prints values.

## Answer modes and badges

- **Rule-based preview**: computed locally from the approved claims registry, with the same wording and caveats in English and Bahasa Indonesia. Badge: "Rule-based preview".
- **Saved Qwen answer**: a curated answer authored by Qwen ahead of time and stored as a plan file. It loads only when the question and the full replay context match exactly, and it still passes the same response validator before rendering. Badge: "Saved Qwen answer · replay".
- **Live Qwen**: answered at request time by Qwen through the local server, only when `LIVE_ENABLED=true` and the request carries a valid demo token. If live is disabled or the token is missing, the UI shows an honest unavailable message plus suggested questions. Badge: "Live Qwen · historical data".

## Price history and portfolio analytics

The optional provider adapter also serves `GET /api/provider/history` (same demo token, range one of `1mo`, `3mo`, `6mo`, `1y`). It returns dated daily OHLCV bars with the symbol, currency, exchange timezone, source, fetch time and a `provider-daily-unadjusted` price basis: bars are exactly as the provider reports them, with no split or dividend adjustment, dated in the exchange's own timezone, and null fields mean unknown, never zero. The server and the client both validate symbol match, date ordering and finiteness, and refuse any other price basis. Answers are cached in memory for at most 10 minutes with the original fetch time kept, so stale bars are never shown as fresh. Yahoo is an opt-in, server-side adapter behind explicit registry symbols, not a guaranteed public API; the fictional SMPA, SMPB and SMPC never route to it, and no broker implied-price proxy is ever used as a market close.

Portfolio analytics value owned holdings only, as a current-holdings model: quantities are held fixed, so V(t) = sum(quantity x close) with no trades, cash, dividends, fees or rights subscriptions. The first version supports complete IDR portfolios and uses `^JKSE` as the price-return benchmark; mixed currencies need an FX source this prototype does not have, and real provider bars are never summed with the fictional sample fixtures. An N-session change needs N+1 completed common closes. When quantity, price coverage or currency support is incomplete, the card says what is missing instead of silently omitting holdings. The analytics card offers Performance, Allocation and Contribution tabs plus "Explain my portfolio", a rule-based preview over registered portfolio facts and claims; a separate sample analytics preset (SMPA and SMPB with fictional prices, benchmarked against the fictional SMPLIDX index, never labelled IHSG) demonstrates the layer offline and asks for confirmation before replacing saved holdings.

## Folder map

- `src/engine`: pure computation over the rows, with no UI: facts, flows, predicates, stock view, timeline, brief, what-if, evidence, context.
- `src/ai`: claim registry and templates, saved-plan loader, live client, and the single response validator used by every answer path.
- `src/screens`: routed screens (Brief, Stock, Method, Import).
- `src/components`: shared UI such as the app shell, evidence drawer, trade-context sheet, demo coach, and charts.
- `src/i18n`, `src/store`, `src/data`: bilingual strings and `t()` helper, the single Zustand context store, and runtime data loading plus schemas.
- `server`: the local explain API (config, auth, Qwen adapter, .env loader) and the Function Compute adapter for deployment.
- `scripts`: data build and saved-answer generation.
- `docs`: decision log (`decisions.md`), deployment notes (`deploy-fc.md`), release-check report.
- `public/data`: generated dataset consumed by the frontend (`sessions.json`, `rows.json`, `events.json`, `brokers.json`, `manifest.json`).

## Data limits

- Source: Stockbit broker summary, NET mode, visible top nine brokers per side per session; the side supplies the sign. A broker missing from the visible list is unknown, not zero.
- 13 Aug 2026 is quarantined (overlapping screenshots put brokers on both sides); its rows are excluded, never netted.
- 8 Sep 2026 was not captured and is treated as missing.
- Replay rule: broker data for session D is assumed available at D+1 00:00 WIB, so a view pinned to an earlier session cannot show later-published facts, events, or claims.
