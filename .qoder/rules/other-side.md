# OTHER SIDE – PROJECT RULES (apply to every task)

WHAT WE ARE BUILDING
Other Side is an AI feature proposed for Mirae Asset's investing app. It watches the market's daily broker data and explains in plain words who has been buying and selling a stock (by broker channel), at roughly what implied prices, and when that starts to change. This repo is an Indonesia-first historical prototype (SINI, 14 Aug–23 Sep 2026), not an operating brokerage. Keep the submitted positioning.

PRODUCT
- Cards use Observed / Interpretation / Unknown.
- Never produce trade instructions, price targets, rankings of stocks, individual-investor identification, matched-counterparty claims, inferred holdings or profit, or manipulation allegations.
- Broker profiles do not establish customer identity. Approved words: "institution-facing brokers", "app-facing brokers", "other / mixed brokers", "in the visible sample".
- Evidence strength (Strong / Moderate / Weak / Not enough data) describes support for one specific statement, always with a one-line reason. No percentages.
- YP (Mirae Asset Sekuritas) gets exactly the same methodology as every other broker.
- Every factual number on screen opens its evidence.
- English and Bahasa Indonesia render the same accepted facts and claims.

DATA
- Source: Stockbit broker summary, NET mode, visible top nine per side. Side supplies the sign. Missing broker entries are unknown, not zero.
- Quarantine 13 Aug 2026 (overlapping screenshots, 22 rows per side, brokers on both sides). Never resolve conflicts by silent netting.
- Distinguish captured, missing, excluded, holiday and weekend dates. Holidays: 17 Aug, 25 Aug. Missing (not captured): 8 Sep.
- Clean default window: 14 Aug–23 Sep 2026, 26 captured sessions, at most 9 unique ranks per side per date (234 rows per side).
- Preserve raw labels, source IDs and rejected-row diagnostics.
- Price proxy(d) = sum of net-buy value IDR / (100 × sum of net-buy lots) over visible net-buy rows of day d. Group references use the same ratio on that group's net-buy rows; XL's selling reference uses its net-sell rows. Call these "net-flow implied price references", never official close, VWAP, cost basis or executable quote.
- Integer values and sums must pass Number.isSafeInteger. Ratios keep numerator and denominator and round only for display.
- Never hard-code target numbers as results; compute from rows.

TIME
- Broker data for session D is assumed available at D+1 00:00 WIB (replay assumption, say so in the Method page).
- Events use verified publication dates, not effective dates. Unknown publication = unavailable in strict replay.
- No future points, event text or whole-window claims may exist in an earlier view (UI, DOM, tooltips, AI context).
- Five-session tests use actual market sessions. Holidays do not break a streak; a missing or excluded required session means "not enough data".

AI (QWEN)
- Qwen receives a bounded question, the context and a list of approved claims. It returns only approved claim IDs, their order and an allowed wording variant.
- The app supplies numbers and bilingual text from reviewed facts and templates.
- Validate IDs, dependencies, predicates, versions and required caveats before anything renders. Use claim predicates, not banned-word lists.
- Badges: "Live Qwen · historical data" and "Saved Qwen answer · replay". Rule-based previews say "Rule-based preview".
- Saved fallback only for a matching curated question and context. Other questions get an honest unavailable message plus suggested questions.
- Secrets live only in the server or local generation environment: never VITE_*, public JSON, committed files, bundles or printed transcripts.

STATE AND SECURITY
- One Zustand store. String context key = ticker | session date | cutoff | period | scenario | locale | data, taxonomy and claim versions.
- Every async operation has a unique request ID. Accept a response only if context key and latest request ID both match.
- Validate HTTP input at runtime. The demo token is typed by the evaluator, kept in memory and sent in the Authorization header. CORS is not authentication.

TECH AND DESIGN
- React 18, strict TypeScript, Vite, Tailwind, Recharts, React Router, Zustand, Ajv, Vitest. Keep a lockfile.
- Folders: src/engine, src/ai, src/i18n, src/screens, src/components, scripts, server, docs.
- Colours (light workspace, authorized 2026-10-09): pale #F5F7FA canvas, white #FFFFFF reading surfaces, navy #0B1220 for text and the navigation frame, muted #5A6B84 secondary text, #E3E8F0 hairline borders. Mirae orange #F58220 used sparingly (primary action, active date, active nav indicator), with #B4530A for orange text on light. Net buy teal #0F766E (chart accent #14B8A6), net sell rose #BE123C (chart accent #F43F5E), unclassified slate #64748B with dashed outline. Signs and labels always accompany colour.
- Surfaces: one bordered white card per group of related statements, never one card per sentence; inner items use a pale inset or a hairline separator. The signature visual is the evidence spine in the Other Side card, a single vertical rail linking Observed, Interpretation and Unknown with a solid, half and hollow node; it shows how the layers relate and is not a score or a certainty ranking.
- Inter with system fallback, tabular numbers.
- Mobile 390px and desktop 1440px. Bottom sheets on mobile, right drawers on desktop. Esc closes, focus is trapped in sheets, charts have aria labels.
- Header badge: "Proposed Mirae feature · Historical replay · data through {date}".
- Simulated order sheets send no trading request.

PROCESS
- For each task: inspect existing work, give a short plan and file list, implement only that task, run npm run build once at the end and fix type errors, then report what changed and any blocker.
- Testing is done by the team outside Qoder: do not write new test files, do not run npm test, do not open a browser and do not install tools for visual checks. Keep existing tests compiling; do not delete them.
- Never manufacture data, sources, passing tests, cloud receipts or Qoder logs.
- Record material decisions in docs/decisions.md.
