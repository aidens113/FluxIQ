# Phase 1 public contracts

Outcome: Done. Source is frozen for lead verification and dependent implementation.

Implemented the exact lead-frozen additive declarations from `core-plan.md`: true-only target-field opt-in; trusted refresh scope and typed registry diagnostics; flat set/remove patches; the separate optional source-less host method; resolved-parameter and previous-attempt context; explicit complete coverage for gone; and a separate source-less identity trace member with closed reasons.

## Changed paths and anchors

All source paths below are relative to `packages/fluxiq/src/programs/automation-studio/` in the private t828 Core tree.

| Exact path | Anchor | Change |
| --- | --- | --- |
| `nodes/contracts.ts` | 65 | `AutomationNodeParameter.targetRefresh?: true`. |
| `runtime/executor/parameter-refresh/refresh.ts` | 2 | `AutomationStudioTargetRefresh`, including fixed container, canonical ID/version and allowed/removable IDs. |
| `runtime/executor/parameter-refresh/resolution.ts` | 4 | `AutomationStudioTargetRefreshResolution` with declared/absent/rejected/unreadable diagnostics. |
| `runtime/executor/parameter-refresh/patch.ts` | 4 | `AutomationStudioTargetRefreshPatch`, set/remove discriminated union using the existing `JsonValue`. |
| `runtime/executor/parameter-refresh/index.ts` | 1 | Type-only barrel for the three public parameter-refresh types. |
| `runtime/executor/unbound-reacquire/request.ts` | 8 | `AutomationStudioUnboundTargetReacquireRequest`, actual resolved parameters and `previousAttempt: { attemptId, beforeAction? }` using existing node/failure/snapshot types. |
| `runtime/executor/unbound-reacquire/answer.ts` | 4 | `AutomationStudioUnboundTargetReacquireAnswer`, including `coverage: "complete"` and `place_unproved`. |
| `runtime/executor/unbound-reacquire/identity-record.ts` | 4 | Separate `AutomationStudioIdentityReacquireRecord`, with source-only fields forbidden by optional `never`. |
| `runtime/executor/unbound-reacquire/identity-reason.ts` | 2 | Exact closed `AutomationStudioIdentityReacquireReason` union. |
| `runtime/executor/unbound-reacquire/index.ts` | 1 | Type-only barrel for request, answer, identity record and identity reason. |
| `runtime/host-runtime.ts` | 223 | Optional ordinary `reacquireUnboundTarget` method, with type-only import and contract comments. |
| `runtime/executor/contracts/graph-execution-options.ts` | 43 | Optional trusted `resolveTargetRefresh` callback, with type-only import. |
| `runtime/executor/index.ts` | 21 | Type-only re-exports of all seven new public types. |

One exported type lives in each new leaf. Existing `runtime/executor.ts` re-exports `executor/index.ts`; `runtime/index.ts` re-exports that wrapper; the public automation-studio `index.ts` re-exports runtime. Those existing wildcard links already carry the new type-only exports, so the top-level public entry needed no edit and no new package subpath was introduced.

The existing `reacquireTarget` method and its source-bound request/answer remain unchanged. The existing `AutomationStudioTargetReacquireRecord` has not been widened; Phase 2 must integrate the separate identity record with its implementation and conversion changes. There are no new runtime values or behavior in this unit.

## Verification boundary

Source was read to locate owning declarations and confirm line anchors. No typecheck, build, test, audit, browser, panel, provider/API call, git mutation or version change was run. No test or implementation success is claimed. The lead owns actual public-import/type validation and SDK verification after this source freeze.

No blocker was found within the assigned type/flag/export scope. Registry validation, native resolver/factory wiring, defensive host-answer handling, arrival overlay, safety-floor behavior and trace integration remain explicitly outside this phase.

Outcome: Done
Changed: the 13 exact source paths listed above and `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/contracts.md` only
Validation: not run (written brief forbids checks/builds/tests/audits; lead verifies after source freeze)
Not verified: types/runtime/SDK/browser
Report: `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/contracts.md`
Notes: Source frozen. Exact frozen interfaces are additive and type-only. Existing source recovery and trace union remain unchanged.
