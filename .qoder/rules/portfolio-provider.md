---
trigger: glob
glob:
  - src/engine/portfolio*.ts
  - src/engine/brief.ts
  - src/engine/context.ts
  - src/data/**
  - src/store/**
  - src/ai/**
  - src/screens/PortfolioScreen.tsx
  - src/screens/BriefScreen.tsx
  - src/components/**
  - server/**
---

# Portfolio valuation and provider trust boundaries

- Value owned holdings only, with fixed evaluator-entered quantities: V(t) = sum(quantity x daily close). Watchlist entries never enter valuation. This is a current-holdings model with no trades, cash, dividends, fees or rights subscriptions, not actual account performance.
- Quantities must be positive safe-integer shares. Validate at input, store and engine boundaries. Refuse invalid quantities and unsafe arithmetic rather than coercing or dropping holdings.
- Support complete IDR portfolios under the current model. Refuse missing quantities, incomplete required price coverage, unsupported currencies and mixed real-provider/fictional-fixture holdings with a specific reason. Do not invent FX or silently omit a holding.
- An N-session change requires N+1 completed common closes across every valued holding. Use one selected window for charts, facts, allocation, contribution and evidence. Treat missing closes as unknown. Real portfolios use ^JKSE as the price-return benchmark; fictional samples use SMPLIDX, never labelled IHSG. Benchmark claims require usable benchmark inputs.
- Returns use raw fractions until display; multiply by 100 exactly once. Contributions are percentage points, not individual holding return percentages. Weights derive from quantity x close / portfolio total. Every per-symbol number opens that symbol's evidence, with the consumed window distinguished from full source-history provenance.
- Fetch providers on the server only. Preserve symbol, source, currency, exchange timezone, original fetch/observation timestamp and price basis. Real histories use provider-daily-unadjusted; samples use sample-fixture-daily. A broker implied-price proxy is never a market close.
- Use shared historyValidation at both client and server boundaries. Require real calendar dates, offset timestamps, valid IANA timezone, supported basis, exact symbol match, chronological unique dates and valid supplied OHLCV types. Missing/null stays unknown. Supplied invalid or negative prices and invalid counts are rejected, never repaired into null or zero. Error messages must not echo provider payloads or credentials.
- A completed daily bar must have ended in its exchange timezone at or before the analytical cutoff. For provider bars it must also have ended at or before the original observation instant. A cached 15:58 observation cannot become a completed close at 16:02 just because the clock moved. Unknown completion or observation information must not be guessed.
- Preserve unfinished-session filtering before caching and the bounded cache with original fetchedAt. A cache hit is not a fresh observation. Keep intraday quote display separate from completed daily history.
- Brief uses its own historical morning cutoff for holdings and benchmark, so an August Brief cannot contain September prices, evidence or claims. Invalidations include corrected consumed prices, not just dates and bar counts.
- Sample preset replacement requires the existing explicit confirmation before replacing saved holdings. Keep sample and unavailable states honest; failure of a live provider is not permission to fabricate replacement market data.
