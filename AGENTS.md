# Other Side: Qoder project instructions

## Product and current scope

Other Side is a proposed feature for Mirae Asset's investing app, implemented as an Indonesia-first historical prototype. It explains visible broker-channel flows with evidence, not customer identity or trade recommendations. Preserve the submitted positioning and distinguish implemented functionality from proposals.

Current surfaces are Brief (/), Stocks (/stocks), Portfolio (/portfolio), Stock (/stock/:ticker), Method (/method), Research (/research), Guided Tour (/tour) and Import (/import). The core verified case is SINI, 14 August to 23 September 2026. Fictional sample fixtures and optional provider market data are distinct modes. Portfolio analytics model fixed current owned quantities, not actual historical account returns. Company-health screening and a market-wide scan remain proposed.

Locales are en, id and zh-CN. A fresh visit defaults to Simplified Chinese; a persisted explicit choice wins. This is intentional.

## Read the smallest relevant context

Start with this file and the always-on core and workflow rules. Before changing a subsystem, read its rule even if automatic file-scoped loading has not occurred:

| Task | Rule under .qoder/rules/ | Main entry points |
|---|---|---|
| Every task | other-side.md, workflow.md | package.json; relevant current code |
| Broker data, replay, facts, evidence | broker-replay.md | src/data/publicData.ts; src/engine/stockView.ts; src/engine/facts.ts; scripts/build-data.ts |
| AI answers, claims, context identity | ai-claims.md | src/ai/claims.ts; src/ai/templates.ts; src/ai/validate.ts; src/engine/context.ts; server/explain.ts |
| Portfolio, market prices, provider APIs | portfolio-provider.md | src/engine/portfolio.ts; src/engine/portfolioFacts.ts; src/data/portfolioPrices.ts; src/data/historyValidation.ts; server/quotes.ts |
| Screens, charts, copy, accessibility | ui-localization.md | src/App.tsx; src/screens/; src/components/; src/i18n/; src/store/contextStore.ts |

Read only the relevant dated sections in docs/decisions.md. They explain accepted changes and limitations. README.md is a setup guide; its old bilingual descriptions and partial screen list are not the current feature inventory. docs/release-check.md is a dated report, not proof that the current revision passes. Read docs/deploy-fc.md only for deployment work. If code and accepted requirements disagree, report the mismatch rather than silently changing the product contract.

## Architecture and ownership

- data/raw/ holds captures and labelled fixtures. scripts/ produces public/data/ documents and manifest versions. Preserve provenance and regenerate through the relevant script rather than hand-editing generated numbers.
- src/data/ validates and loads datasets, instrument metadata and provider responses. src/engine/ owns pure calculations, facts, predicates, replay cutoffs and evidence. Keep business arithmetic out of screens.
- src/ai/ owns approved claims, reviewed templates, saved plans, the live client and the shared response validator. Qwen selects approved claim IDs and wording variants; the app owns facts, numbers and rendered wording.
- src/store/contextStore.ts is the single Zustand store. src/engine/context.ts owns analytical and portfolio identity. Reject stale asynchronous responses rather than attaching them to changed inputs.
- src/screens/ and src/components/ render engine outputs and evidence. src/i18n/ owns translations. Existing CSS and chart helpers own visual conventions.
- server/ authenticates requests and calls Qwen and market-data providers. Browser code must not receive provider credentials or call providers directly.

Use the existing React 18, strict TypeScript, Vite, Tailwind, Recharts, React Router, Zustand and Ajv architecture. Preserve the lockfile. Avoid new dependencies or architectural rewrites unless needed by the assigned task and justified in the plan.

## Commands, run from this directory

| Command | Purpose and effect |
|---|---|
| npm run dev | Vite development server, normally port 5173 |
| npm run serve | Local explain/provider server, normally port 8787; loads environment configuration |
| npm run build | Checks app and server types, then writes dist/; default final implementation check |
| npm run typecheck | Checks app types only; does not replace the final build |
| npm run preview | Serves the production build |
| npm run build:data | Writes public/data/ from source inputs; use only for assigned data changes |
| npm run generate:saved-answers | Calls Qwen and writes saved plans; requires explicit task authorization |
| npm test | Unit suite, run by the team during review by default |
| npm run test:e2e | Playwright suite, run by the team during review by default |

Node.js 20 or newer is documented; the project was developed on Node 24. Use the existing environment. Do not install tools just to expand verification.

## Parallel work

For parallel subagent work, use the project skill at .qoder/skills/spawn-agents/SKILL.md, invoked as /spawn-agents or through its matching task description. Choose supported models deliberately, assign non-overlapping file ownership and integrate results in the main session. Project testing and write boundaries apply to every worker.

## Verification and known baseline

For implementation tasks, run a final successful npm run build. The team handles tests and browser checks by default unless the current task explicitly assigns them to Qoder. Do not create or modify tests under the default policy; preserve their ability to compile. A build is not behavioral verification.

As of the 11 October 2026 decision entries, seven pre-existing unit-test disagreements were recorded around the fresh locale and SSR expectations. They have not been independently rechecked by this setup. Do not weaken tests to conceal disagreements or reuse the 9 October passing report as current evidence. Live-provider access and deployment claims also require actual current evidence.

Finish implementation tasks with changed files, the actual build command and outcome, unverified behavior, and specific acceptance cases for team review. Record material implementation decisions in docs/decisions.md. Do not modify these instructions or rules just to make a task pass.
