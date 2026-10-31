# Core trusted control intent

Outcome: Done (owning implementation and targeted correction checks complete; source/tests frozen for root verification).

## Implementation

- The frozen public companion remains resolver-only and readonly. Core validates own closed data, discriminants, supplied undefined/false, symbol/unknown/inherited/accessor fields and copies/freezes accepted values. Invalid supplied metadata takes the existing invalid-resolution path.
- Only resolved executable nodes contribute to a fresh Core-owned sidecar. Its keys are JSON tuples of subflow/node keys, so dotted names cannot alias; duplicate annotated tuples refuse. A frozen read-only view and private weak identity prevent arbitrary maps from becoming trusted sidecars. Fact answers, unchanged/refused outcomes, skipped inheritance and model JSON supply no authority.
- Successful completion carries the map beside the resolved plan. The real candidate controller consumes it before relayout; scoped subflow submission passes through that same path before rekeying. No annotation enters executable parameters, graph metadata, persisted candidates or fingerprints.
- The checker uses only host accept/response-only semantics. English accepting/declining/consent/glyph classification and authored dialog-consent exemptions are removed. Optional/handler discovery, explicit-empty consequences gating, exact consequence/source placement and issue codes remain. Display wording is bounded but missing/long/misleading words cannot hide a known acceptance. Explicit lasting declarations still reach the actual permission gate.
- Authored architecture documentation: `docs/architecture/automation-studio/resolved-control-intent.md`. Public helpers/accessors were not added. `bootstrap-completion.ts` remains within 800 lines (798).

## Validation recorded as observed

Working directory for named Vitest command: `packages/fluxiq`.

```powershell
pnpm.cmd exec vitest run src/programs/automation-studio/runtime/llm/harness-options/tests/plan-parameter-resolution.test.ts src/programs/automation-studio/runtime/llm/harness-options/tests/plan-parameter-resolution/tests/control.test.ts src/programs/automation-studio/runtime/llm/harness-options/tests/plan-parameter-resolution/tests/intent.test.ts src/programs/automation-studio/runtime/llm/harness-options/tests/bootstrap-completion.test.ts src/programs/automation-studio/runtime/llm/harness-options/tests/bootstrap-completion-composed.test.ts src/programs/automation-studio/runtime/flow-bootstrap/script-statements/tests/way-out-steps.test.ts src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/control-intent.test.ts src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/refusal-locator-corpus.test.ts src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/submission-view-history.test.ts src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/control-intent.test.ts src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/scoped-submission.test.ts src/programs/automation-studio/runtime/recovery/annotation/tests/step-evidence-resolution.test.ts src/programs/automation-studio/runtime/recovery/annotation/tests/recovery-permissions.test.ts --maxWorkers=2 --minWorkers=1
```

Observed: 12 files passed, 1 failed; 162 tests passed, 1 failed; 62.98s. Actual candidate/subflow transport, actual permission independence, completion, strict reader/collision/isolation, CC9, locator/view-history and recovery regressions passed. The direct-checker handler test's stand-in answered resolved for built-in nodes before the normal completion normalization, causing `bootstrap.parameter_resolution_invalid` on the handler's parameters. Test-only correction: leave non-click nodes unchanged, continuing to resolve synthetic fact targets and the clicked control. Root was notified; source/test freeze was held until release.

`pnpm.cmd --filter fluxiq check` (repository root): failed with one test-only TS2353 at `intent.test.ts:95`; `controlIntent` is correctly excluded from `AutomationStudioFlowBootstrapNodeMetadata`, so the negative forgery fixture's direct typed assignment was rejected. Observed compiler/build-cache duration 93.022s, no success stamp. Test-only correction: initialize the metadata record, then inject the deliberately untrusted extra key with `Object.assign`, preserving the same negative assertion. Production source had no reported type errors. Both corrections were held until root's SDK build ended and it released the test-only thaw.

Root released only those two test corrections after its SDK passed. Applied exactly the unchanged-non-click fixture branch and metadata `Object.assign` injection, preserving all assertions and fact handling, then immediately re-froze. No production source changed after the SDK snapshot.

