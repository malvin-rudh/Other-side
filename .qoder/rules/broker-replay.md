---
trigger: glob
glob:
  - src/engine/**
  - src/data/**
  - scripts/**
  - data/**
  - public/data/**
  - server/data.ts
  - src/screens/**
  - src/components/**
---

# Broker data and historical replay

- The SINI source is Stockbit broker summary, NET mode, visible top nine per side. Side supplies the sign; missing broker entries are unknown, not zero. Keep raw labels, source IDs and rejected-row diagnostics.
- Quarantine 13 August 2026: overlapping screenshots, 22 rows per side, brokers on both sides. Never resolve conflicts through silent netting.
- The clean SINI default window is 14 August to 23 September 2026, with 26 captured sessions and at most nine unique ranks per side per date (234 rows per side in the original capture). Compute totals from rows. Distinguish captured, missing, excluded, holiday and weekend dates; 17 and 25 August are holidays, and 8 September was not captured.
- Daily price proxy = sum(net-buy value IDR) / (100 x sum(net-buy lots)) over visible net-buy rows. Group references use the same ratio on that group's net-buy rows; XL's selling reference uses net-sell rows. Call these net-flow implied price references, never official close, VWAP, cost basis or executable quote.
- Integer values and sums must pass Number.isSafeInteger. Preserve ratio numerators and denominators; round only for display. A share is not a lot: one IDX lot is 100 shares.
- Broker session D is assumed available at D+1 00:00 WIB. Disclose this replay assumption on Method. Events use verified publication dates, not effective dates; unknown publication means unavailable in strict replay.
- Filter data and facts before deriving visible claims. Earlier views must contain no later points, event text or whole-window conclusions in rendering, hidden DOM, tooltips, evidence or AI context.
- Five-session checks use actual market sessions. Holidays do not break a streak; a missing or excluded required session means not enough data. Do not count calendar days or bridge missing sessions as observations.
- Route by instrument metadata. SINI is verified; SMPA and SMPB have their own explicitly fictional broker fixtures; SMPC has no broker dataset. Provider-only instruments have no broker dataset. Never lend SINI rows or claims to another ticker or route fictional symbols to a real provider.
- Generated public documents must remain traceable to captures or labelled fixtures and their manifest versions. Preserve validation diagnostics and do not hand-edit outputs to match a target result.
