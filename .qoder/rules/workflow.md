---
trigger: always_on
alwaysApply: true
---

# Development workflow

1. Inspect the current implementation and relevant decisions. State a short plan, files to change and acceptance cases. Then complete the authorized task without waiting for routine approval.
2. Work from this product directory and implement one scoped change. Ask only when a missing decision prevents safe progress; otherwise follow the existing implementation and state your assumption. Do not add skills, agents, hooks or integrations without a task requesting them.
3. Preserve unrelated edits and existing methodology. Do not broaden a UI task into new data, providers, model behavior or a redesign. Reuse engine calculations, validated loaders, approved claims, shared components and existing dependencies.
4. For code changes, run npm run build at the end. It checks both app and server types and builds the frontend. If it fails, fix task-related errors and rerun; report unrelated baseline blockers accurately. Pure instruction/documentation changes do not need an application build.
5. By default, the team handles unit tests, browser checks and test authoring during review. Do not run npm test, npm run test:e2e, equivalent test runners or browser checks, create or modify test files, or install visual-check tools unless the current task explicitly assigns that work. Do not delete or weaken tests; preserve their ability to compile.
6. A successful build proves type checking and bundling, not correct behavior. Do not claim tests, visual checks, live provider access or deployment succeeded without actual evidence. Historical reports are not current results.
7. Record material implementation decisions in docs/decisions.md. Treat dated baseline issues as dated observations, not freshly verified facts. Do not change project instructions or rules to evade acceptance criteria.
8. Finish with the changed files and purpose, actual commands and outcomes, unresolved limitations, and specific checks for team review. Identify expected inputs and outputs, including missing data, historical cutoff and stale-response cases when relevant. Stop after the assigned task.

Run build:data only when the task needs data regeneration. Run generate:saved-answers only when explicitly assigned: it calls Qwen and writes plans. Publication, deployment and external writes need task authorization. Do not create, relocate or copy secret files as an incidental setup step. The existing loader reads the product .env; respect environment-provided values and do not duplicate secrets or print them.
