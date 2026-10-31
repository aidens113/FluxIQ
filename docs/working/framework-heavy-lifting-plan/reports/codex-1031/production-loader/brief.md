# Production runtime loader

Role: Heavy worker; model gpt-6.1-sol; effort max.
Goal: Trace and fix actual production Core startup failure before Claude qualification.
Core root: C:/Users/osrs_/FluxStuff/fxwork/t835/!FluxIQ.
Owned: packages/fluxiq/src/platform/panel/host-modules/ and tests; packages/fluxiq/tsconfig.runtime-imports.json; scripts/build-cache/steps.mjs and owning tests; package.json build field only (preserve0.25.2); owning architecture docs. apps/web/lib only if exact trace requires.
Must not touch: git, package versions, shared working documents, Lab/pinned worktrees, secrets, downstream source, unrelated runtime behavior.
Read: Core AGENTS Repository Boundary, docs/architecture/code-structure.md, apps/web/src/lib/fluxiq.ts and its owning tests, apps/web/next.config.* only if needed.
Current State: docs/working/framework-heavy-lifting-plan.md Current State. t834 merged, SDK consumer repaired; actual Claude launch made zero calls, failing core.health after 60s.
Evidence: C:/Users/osrs_/FluxStuff/fxlab/t833-claude/lab-ext/test-runs/instances/t833-claude-company-website-slot-1/run-mvwuyqi8-e1ce4ea1/logs/core.log (never print tokens/page data).
Built artifact: C:/Users/osrs_/FluxStuff/fxlab/t833-claude/!FluxIQ/.tmp/web-build/894d2590f208c3825c5fae0b/b-157e0369611d/apps/web/.next/server/chunks/ssr/Users_osrs__FluxStuff_fxlab_t833-claude_!FluxIQ_c8e79ef4._.js.
Trace exact stack 1:6821/6781/7905 to source before editing; verify whether host import is culprit, not just matching text.
Use native ESM public package exports; preserve host registration semantics and error handling. No eval/new Function workaround, no test-only route, no skipped readiness, no timeout increase.
Acceptance: targeted host-loader tests, production compilation proof of native runtime import (lead owns actual production server validation), web typecheck only if needed.
Both Oct31 full-suite slots used: NO whole pnpm check/test/build or whole Vitest. No model/API/browser runs by worker.
Wait for task bootstrap completion before package commands; source inspection/edits may proceed.
Report: this directory/worker.md. Explain exact cause, regression proof, remaining verification; short report, no dumps.
End with Outcome, Changed, Validation command/output, Not verified, Report, Notes (max3lines).