`pnpm.cmd --filter fluxiq check` rerun: PASS, shared success stamp stored; observed compiler/build-cache duration 25.788s.

```powershell
pnpm.cmd exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/script-statements/tests/way-out-steps.test.ts src/programs/automation-studio/runtime/llm/harness-options/tests/plan-parameter-resolution/tests/intent.test.ts --maxWorkers=2 --minWorkers=1
```

Targeted rerun: 11 tests passed, 1 failed across 2 files, 30.56s. The first handler-fixture issue was corrected and its positive consent case reached the checker. The next loop case incorrectly wrote unsupported `when: not dialog consent ...` syntax; the existing parser correctly refused `flow_script.fact_invalid` at line 9 before the checker. The existing fact reader and its tests require the opposite as `dialog consent "Your choices" absent`. Root released the one-literal test-only correction to that supported syntax, preserving all assertions, including exact consequence line 14 and host-accept refusal; source/tests were immediately re-frozen. The original 13-file set was not relaunched, per root instruction.

```powershell
pnpm.cmd exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/script-statements/tests/way-out-steps.test.ts --maxWorkers=1 --minWorkers=1
```

Final direct-checker rerun: PASS, 6/6 tests in 1 file, 28.29s. Every file in the original 13-file selection has now passed, with corrected files validated by the targeted reruns above. No production source changed after the original freeze/SDK snapshot. The successful package typecheck preceded only the final supported-grammar string-literal correction; root owns final source freshness and acceptance.

Initial identical commands using `pnpm` were rejected by the local PowerShell execution policy before either check launched (`pnpm.ps1 cannot be loaded because running scripts is disabled`). Retried through the existing `pnpm.cmd` shim; no system policy was changed.

Full suites, SDK/builds, structure audit, provider/browser/live execution and git were not run by this worker. Both full-suite slots are used; root owns SDK, audits, final cross-repository acceptance and git. No .env, secrets, browser data or generated artifacts were read or changed.

Additional narrow preservation checks located and passed to root, not launched here under its rerun limit: `harness-options/tests/plan-step-effect.test.ts` and the three `candidate/tests/toggles/tests/submission-toggles{,-undeclared,-graph}.test.ts` files.

## Changed paths

Under `packages/fluxiq/src/programs/automation-studio/runtime/`:

- `llm/resolved-control-intent/{contracts,read,node-key,sidecar,index}.ts` (the root-prepared contract was mechanically relocated in the follow-up below)
- `llm/harness-options/{binding,plan-parameter-resolution,bootstrap-completion}.ts`
- `llm/harness-options/tests/bootstrap-completion.test.ts`
- `llm/harness-options/tests/plan-parameter-resolution/tests/intent.test.ts`
- `flow-bootstrap/script-statements/way-out-steps.ts` and `tests/way-out-steps.test.ts`
- `flow-bootstrap/candidate/submission.ts`, `tests/refusal-locator-corpus.test.ts`, and `control-intent/tests/submission.test.ts`
- `flow-bootstrap/subflow-candidate/control-intent/tests/submission.test.ts`

Also the authored architecture document and this report. The root-prepared public contract's content, package/version/lockfiles and shared working documents were not edited by this worker.

## Root acceptance follow-up: test directory budgets

Root reported that its 35-test/8-file Core acceptance passed (47.74s), final SDK and downstream freshness passed, and actual public Core/web paired tests passed. Its structure audit found only the two test directories at 26 files, exceeding the limit of 25. Root authorized moving only the two newly added intent tests to each owner's `control-intent/tests/submission.test.ts` and adjusting relative imports.

Applied exactly those two moves and import adjustments; no fixture, assertion or production code changed. Source/tests were immediately re-frozen and root was notified before launching the moved-file check. Root owns the resulting SDK input-hash refresh and audit acceptance.

Working directory: `packages/fluxiq`.

```powershell
pnpm.cmd exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/candidate/control-intent/tests/submission.test.ts src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/control-intent/tests/submission.test.ts --maxWorkers=2 --minWorkers=1
```

