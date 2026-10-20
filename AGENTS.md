# O-Side: Qoder project instructions

## Product and current scope

O-Side is a proposed feature for Mirae Asset's investing app, implemented as a historical replay prototype. It shows who has been buying and selling a stock by broker channel (retail app, institutional, other/mixed, unclassified) and checks that flow against company health and news. It explains visible broker-channel flows with evidence, not customer identity or trade recommendations. Preserve the submitted positioning and distinguish implemented functionality from proposals.

Current surfaces (routes in src/App.tsx):

| Route | Screen | What it shows |
|---|---|---|
| / | Brief (BriefScreen.tsx) | Portfolio value since the first purchase, a week strip and "Select a date" calendar, then My Holdings and Watchlist with one rule-based headline per stock |
| /stocks | Live Radar (StocksScreen.tsx) | Three-label legend, the radar animation beside "Stocks worth a look" (score above 75, at most 6, scrollable), and a Search section listing 8 other stocks by score |
| /stock/:ticker | Analysis page (StockScreen.tsx) | Logo, close and summary; broker net flow for up to 3 brokers; Flow card for the selected session; session Sankey; What was observed and Implications; Company Health; Events |
| /portfolio | Portfolio (PortfolioScreen.tsx) | Portfolio Analytics (Performance and Allocation pie), My Holdings, Watchlist and instrument search |
| /research | Research method (ResearchScreen.tsx) | How it works and the three layers, the Live Radar score, data and limits, what the AI does and does not do |
| /tour | Guided tour (GuidedTourScreen.tsx) | Six-step coach (components/DemoCoach.tsx) across Brief, analysis, Live Radar and Portfolio |

/method redirects to /research. There is no /import route. The analysis page has a back button and keeps the section it was opened from highlighted in the navigation.

Data covers 14 August to 23 September 2026. SINI is the one real case. Eleven fictional sample instruments sit on four markets: SMPA to SMPE (Indonesia), SHKA and SHKB (Hong Kong), SKRA and SKRB (Korea), SCNA (Shanghai) and SCNB (Shenzhen); China samples are captured only on big-move (Dragon Tiger List) days. Company health compares the Q2 2026 report with Q1 2026 (real for SINI, fictional and labelled for the samples). Portfolio analytics model fixed current owned quantities, not actual historical account returns.

All on-screen text, including headlines, What was observed, Implications and the summary, is written by fixed templates from the data. Qwen is not called by any screen today: the server path exists, but no rendered component uses it (see Known gaps).

Locales are en and zh-CN. A fresh visit defaults to English; a persisted explicit choice wins. Indonesian was removed from the interface on 2026-10-20; the stored facts, claims and events still carry an Indonesian copy because the data schema requires it, built through the separate `ContentLocale` type.

## Read the smallest relevant context

Start with this file and the always-on core and workflow rules. Before changing a subsystem, read its rule even if automatic file-scoped loading has not occurred:

| Task | Rule under .qoder/rules/ | Main entry points |
|---|---|---|
| Every task | other-side.md, workflow.md | package.json; relevant current code |
| Broker data, replay, facts, evidence | broker-replay.md | src/data/publicData.ts; src/engine/stockView.ts; src/engine/facts.ts; src/engine/evidence.ts; scripts/build-data.ts; scripts/build-sample-fixtures.ts |
| Live Radar score | broker-replay.md | src/engine/radarScore.ts; src/screens/StocksScreen.tsx; src/components/RadarSweep.tsx; src/i18n/radarCopy.ts |
| Company health | broker-replay.md | src/data/companyHealth.ts; src/components/CompanyHealth.tsx |
| AI answers, claims, context identity | ai-claims.md | src/ai/claims.ts; src/ai/templates.ts; src/ai/validate.ts; src/engine/context.ts; server/explain.ts; server/qwen.ts |
| Portfolio, market prices, provider APIs | portfolio-provider.md | src/engine/portfolio.ts; src/data/portfolioPrices.ts; src/data/staticCloses.ts; src/data/money.ts; server/quotes.ts |
| Screens, charts, copy, accessibility | ui-localization.md | src/App.tsx; src/screens/; src/components/; src/i18n/; src/store/contextStore.ts |

README.md describes the current setup and feature set. Read only the relevant dated sections in docs/decisions.md. Caution: the entries dated 17 to 19 October 2026 describe files and names that are not in this code (for example RadarScreen.tsx, health.json, PX-CLOSE, SMPH/SMPK/SMPX); trust the code over those entries. docs/release-check.md is a dated report, not proof that the current revision passes. Read docs/deploy-fc.md only for deployment work. If code and accepted requirements disagree, report the mismatch rather than silently changing the product contract.

## Architecture and ownership

