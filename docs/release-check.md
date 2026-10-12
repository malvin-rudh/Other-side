# Release check (Block 3)

Date: 2026-10-09. Scope: full MUST journey on `main`, commit `6eb281f` plus the
release-check additions in this document. Per the project rules, testing is
normally done by the team outside Qoder; Block 3 explicitly overrides that line
for this release check ("Run all unit tests and the build. Add a small
Playwright suite..."), so the suites below were authored and run inside Qoder.

## Commands

- `npm test` (Vitest, node environment)
- `npm run build` (`tsc --noEmit` app + server, then `vite build`)
- `npx playwright test` (webServer: `npm run preview` on 4173)
- `npx lighthouse http://localhost:4173/stock/SINI --only-categories=performance,accessibility`

## Results

| Check | Result |
| --- | --- |
| Unit tests | 26 files, 240 tests, all passing |
| Type check + build | passes; initial JS chunk 145 KiB gzip after chart code splitting |
| Playwright release suite (e2e/release.spec.ts) | 4/4 passing |
| Layout, focus, locale (e2e/layout.spec.ts) | 3/3 passing at 390 / 768 / 1440 |
| On-screen number audit (e2e/audit.spec.ts) | 2/2 passing at 24 Aug and 23 Sep checkpoints |
| Lighthouse accessibility | 100 on all runs |
| Lighthouse performance | 91 median over 3 final runs (89, 91, 92); earlier lazy-load-only runs varied 79 to 90 on this machine |

No unresolved critical findings. Remaining limits are listed at the end.

## Playwright coverage (9 tests)

- **24 Aug leakage** (release.spec.ts): with the cutoff at 24 Aug 2026, the card,
  both charts and the changed strip contain no September event text, claim or
  point. Event availability uses verified publication dates.
- **Sell C12/C13 gating**: the sell sheet renders the five-session streak wording
  only when the claims are available at the cutoff, and the fallback otherwise.
- **Stale-response rejection**: a live response whose `contextKey` does not match
  the current context is rejected and nothing from it renders.
- **Live failure fallback**: when the endpoint fails, the thesis panel shows the
  honest unavailable message plus suggested questions, never a fabricated answer.
- **Layout**: no horizontal overflow at 390, 768 and 1440 on the stock screen.
- **Keyboard/focus**: the sell sheet traps Tab within the dialog, Esc closes it,
  and focus returns to the trigger button.
- **Locale**: the ID locale renders the same screen with translated sheet
  strings and no English leftovers in the checked regions.

Note for future selectors: `Intl.DateTimeFormat('en-GB', { month: 'short' })`
renders September as "Sept" (four letters) but August as "Aug", so quick-stop
accessible names are "Jump to 24 Aug 2026" and "Jump to 23 Sept 2026". Specs use
regex selectors such as `/Jump to 23 Sep/`.

## Number audit method (e2e/audit.spec.ts)

At both checkpoints (2026-08-24 and 2026-09-23) the spec rebuilds the expected
view in-test from the committed public JSONs (`buildStockView`,
`buildTradeContext`, `sessionAvailableAt`) and compares region by region against
the rendered DOM:

- header reference value and date, and the period line;
- changed-strip signed token multiset equals the engine move values;
- flow panel signed tokens equal the engine signed values, and the full unsigned
  token multiset equals the absolute values of group nets, top buyers and top
  sellers (the Unclassified group renders a signless 0, which a purely signed
  comparison cannot match);
- the expanded Other Side card lists exactly the numbers present in the approved
  claim wording;
- every story/health event text appears verbatim in its tab panel;
- the sell sheet carries the trade wording and weak-link signed values; the buy
  sheet carries the two reference prices, and the 23 Sep sell sheet carries the
  fallback wording.

No expected number is hard-coded in the spec; everything is computed from rows.

Because Playwright loads specs as native ESM and `src/i18n` imports JSON
dictionaries, the specs read public JSON via `node:fs` and replicate the two
date formatters locally instead of importing `src/i18n`.

## Secrets and private-data scan

- Source grep over `VITE_*`, `SECRET`, `TOKEN`, `Authorization`, `Bearer`,
  `sk-...`, `aliyuncs`, `.env` matches only placeholders in `.env.example`
  (empty values), env-var reads in `server/config.ts` and
  `scripts/generate-saved-answers.ts` (read from gitignored `.env`), the
  demo-token store field, and the Authorization header construction that sends
  the typed demo token. No secret values are committed.
- `git ls-files` shows no tracked `.env`, key, pem or credential files;
  `.env` exists locally and is gitignored (`git check-ignore` confirms).
- The dist bundle contains no `aliyuncs` / Function Compute URL, no API key
  patterns, and no server URLs; the only localhost string is the default live
  endpoint `http://localhost:8787/api/explain`, which is a user setting, not a
  secret.
- `docs/deploy-fc.md` documents variable names only, never values.
- `data/raw/` holds the source CSV and seed JSONs (visible top-nine broker
  summary and public events), all public market data.
- `test-results/` and `playwright-report/` are now gitignored for the sanitized
  submission package.

## Lighthouse

Final configuration: Recharts chart components are lazy chunks in the browser
build and panels use `content-visibility: auto` with `contain-intrinsic-size`,
which removed Recharts (about 109 KiB gzip) from the initial chunk and skips
off-screen paint/layout on first load. Under SSR (`import.meta.env.SSR`, which
Vitest sets in the node environment) the charts use a synchronous import so the
existing `renderToStaticMarkup` unit tests keep working without awaiting lazy
chunks; Rollup tree-shakes the SSR branch out of the client bundle.

Scores on this machine (mobile preset, lab throttling): performance 91 median
(89 to 92), accessibility 100 on every run. LCP about 3.0 s and TBT 100 to
210 ms are dominated by throttled-CPU script evaluation of React plus the
first render; the variance between identical runs is about 5 points.

## Remaining limits (not critical, recorded per acceptance)

1. Performance on the lab mobile preset sits at the 90 boundary (89 to 92).
   The dominant cost is single-page React script evaluation under 4x CPU
   throttle, not transfer size (initial payload is about 150 KiB gzip). Further
   gains would need server-side rendering or chart virtualization, both out of
   scope for this prototype.
2. The number audit covers the two replay checkpoints (24 Aug, 23 Sep) and both
   trade sheets. Dates between checkpoints are covered by the unit golden tests
   rather than by DOM audit.
3. The sell-sheet focus test asserts Tab cycling 12 times inside the dialog; it
   does not enumerate every focusable order permutation.
4. Lighthouse was run against the production preview build locally; scores on
   the published Qoder Sites URL may differ slightly and should be re-measured
   after publishing (Block 4).
