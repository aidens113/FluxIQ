# Core source-less identity recovery implementation

Outcome: Done. Final production/test source is frozen for lead integration, typecheck, audit and SDK verification. No checks are running.

## Result

The existing source-bound `reacquireTarget` request/answer and recovery algorithm remain unchanged. A node without source-node lineage now reaches the separate optional `reacquireUnboundTarget` hook at the existing recovery attempt, behind the existing stale-target, uncertain-effect and completed-act gates. An old host with no new hook retains its previous source-less behavior.

Canonical `targetRefresh: true` descriptors authorize flat target fields. Native runtime resolution handles either a direct registered node or one uniquely registered policy output, protecting the policy wrapper and all other arguments. Canonical validation rejects non-true/inherited/accessor flags, duplicate IDs through the existing validator and conditional effect predicates opted into refresh. The factory binds the trusted resolver beside its existing action-effect resolver.

One shared pure parameter-resolution helper supplies both the hook and the real attempt. Flow inputs, current variables, run values, wired inputs and fallback retain existing dispatch precedence; missing bindings remain non-executable. The new hook receives bounded, isolated/frozen snapshots and the real previous attempt ID plus the existing minimal before-action reference. Browser/resource/place provenance remains the host's responsibility, and unavailable/place_unproved preserves the original remaining attempt.

Found answers are closed and atomic flat set/remove patches against the copied trusted scope. Required-field removal, duplicate/unknown IDs, wrapper replacement, extra fields, accessors, unreadable proxies and non-JSON/cyclic values cannot install a patch. Gone requires the explicit complete-coverage marker. Host errors become closed diagnostics without copying their text. Actual source matching, observation completeness and same-place evidence are not invented by Core.

The separate private arrival parameter overlay reaches only execution parameters for the remaining retries. It never rewrites a Flow, input, shared run value, variable or child graph option. A target-binding change during observation or a later retry invalidates the overlay. The old source run-value overlay remains separate. The pinned original/resolved safety floor survives both executor reset sites; lower declarations cannot weaken it, new authority is rejected and resolver failure becomes an actual unacted action_effect.resolve_failed attempt without dispatch.

The approved additional `step-loop/already-done.ts` change allows the post-hook graph check to reuse the original admitted act identity. It does not derive a new identity or reread a weakened/failing raw resolver after the await. Completion during observation wins over a found/gone answer and does not repeat the act. Existing callers omit the new optional internal argument unchanged.

Identity trace conversion omits sourceNodeId/returned and all target/patch/page/error data; old source record shapes remain supported. The separate Phase 1 public types were not changed.

## Exact changed paths

Paths are relative to `packages/fluxiq/src/programs/automation-studio/` in the private t828 Core tree. This lists this implementation phase; Phase 1's unchanged public leaf files remain recorded in `contracts.md`.

Production and internal type/barrel paths:

- `nodes/definitions.ts`
- `runtime/native-node-runtime.ts`
- `runtime/service/runtime-session/graph-options.ts`
- `runtime/executor/parameter-refresh/snapshot.ts`
- `runtime/executor/parameter-refresh/inputs.ts`
- `runtime/executor/parameter-refresh/resolve.ts`
- `runtime/executor/parameter-refresh/scope.ts`
- `runtime/executor/parameter-refresh/patches.ts`
- `runtime/executor/parameter-refresh/overlay.ts`
- `runtime/executor/parameter-refresh/apply.ts`
- `runtime/executor/parameter-refresh/floor.ts`
- `runtime/executor/parameter-refresh/index.ts`
- `runtime/executor/unbound-reacquire/host-answer.ts`
- `runtime/executor/unbound-reacquire/step.ts`
- `runtime/executor/unbound-reacquire/index.ts`
- `runtime/executor/target-reacquire/contracts.ts`
- `runtime/executor/target-reacquire/step-reacquire.ts`
- `runtime/executor/step-loop/loop-context.ts`
- `runtime/executor/step-loop/already-done.ts` (additional path named and approved by lead before editing)
- `runtime/executor/graph-run.ts`
- `runtime/executor/node-execution.ts`
- `runtime/executor/node-execution/attempt.ts`
- `runtime/service/summaries/reacquire.ts`
- `runtime/service/summaries/conversions.ts`
- `runtime/service/summaries/index.ts`

Owning tests and support:

- `nodes/tests/canonical-registry.test.ts`
- `runtime/tests/target-refresh.test.ts`
- `runtime/executor/parameter-refresh/tests/patches.test.ts`
- `runtime/executor/parameter-refresh/tests/snapshot.test.ts`
- `runtime/executor/unbound-reacquire/tests/fixtures.ts`
- `runtime/executor/unbound-reacquire/tests/graph.test.ts`
- `runtime/executor/unbound-reacquire/tests/safety.test.ts`
- `runtime/executor/node-execution/tests/action-effect-frames.test.ts`
- `runtime/service/summaries/tests/reacquire.test.ts`

