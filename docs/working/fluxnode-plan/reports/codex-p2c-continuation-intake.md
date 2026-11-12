# P2c multi-runtime continuation intake

Role: read-only discovery worker. Date: 2026-11-12.

## Outcome

P2c remains design-only in Core. I found no P2c or multi-runtime branch/worktree and no runtime-bundle implementation on Core `dev`. The next small independent unit is design phase 1: implement the runtime-bundle registry in `packages/fluxiq/src/runtime/automation-runtimes/`, its local tests/barrel, and the runtime-ownership architecture row. It does not need the t905 service integration seam.

## Pointers and current lanes

- Core main checkout: `C:/Users/osrs_/FluxStuff/!FluxIQ`, branch `dev`, HEAD `6c0692f39974f862d52ed5842aceebbee929238b` (`origin/dev`).
- P2c branch/worktree: none found. `git branch --all --list '*p2c*' '*multi-runtime*'` returned no refs; the filtered `git worktree list --porcelain` had no P2c/multi-runtime worktree. The design is `docs/working/fluxnode-plan/reports/p2c-multi-runtime-design.md` (design commit `fbdbe61bb`).
- t905: worktree `C:/Users/osrs_/FluxStuff/fxwork/t905/!FluxIQ`, branch `task/t905-result-ledger`, HEAD `006ea8104090f1e96042a104487f51c9191eb06a`. Its named checkpoint `docs/working/answer-first-plan/reports/codex-t905-source-checkpoint.md` says local checkpoint only; browser/lane acceptance remains open, and the owning library rebuild is in progress. Its branch has nine commits not on dev and lacks one dev-only commit (`git rev-list --left-right --count dev...task/t905-result-ledger` -> `1 9`). It changes `framework/automation-service/service.ts` and the Answer First/result-verification paths. Phase 4a/4b also own `service.ts` and runtime-session call sites, so keep those phases serial until t905 is integrated. The checkpoint still lists input/secret-frame authority and fresh post-clearance effect evidence as open.
- t907: worktree `C:/Users/osrs_/FluxStuff/fxwork/t907/!FluxIQ`, detached HEAD `91ffd4273cba99ba3c1dfdd3c58469e2bad88895`; `git branch --contains` showed Core `dev` contains that commit. The plan records t907/P5 merged at `a47f7dcf0`; final proof pointer: downstream `docs/working/mvp-launch-plan/reports/codex-t907-final-source-proof.md`. Phase 2's multi-domain lease rule is still a separate P2c requirement; t907's managed-host acceptance does not claim it.
- t909: worktree `C:/Users/osrs_/FluxStuff/fxwork/t909/!FluxIQ`, detached HEAD `595bb2b712112a8bead1d00e6e046bdcf414c8c1`, which is contained in Core `dev`. Its downstream lead-acceptance report is `docs/working/mvp-launch-plan/reports/codex-t909-lead-acceptance.md`. Durable source/target binding is integrated; P2c phase 6 can use the settled create/run seam, preserving t907 shutdown and t905 result wiring.

## Implemented versus unverified

The P2c design and its lead decisions are recorded in the plan: one runtime per project; add `runtime: "web"` to the web manifest; refuse a FluxNode whose runtime is not served; and prove two runtimes on one Core engine plus a simulation-only proof, with web plus Android at phase 9.

Core `dev` has no `AutomationStudioRuntimeBundles`, `registerAutomationRuntime`, `runtimeFor`, or cross-domain runtime-bundle guard (`rg` over `packages/fluxiq/src` returned no matches). The current `AutomationStudioService` still stores one IO runtime/domain and one native-node, host, and evidence binding. `DomainManifest` has no `runtime` field, and `FluxIQ` binds its IO to one `activeDomainId`. Runtime-session graph options filter authorized domains to the single bound IO domain. The page-held admission reader reads the one host resource port. These are inspected source facts, not multi-runtime behavior acceptance.

The current lease scope still holds strict leases in a process-level map; `requiresLease` treats a lease without `sessionId` as applying to every session. P2c phase 2's domain-isolation acceptance is therefore unverified and remains needed even though t907 is integrated.

The P2c conflict map says phases 4a/4b wait on t898, t902 and t885 integration; phase 5's `apps/web` loaders wait on t901; phase 7 waits on t902; and phase V waits on t905 and t885. I did not inspect those lanes' source or private reports. The design marks phases 0, 1, 2, 3 and the non-`apps/web` portion of 5 as startable.

## Recommended next unit

Phase 1 has the smallest clean ownership boundary: new `runtime/automation-runtimes/` files, local tests and barrel, plus the documented runtime-ownership row. The design's acceptance covers duplicate runtime/domain refusals, evidence/node domain mismatches, shared-object rejection, fallback object identity, `forRuntime` compatibility and strict modes, and cross-domain fallback guarding. Run its focused tests, `pnpm --filter fluxiq check`, and `pnpm structure:check` when implemented. This unit does not edit t905's `service.ts` or t907's host/lease work.

## Read-only commands observed

- `git worktree list --porcelain` -> Core dev and t905/t907/t909 worktrees identified; no P2c worktree (large listing filtered by these lane names).
- `git branch --all --list '*p2c*' '*multi-runtime*'` -> no output.
- `git log -1 --oneline --decorate dev` -> `6c0692f39 (HEAD -> dev, origin/dev) Record remaining result and simulation acceptance after host integration`.
- Source searches and reads covered the service binding methods, `domains/index.ts`, `framework/index.ts`, `service/runtime-session/{graph-options,page-held}.ts`, and `runtime/project-agents/host-resources/lease-scope.ts` only.
- No tests/builds, source changes, shared-document changes, git mutations, agents, model calls, browser/runtime-state access or external-service calls.

Outcome: Done
Changed: `docs/working/fluxnode-plan/reports/codex-p2c-continuation-intake.md`
Validation: Read-only repository/source/report inspection only; no tests or build run because this was a discovery brief.
Not verified: Current t905 acceptance after the checkpoint's reported integration/typecheck/audit; P2c runtime behavior; private t898/t902/t885/t901 lane state; phase 2 lease isolation; no P2c lane existed to resume.
Report: `docs/working/fluxnode-plan/reports/codex-p2c-continuation-intake.md`
Notes: Phase 1 is recommended as the next separate brief. Keep service-routing phases 4a/4b behind t905 and the other design-listed owners.
