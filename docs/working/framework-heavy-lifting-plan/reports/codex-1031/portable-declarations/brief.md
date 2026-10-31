# Portable SDK declaration boundary

Role: Heavy worker, gpt-6.1-sol, max effort. Root owns integration, version, git and paid runs.
Goal: Fix the actual public SDK declaration portability failure and mechanically prevent its recurrence without changing runtime/public API semantics.
Owned Core paths: scripts/rewrite-declaration-imports.mjs; a cohesive scripts/declaration-imports/ helper/test folder if needed; packages/fluxiq/src/programs/automation-studio/runtime/llm/prior-nodes/batch-member.ts; packages/fluxiq/src/programs/automation-studio/runtime/service/execution-authority/create.ts; focused contract modules beside those owners only when required; authored SDK architecture doc if relevant.
Must not touch: package.json/version, generated dist, .env/secrets, any Down paths, shared Current State/ledger/index, other runtime behavior, git.
Context: Core AGENTS.md Repository Boundary; docs/working/framework-heavy-lifting-plan.md Current State; listed source files and tsconfigs/export contracts needed to trace inference.
Failure: real pinned Lab provider-free preflight passed earlier builds, then test-runner:build TS2307 on four import("packages/contracts/dist/core.js") types in batch-member.d.ts (7,10) and execution-authority/create.d.ts (19 twice). Zero browser/provider calls. This is source/build portability, not load.
Evidence: main Down test-runs/2026-10-31-t833-validation/claude-preflight.log (final TS2307 lines only); actual main Core dist declarations can be read for diagnosis but never edited.
Worktree: C:/Users/osrs_/FluxStuff/fxwork/t834/!FluxIQ; Down paired sibling !FluxIQWebExtension; branch task/t834-portable-sdk-declarations.
INITIAL HOLD: task setup is building Core's initial SDK. Read-only diagnosis/report now; do not edit production/tests until root releases. Report exact cause and proposed seam/guard, then await release.
Prefer existing explicit owned return contracts where inference leaks workspace paths; do not blindly rewrite an internal path into a public module that does not export the symbol. Consider the owning declaration-build guard so future nonportable aliases fail mechanically. Keep .ts→.js import rewriting intact.
No provider/model/browser/full-suite calls. Both full-suite slots used. Validate with focused owning script/runtime tests; root owns final SDK and actual downstream test-runner consumer build, package types/audit.
Use temporary isolated test dirs, meaningful emitted-import/export/consumer regressions and actual expected valid public imports; no weak skipLibCheck/path alias in downstream consumer, no blanket catch/suppression or baseline growth.
Report at this directory's worker.md; record exact commands, observed output, any uncertainty and validation not run.
Return contract: Outcome, Changed, Validation, Not verified, Report, Notes (at most3 lines).
