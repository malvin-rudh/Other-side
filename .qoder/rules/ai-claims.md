---
trigger: glob
glob:
  - src/ai/**
  - src/engine/**
  - src/store/**
  - src/i18n/**
  - src/components/**
  - src/screens/**
  - server/**
  - scripts/generate-saved-answers.ts
---

# Approved answers and context identity

- Qwen receives a bounded question, analytical context and approved claims. It returns approved claim IDs, ordering and allowed wording variants. Numbers and displayed wording come from reviewed facts and templates in the app, never free-form model financial prose.
- Preserve one shared validateModelResponse path for answer plans. Validate schema, IDs, dependencies, predicates, versions, required caveats, wording renderability for the locale and fact availability at the cutoff before rendering. Use claim predicates rather than banned-word lists.
- Keep rule-based preview, saved Qwen and live Qwen distinct. Existing English badges are "Rule-based preview", "Saved Qwen answer · replay" and "Live Qwen · historical data"; preserve accurate translations and any saved-English-answer language disclosure.
- Saved answers are valid only for their matching curated question and replay context. Do not disguise an unrelated saved response as a live answer. Unsupported questions get an honest unavailable state with suggested supported questions.
- Portfolio explanations currently use reviewed CL-PORT claims in a rule-based preview. Do not label them live Qwen or add a live portfolio path incidentally.
- Keep one Zustand store. Analytical identity includes ticker, session date, cutoff, period, scenario, locale and data/taxonomy/claim versions. Portfolio surfaces additionally use portfolioKey for sorted symbols and quantities, currency, window, benchmark, cutoff and price-data identity. Preserve existing broker keys when no portfolio key exists.
- Async answer responses must match both the expected context key and latest unique request ID. Provider requests must also be guarded against changed symbols, parameters, token or endpoint and obsolete request ordering. Corrected prices must invalidate evidence and explanations even if bar count and end date stay unchanged.
- Changing locale, holdings, quantity, date, scenario, cutoff, relevant versions or endpoint must not leave an old answer attached to new inputs. Do not bypass validators or duplicate business calculations in the UI to make a response appear usable.