Observed: PASS, 7/7 tests across the 2 moved files, 38.36s. Candidate transport/permission tests passed 5/5; scoped-subflow transport tests passed 2/2. No other checks were relaunched by this worker. Source/tests remain frozen for root's rebuilt SDK/freshness and audit acceptance.

## Root push follow-up: tracked naming depth

Root reported that its Core backup push was rejected because the five now-tracked intent files occupied 10 path segments, exceeding the limit of 9; the precommit audit had missed their previously untracked paths. No baseline increase or bypass was used. Root authorized relocating only the private directory, its importing sites and exact-path documentation, without semantic or assertion changes.

Actual path changes (prefix `packages/fluxiq/src/programs/automation-studio/`):

| Previous path | Current path |
| --- | --- |
| `runtime/llm/harness-options/resolved-control-intent/contracts.ts` | `runtime/llm/resolved-control-intent/contracts.ts` |
| `runtime/llm/harness-options/resolved-control-intent/index.ts` | `runtime/llm/resolved-control-intent/index.ts` |
| `runtime/llm/harness-options/resolved-control-intent/node-key.ts` | `runtime/llm/resolved-control-intent/node-key.ts` |
| `runtime/llm/harness-options/resolved-control-intent/read.ts` | `runtime/llm/resolved-control-intent/read.ts` |
| `runtime/llm/harness-options/resolved-control-intent/sidecar.ts` | `runtime/llm/resolved-control-intent/sidecar.ts` |

The native move verified that source/destination stayed within this task checkout, refused an existing destination or unexpected source contents, and compared SHA256 before/after for all five files: all five hashes were unchanged. The old directory no longer exists. Only relative import/export paths changed in `harness-options/{binding,index,plan-parameter-resolution,bootstrap-completion}.ts` and `flow-bootstrap/script-statements/way-out-steps.ts`; the public harness export remains type-only with the same name/shape, with no public helpers. The architecture document now names `runtime/llm/resolved-control-intent/`. Tests continue importing the public harness barrel and needed no change. No assertion, implementation or permission/effect policy changed.

Source was re-frozen and root notified before launching the narrow check. Root owns SDK, types, final tracked audit and push. Historical brief text records the original authorized location; this report records the superseding move.

Working directory: `packages/fluxiq`.

```powershell
pnpm.cmd exec vitest run src/programs/automation-studio/runtime/llm/harness-options/tests/plan-parameter-resolution/tests/intent.test.ts src/programs/automation-studio/runtime/flow-bootstrap/script-statements/tests/way-out-steps.test.ts src/programs/automation-studio/runtime/flow-bootstrap/candidate/control-intent/tests/submission.test.ts src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/control-intent/tests/submission.test.ts --maxWorkers=2 --minWorkers=1
```

Observed: PASS, 19/19 tests across all 4 affected files, 59.45s (intent 6, checker 6, actual candidate 5, actual scoped subflow 2). No other checks were relaunched by this worker. Source remains frozen for root's rebuilt SDK/types/tracked audit and push.

## Return contract

Outcome: Done
Changed: resolved-control-intent private reader/key/sidecar/barrel; binding documentation; plan resolution; completion; candidate submission; way-out checker; owning resolution/completion/checker/candidate/subflow tests; architecture doc; this report.
Validation: named 13-file Vitest command -> 162 passed, 1 fixture failure, 62.98s; released test-only fixes; package typecheck -> PASS, 25.788s; targeted two-file rerun -> 11 passed, 1 unsupported-grammar fixture failure, 30.56s; released one-literal correction; direct-checker rerun -> 6/6 PASS, 28.29s; authorized test-directory move rerun -> 7/7 PASS across 2 moved files, 38.36s; authorized private-directory relocation -> all 5 moved-file SHA256 hashes unchanged, affected tests 19/19 PASS across 4 files, 59.45s.
Not verified: root final SDK/types/tracked audit/freshness/cross-repository acceptance and push after relocation, extra route-effect/toggle regressions, live behavior; the worker's successful package typecheck predates the mechanical relocation.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-control-intent/core.md
Notes: Source frozen after the authorized five-file private-directory relocation and import/doc path updates; no semantic/assertion changes. Root owns final SDK/types/tracked audit/push. No production defect observed in actual candidate/subflow transport.
