---
trigger: glob
glob:
  - src/**/*.tsx
  - src/**/*.css
  - src/i18n/**
  - src/ai/templates.ts
  - src/ai/thesisView.ts
  - src/store/contextStore.ts
  - index.html
  - tailwind.config.js
---

# O-Side interface and localization

- Preserve this product's authorized light Mirae workspace. Use existing tokens: canvas #F5F7FA; white #FFFFFF surfaces; navy #0B1220 text/navigation; secondary #5A6B84; borders #E3E8F0. Mirae orange #F58220 is sparse for primary actions and active indicators; orange text on light is #B4530A. Buy teal #0F766E (chart #14B8A6), sell rose #BE123C (chart #F43F5E), unclassified slate #64748B with dashed outline. Colour always has accompanying signs or labels.
- Use Inter with system fallback and tabular numbers. Preserve existing page-* and research-* scoping. Do not globally override card primitives or restyle unrelated screens for a local task. No gradients or glow.
- Group related statements in one bordered white card, with pale insets or hairline separators. Keep the evidence spine linking Observed, Interpretation and Unknown with solid, half and hollow nodes. It is not a score or certainty ranking.
- Support 390px mobile and 1440px desktop without horizontal overflow, retaining intermediate responsive behavior. Use bottom sheets on mobile and right drawers on desktop. Esc closes, focus is trapped in dialogs and restored to the trigger. Charts have accessible names and keyboard-accessible evidence controls. Preserve reduced-motion behavior.
- Keep en and zh-CN dictionary keys and accepted meaning aligned, including errors, caveats, accessible labels, dialogs and unavailable states. Preserve the intentional fresh zh-CN default and persisted explicit language choice. Do not silently change locale as a bug fix.
- Format numbers and dates by locale without changing underlying facts. Distinguish shares, lots, return percentages and contribution percentage points in every language. Do not translate or rewrite reviewed financial claims independently of their templates and predicates.
- Use plain, concise copy with no em dashes. State what is observed, interpreted and unknown. Never turn unavailable data into an optimistic claim or an unlabeled fixture.
- Keep lazy chart chunks and the existing synchronous SSR path compatible where used. Do not remove the SSR path just to simplify browser rendering or weaken existing rendering expectations.
