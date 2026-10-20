# O-Side

## What it is

O-Side is a proposed feature for Mirae Asset's investing app, built in this repo as a historical replay prototype. It replays daily broker data from 14 Aug to 23 Sep 2026 and shows, in plain words, who has been buying and selling a stock by broker channel: retail app brokers, institutional brokers, other/mixed brokers and unclassified. A stock is only worth a look when three layers line up: the story (news and filings), the transactions (broker flow) and the health of the company.

SINI (PT Singaraja Putra, Indonesia Stock Exchange) is the one real case. Eleven fictional sample instruments, always labelled as samples, cover four markets: SMPA to SMPE (Indonesia), SHKA and SHKB (Hong Kong), SKRA and SKRB (Korea), SCNA (Shanghai) and SCNB (Shenzhen).

It is a replay of captured data, not an operating brokerage: it sends no trading request and never gives buy or sell advice or price targets. The app is in English and Simplified Chinese.

## Screens

- **Brief** (`/`): portfolio value since the first purchase, a week strip with a "Select a date" calendar, then My Holdings and Watchlist with one headline per stock for the chosen day.
- **Live Radar** (`/stocks`): a legend for Accumulating, Mixed and Leaving; the radar beside "Stocks worth a look" (a scrollable list of the strongest signals); and a Search section that lists other stocks by score until you type.
- **Analysis page** (`/stock/:ticker`): company logo, close and a short summary; broker net flow for up to 3 brokers; the Flow card and a Sankey for the selected session; What was observed and Implications; Company Health (latest report against the previous one); and recent events. Clicking a highlighted number opens its proof: the total, each day adding up to it, the brokers behind it and the source. A back button returns to the page you came from.
- **Portfolio** (`/portfolio`): Portfolio Analytics (Performance against an index, Allocation pie), My Holdings, Watchlist and instrument search. A fresh visit starts on a labelled sample portfolio.
- **Research method** (`/research`): how it works and the three layers, how the Live Radar score works, data and limits, and what the AI does and does not do.
- **Guided tour** (`/tour`): six short steps across the Brief, the analysis page, Live Radar and Portfolio.

## Setup

1. Install Node.js 20 or newer (the repo is developed on Node 24).
2. `npm install`
3. `npm run dev`
4. Open http://localhost:5173
5. Add `?demo=1` to the URL, or press Start tour on the Guided tour page, for the guided tour.

The app runs fully static from the data in `public/data/` and the TypeScript data modules. No server or API key is needed to use any screen.

## How the text is written

Every sentence on screen (headlines, What was observed, Implications, the summary under the price) is written by fixed templates from the data, so every number is real and traceable. Qwen does not write any of it today.

The repo also contains a Qwen explain server (`server/`, `POST /api/explain`) that asks Qwen to choose approved claims and checks every answer against the facts before it could be shown. No screen calls it at the moment, so adding a Qwen key alone changes nothing in the app. Connecting it is open work.

## Live Radar score

Each stock gets a score from 0 to 100 from fixed, graded checks: 50% transactions (institutional net buying over the window and the last 5 sessions, persistence, spread across brokers, no quick flips, no handover to retail apps), 30% company health (equity, equity growth, debt, core profit, operating cash, short-term cover) and 20% events (how fresh the latest story and health news are). Labels are Accumulating, Mixed, Leaving and No signal. The full rule is on the Research method page and in `src/engine/radarScore.ts`.

## Environment

The server reads `.env` from this folder (next to `package.json`); `.env.example` lists every key. Values already set in the environment win.

- `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`, `QWEN_STRUCTURED_MODE`: Qwen settings for the explain server and the saved-answer generator.
- `DEMO_TOKEN`: the token a client must send to the explain server.
- `LIVE_ENABLED`: `true` turns on the live Qwen path; anything else returns an honest LIVE_DISABLED response.
- `ALLOWED_ORIGIN`: exact frontend origin for CORS headers; empty sends none.
- `QUOTE_ENABLED`, `QUOTE_CHART_BASE_URL`, `QUOTE_SEARCH_BASE_URL`, `QUOTE_TIMEOUT_MS`: the optional server-side market-data adapter (Yahoo by default). The browser never calls a provider directly.