- data/raw/ holds captures and labelled fixtures. scripts/ produces public/data/ documents and manifest versions; scripts/build-sample-fixtures.ts generates the eleven fictional instruments and SMPLIDX deterministically. Preserve provenance and regenerate through the relevant script rather than hand-editing generated numbers.
- src/data/ validates and loads datasets, instrument metadata (instruments.ts, including SAMPLE_PORTFOLIO), company health (companyHealth.ts), copied SINI closes (staticCloses.ts, Yahoo Finance adjusted closes) and currency formatting (money.ts: IDR, HKD, KRW, CNY). src/engine/ owns pure calculations, facts, predicates, replay cutoffs, evidence, flow summaries (insights.ts) and the radar score (radarScore.ts: 50% transactions, 30% health, 20% events). Keep business arithmetic out of screens.
- src/ai/ owns approved claims, reviewed templates, saved plans, the live client and the shared response validator. Qwen selects approved claim IDs and wording variants; the app owns facts, numbers and rendered wording.
- src/store/contextStore.ts is the single Zustand store, including `selectedSessionDate`, which keeps the Brief and the analysis page on the same session. src/engine/context.ts owns analytical and portfolio identity. Reject stale asynchronous responses rather than attaching them to changed inputs.
- src/screens/ and src/components/ render engine outputs. Evidence opens only on the analysis page: components/EvidenceDrawer.tsx shows a number as a proof (the total, each day adding up to it, the brokers behind it, the source) for the clicked group or broker. Group colours live in components/groupColours.ts; company logos in components/CompanyLogo.tsx (SINI uses public/logos/SINI.png, the samples use invented SVG marks). Page copy lives in TS copy modules (briefCopy, analysisCopy, insightCopy, radarCopy, research, methodCopy, tourCopy) and in src/i18n/en.json and zh-CN.json.
- server/ authenticates requests and calls Qwen and market-data providers. Browser code must not receive provider credentials or call providers directly.

Several older components are no longer imported by any screen and are kept only until the team prunes them: ImportScreen, EvaluatorSettings, ExploreLauncher, ThesisChips, OtherSideCard, FocusView, ProviderPanel, SessionScrubber, BriefingPreview, ProxyChart, ReplayRadar, ClaimCheck, WhatIfPanel and TradeContextSheet. Do not extend them without checking they are reachable.

Use the existing React 18, strict TypeScript, Vite, Tailwind, Recharts, React Router, Zustand and Ajv architecture. Preserve the lockfile. Avoid new dependencies or architectural rewrites unless needed by the assigned task and justified in the plan.

## Commands, run from this directory

| Command | Purpose and effect |
|---|---|
| npm run dev | Vite development server, normally port 5173; serves the app only, not the explain server |
| npm run serve | Local explain/provider server, normally port 8787; loads environment configuration |
| npm run build | Checks app and server types, then writes dist/; default final implementation check |
| npm run typecheck | Checks app types only (tsconfig.app.json); does not replace the final build. `tsc -p .` checks nothing because the root tsconfig only holds references |
| npm run preview | Serves the production build |
| npm run build:data | Writes public/data/ from source inputs; use only for assigned data changes |
| npm run generate:saved-answers | Calls Qwen and writes saved plans; requires explicit task authorization |
| npm test | Unit suite, run by the team during review by default |
| npm run test:e2e | Playwright suite, run by the team during review by default |

Node.js 20 or newer is documented; the project was developed on Node 24. Use the existing environment. Do not install tools just to expand verification.

The server reads `.env` from this folder (server/loadEnvFile.ts resolves `server/../.env`). Variables already set in the environment win. `.env.example` lists the keys.

## Parallel work

For parallel subagent work, use the project skill at .qoder/skills/spawn-agents/SKILL.md, invoked as /spawn-agents or through its matching task description. Choose supported models deliberately, assign non-overlapping file ownership and integrate results in the main session. Project testing and write boundaries apply to every worker.

## Verification and known baseline

For implementation tasks, run a final successful npm run build. The team handles tests and browser checks by default unless the current task explicitly assigns them to Qoder. Do not create or modify tests under the default policy; preserve their ability to compile. A build is not behavioral verification.

As of 20 October 2026, `npm test` reports 7 failing unit tests out of 233, all predating the current redesign: buildApprovedClaims "flips the institution thesis on 23 Sep", tradeContext "sell simulation at 24 Aug", AppShell "falls back to manifest dataThrough", TradeContextSheet sell and buy sheets, and WhatIfPanel English (two). Most cover components no screen renders. Do not weaken tests to conceal disagreements or reuse an older passing report as current evidence. Live-provider access and deployment claims also require actual current evidence.

## Known gaps

- Qwen is not wired to any screen. The only caller of the live client (ThesisChips) is not rendered, `npm run dev` does not start or proxy the explain server, the server needs `LIVE_ENABLED=true` and a demo token, and no screen can enter that token since the evaluator settings were removed.
- A SINI holding in Portfolio Analytics still prices through the server provider adapter; only the analysis page and Live Radar read the copied SINI closes. The default sample portfolio (SMPA, SMPB owned) works offline against SMPLIDX.
- Holdings in HKD, KRW or CNY cannot join an IDR portfolio; the analytics engine refuses mixed currencies because there is no FX source.

Finish implementation tasks with changed files, the actual build command and outcome, unverified behavior, and specific acceptance cases for team review. Record material implementation decisions in docs/decisions.md. Do not modify these instructions or rules just to make a task pass.
