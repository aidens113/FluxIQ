# Core discovery: source-less target identity

## Finding

The missing branch is explicit and local: `automationStudioStepReacquire` returns at `step-reacquire.ts:54-55` whenever `automationStudioTargetLineage` returns nothing. That function documents its scope as row/output bindings (`lineage.ts:5-13,36-49`) and returns `undefined` for a fixed/unbound target. The integration test confirms a fixed control with no `item` edge makes no host request and has no reacquire record (`target-reacquire/tests/step-reacquire.test.ts:180-188`). The second failed retry can therefore be correctly recognized but has no source-based identity search path.

Current host call shape is source-dependent: `AutomationStudioTargetReacquireRequest` requires `node`, `source`, `lineage`, `stale`, non-empty `candidates`, and `failure` (`target-reacquire/contracts.ts:34-48`); `host-runtime.ts:208-215` exposes it as optional `reacquireTarget`. In `step-reacquire.ts:75-90`, Core requires a source, read-only declaration, matcher, bound stale value, reachable source place, successful source rerun, and candidates before calling the host. `host-answer.ts:20-36` validates the existing three outcomes and converts throw/malformed response into `unmatched` without retaining host error text. A source-less addition should be a separate discriminant/branch on this existing seam, with `node`, stale target value and failure available to the host while omitting fabricated source/lineage/candidates; retain the old source-based shape and response behavior. This is a contract-level proposal, not a settled exact field design: the web-side report must establish what target identity the host can safely derive or needs supplied.

For existing output lineage, `automationStudioReacquireBoundValue` reads the stale value at the bound run path and records that path (`bound-value.ts:22-39`). A found output value is staged only in `ctx.arrival.overlay` (`step-reacquire.ts:99-101`), and `graph-run.ts:419` merges that overlay into this node's values immediately before execution. The original shared run value stays intact; test asserts original `find.element` is h1 while retried node input is h2 (`tests/step-reacquire.test.ts:89-91`). Row results instead update the loop item and `values.item` (`step-reacquire.ts:93-98`). The source rerun is internal and does not append an attempt, save records/datasets, mutate run values/variables/loop state, or retry itself (`source-rerun.ts:1-8,18-36`).

The attempt carries the record through `graph-run.ts:438-448`; the trace type currently requires `sourceNodeId` and restricts kind to row/output (`executor/contracts.ts:477-478`, `target-reacquire/contracts.ts:73-83`). Public run-detail conversion persists only IDs and closed outcome/reason/returned fields, never target data (`service/summaries/conversions.ts:250-251`); owning tests are `service/summaries/tests/reacquire.test.ts:6-21`. A no-source record needs an additive representation that does not invent a source ID, plus the matching conversion test.

## Safety and compatibility gates observed

- Trigger is once per arrival, at the configured reacquire attempt (attempt 4 for 4+, otherwise the final attempt for 2-3); it requires the previous retry attempt and a target-stale failure (`step-reacquire.ts:51-57`, `before-attempt.ts:3-15`).
- `automationStudioStaleTargetFailure` rejects an act that may have happened, effect-check `landed`/`unknown`, held/skipped/uncertain work, a completed act, and already-gone targets (`stale-failure.ts:15-36`). `step-reacquire.ts:105-110` also checks the lifecycle completed-act ledger.
- Existing source path reruns only a declared read/record producer with no mutation or declared lasting consequence (`read-only-source.ts:10-25`), checks/reaches the source place before rerun (`source-place.ts:11-40`), then sends every fresh candidate to the host. Empty/missing candidate output is `unavailable`, not proof of gone (`candidates.ts:7-30`).
- The host must decide same-item identity; the contract says never old position/handle (`contracts.ts:1-11,34-59`). A `gone` answer suppresses dispatch and takes the normal failure route (`step-reacquire.ts:40-44,59-61`).
- Existing source rerun/matching remains intact. A new source-less path must not weaken the retry timing or uncertain-act gates, add a retry to the internal search, or infer gone solely from a partial/empty observation.

## Exact likely owning files for an additive Core change

- `packages/fluxiq/src/programs/automation-studio/runtime/executor/target-reacquire/contracts.ts` — additive request and record discriminants.
- `.../executor/host-runtime.ts` and `.../executor/target-reacquire/host-answer.ts` — public hook and defensive answer handling if the answer contract changes.
- `.../executor/target-reacquire/step-reacquire.ts` — source-less dispatch branch after the shared trigger/safety predicate; preserve the current source branch.
- `.../executor/contracts.ts` and `.../runtime/service/summaries/conversions.ts` — trace and public detail persistence.
- `.../executor/target-reacquire/tests/step-reacquire.test.ts` — source-less host request, found/gone/unmatched, and safety/timing behavior; `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/tests/reacquire.test.ts` — persisted source-less record. Extend host fixture types only if required: `.../executor/target-reacquire/tests/reacquire-fixtures.ts`.

No Core source or tests were changed. No web/DOM identity assumptions can be concluded from this Core inspection.

## Validation recommendation

Read-only discovery only; no checks run. After implementation, narrow owning acceptance: `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/target-reacquire/tests/step-reacquire.test.ts src/programs/automation-studio/runtime/executor/target-reacquire/tests/lineage.test.ts src/programs/automation-studio/runtime/service/summaries/tests/reacquire.test.ts`.

Outcome: Done
Changed: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/core-discovery.md` only
Validation: not run (read-only discovery)
Not verified: runtime/types/browser; exact target identity data the web host can provide
Report: `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/core-discovery.md`
Notes: Core currently reacquires only row/output lineage. The source-less branch should be additive at the existing host seam and use a distinct trace form.