This report is the only documentation edited by this worker. No shared working document, package version, downstream source, baseline, git history or runtime/browser data was edited.

Useful source anchors at freeze: `native-node-runtime.ts:73` is the trusted registry method; `service/runtime-session/graph-options.ts:67` wires it; `executor/target-reacquire/step-reacquire.ts:55` selects the separate branch; `executor/unbound-reacquire/step.ts:17` orchestrates it; `executor/node-execution.ts:50` and `executor/node-execution/attempt.ts:103` retain the pinned floors; `executor/graph-run.ts:403` performs the admitted-identity completion recheck; `service/summaries/reacquire.ts:5` projects the closed public record.

## Observed validation

All commands ran from `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ` after production and test source were frozen. No source was edited while either test process ran.

The first invocation used `pnpm` in PowerShell. It exited 1 before starting Vitest because the process selected `pnpm.ps1` and PowerShell's execution policy blocks scripts. Distance: zero tests executed. No machine policy was changed; the identical authorized selectors were rerun using `pnpm.cmd`.

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/unbound-reacquire/tests src/programs/automation-studio/runtime/executor/parameter-refresh/tests src/programs/automation-studio/runtime/executor/target-reacquire/tests src/programs/automation-studio/runtime/service/summaries/tests/reacquire.test.ts src/programs/automation-studio/runtime/tests/target-refresh.test.ts --maxWorkers=2 --minWorkers=1
```

Observed: exit 0; `Test Files 9 passed (9)`, `Tests 89 passed (89)`; duration 36.20 s. This includes 19 real graph cases, 22 source-less safety cases, 11 patch cases, 3 snapshot/scope cases, 3 native registry/factory cases, 4 public conversion cases and all 27 existing source-recovery/lineage/stale-failure tests. No behavioral failure or repair occurred.

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/node-execution/tests/action-effect-frames.test.ts src/programs/automation-studio/runtime/executor/outside-graph/tests/reacquire.test.ts src/programs/automation-studio/runtime/executor/outside-graph/tests/action-effect.test.ts src/programs/automation-studio/runtime/executor/defensive/tests/lasting-act-client-floor.test.ts src/programs/automation-studio/nodes/tests/canonical-registry.test.ts --maxWorkers=2 --minWorkers=1
```

Observed: exit 0; `Test Files 5 passed (5)`, `Tests 33 passed (33)`; duration 12.51 s. This includes the new pre-preparation pinned-floor regression and canonical flag validation, plus existing nested-frame, outside-graph and lasting-act floor regressions. No behavioral failure or repair occurred.

Total: 122 passing tests across 14 owning/regression files. After both processes ended, manual source review of `tsconfig.base.json` found exactOptionalPropertyTypes enabled; one internal `overlay.floor` optional annotation was made explicitly assignable to undefined, matching its existing assignments. This changes no emitted runtime behavior or frozen public interface. No additional broad or duplicate test sweep was run for that type-only annotation.

The tests directly exercise native and policy-effect dispatch, actual resolved capture nodes, Flow input/current-variable/fallback behavior, unresolved binding refusal, legacy hosts, complete gone versus unavailable/malformed outcomes, cancellation, required/optional removal, duplicate/unknown/accessor/proxy rejection, trusted canonical ambiguity/version handling, source-branch non-fallback, target changes during and after lookup, remaining-retry/node isolation, stronger authority refusal, pinned uncertainty and real resolver failures. Completion during an awaited hook is covered with both a weakened and a throwing resolver, preserving the real completed-act ledger entry and issuing no fourth dispatch.

Timing note: the existing graph retry policy enforces a four-attempt floor. The 1/2/3/4/6 recovery timing matrix therefore exercises the shared graph-step recovery seam directly with explicit policies; native/wrapper integration covers ordinary four attempts and six-attempt remaining retries. Existing graph retry policy was not changed.

## Limits and integration handoff

No package typecheck, audit, full suite, SDK build, browser/manual proof, panel, provider/API call, version edit or git mutation was run by this worker. The lead's Phase 1 typecheck preceded this implementation and is not claimed as implementation validation. The lead owns current type/export checks, structural audit, the final 0.20 SDK and the paired browser/host verification.

No new wire protocol or source-hook signature was added. Same-place/document and completeness truth are validated by the paired host implementation; Core tests establish the request context and closed outcomes, not real browser provenance. No paid run has started, and the daily full-sweep limit was respected.

Outcome: Done
Changed: the 34 exact source/test paths above and `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/core.md`
Validation: 89 + 33 owning/regression tests passed, exit 0; initial PowerShell pnpm shim refused before tests, rerun through pnpm.cmd passed
Not verified: package types/audit/SDK/browser/live runtime beyond the owning execution tests
Report: `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/core.md`
Notes: Source frozen; no checks running. Public Phase 1 interfaces unchanged. Lead owns remaining integration checks and paired host/browser proof.