`.env` is git-ignored. Never commit it or paste its values anywhere. Secrets live only in the server process, never in `VITE_*` variables, public JSON or the frontend bundle.

## Commands

- `npm run dev`: Vite dev server on http://localhost:5173 (the app only).
- `npm run build`: type-checks the app and the server, then builds `dist/`.
- `npm run typecheck`: type-checks the app only.
- `npm test`: runs the Vitest unit suite once.
- `npm run test:e2e`: runs the Playwright suite.
- `npm run build:data`: regenerates the SINI dataset in `public/data/` from the raw capture.
- `npx tsx scripts/build-sample-fixtures.ts`: regenerates the eleven fictional instruments and the SMPLIDX index (deterministic).
- `npm run generate:saved-answers`: calls Qwen and writes saved answer plans (needs `QWEN_API_KEY`).
- `npm run serve`: runs the explain and provider server on port 8787.

## Prices and portfolio analytics

- **Closes on the analysis page and Live Radar**: SINI uses Yahoo Finance adjusted daily closes copied into `src/data/staticCloses.ts` (no runtime fetch). The samples use their own fictional `prices.json`.
- **Portfolio Analytics** values owned holdings as a current-holdings model: quantities are fixed, so value = sum(quantity × close) with no trades, cash, dividends or fees. A fully fictional portfolio is compared with the fictional SMPLIDX index; a fully real one with `^JKSE` through the server adapter. A mix of fictional and real, or of currencies (IDR, HKD, KRW, CNY), gets no comparison, because there is no FX source. When something is missing, the card says what instead of hiding holdings.

## Folder map

- `src/screens`: Brief, Live Radar (`StocksScreen.tsx`), analysis page (`StockScreen.tsx`), Portfolio, Research method, Guided tour.
- `src/components`: app shell, radar, evidence proof drawer, company health, logos, charts (`charts/`), calendars, dialogs and the tour coach.
- `src/engine`: pure computation with no UI: facts, flows, predicates, insights, radar score, stock view, evidence, portfolio, context.
- `src/data`: data loading and schemas, instruments, company health, copied closes, currency formatting.
- `src/ai`: claim registry and templates, saved-plan loader, live client and the response validator.
- `src/i18n`, `src/store`: English and Chinese copy, and the single Zustand store.
- `server`: the explain API (config, auth, Qwen adapter, .env loader), the market-data adapter and the Function Compute adapter.
- `scripts`: SINI data build, sample fixture generator, saved-answer generation.
- `public/data`: generated datasets per instrument (`rows`, `sessions`, `events`, `validation`, plus `prices` for the samples and SMPLIDX), `brokers.json` and `manifest.json`. `public/logos`: the SINI logo.
- `docs`: decision log (`decisions.md`), deployment notes (`deploy-fc.md`), release-check report.

## Data limits

- Only the biggest brokers each day are visible: the top 9 buyers and sellers in Indonesia, 6 in Hong Kong and 5 in Korea. China's Dragon Tiger List shows the top 5 only on big-move days, so other days have no data. Lots outside the list go to Unclassified, so groups still add up. A broker not listed is unknown, not zero.
- SINI broker data comes from Stockbit broker summary screenshots. 13 Aug 2026 is excluded (overlapping screenshots put brokers on both sides) and 8 Sep 2026 was not captured.
- SINI company health uses the filed Q1 and Q2 2026 statements. The samples' health reports are fictional.
- Replay rule: a trading day's broker data counts as public only from the next day, and reports and news from their publication date, so a view pinned to an earlier date cannot see later facts.
