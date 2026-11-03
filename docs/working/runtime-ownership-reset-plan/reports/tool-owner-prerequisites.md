# Complete tool contracts and P2 actor preparation

Status: Prerequisite source complete and frozen. P2 production actors remain untouched. Exact dependency-complete P2 move manifest prepared below for Root release. Original prerequisite declarations/source were captured before edits.

## Pre-edit declaration manifest

- `AutomationStudioLlmEvidenceToolExecutionResult`: `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/tool-execution.ts` -> `packages/fluxiq/src/runtime/agents/tools/execution-result.ts`; original declaration SHA-256 `8d110b8b2148c2aa59dbd455a1876cdd2d14f225333dda958c7ec573eccc9f9b`; complete top-level fields: `kind`, `evidence`, `effectApplied`, `failure`, `actionability`, `targetsUnchanged`, `resultCode`, `resultReason`, `diagnostic`, `repeatedAnswer`, `personNeeded`, `nodeId`, `stateDigests`, `routeState`, `outputs`, `draft`.
- `AutomationStudioHarnessOptionLoopBinding`: `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/registry.ts` -> `packages/fluxiq/src/runtime/agents/tools/harness-binding.ts`; original declaration SHA-256 `4edc5dbdddf6bc17810d296406b033437b62b916c3c216c491fcdcad7aa8aacc`; complete top-level fields: `tools`, `executeTool`, `observedStateKeys`.

Canonical sources reused without edits: runtime/agents/tools/definition.ts; the complete draft step Change/Condition/Toggle types through runtime/flow-authoring/draft/step/index.ts; full Replay through draft/replay/index.ts; full ActionPermissionCheck through flows/executable/permissions/index.ts. Earlier admission preparation called these draft/tool declarations prerequisites; that statement is superseded by the actual current canonical declarations.

## Held checks

Root confirmed canonical strict/type compatibility and stable parser-only checks may run. Original registry/observed-state runtime cases wait for the common freeze because their tool registry reaches active engine/environment owners.

## Prerequisite result and validation

Changed source/test files:

- programs/automation-studio/runtime/llm/evidence-loop/tool-execution.ts: direct canonical type reexport only.
- programs/automation-studio/runtime/llm/harness-options/registry.ts: only the complete binding declaration became a direct type reexport; one canonical type import supports the existing class. All other bytes/imports/runtime statements retained.
- runtime/agents/tools/execution-result.ts: full original 16-field result and every nested draft field/comment/literal; original file documentation retained.
- runtime/agents/tools/harness-binding.ts: full original tools/executeTool/observedStateKeys declaration and exact executeTool arguments/rich return union.
- runtime/agents/tools/index.ts: new complete type exports; existing definition export unchanged.
- programs/automation-studio/runtime/llm/harness-options/tests/tool-owner-contracts.test.ts: legacy/canonical exact type expectations, including executeTool tuple and return.

Observed local checks:

- Saved-source/TypeScript AST comparison: **both complete moved declaration texts are byte-identical**, including member documentation and literals; all **12 other registry top-level statements** and every unrelated registry byte remain exact. Execution-result original file documentation is also preserved. Old symbols are direct exports; no same-name alias declarations were introduced.
- Strict no-emit TypeScript program rooted at runtime/agents/tools/index.ts, using package compiler flags: **623 Core source modules, 0 diagnostics, 0 program modules**. Root will repeat at the common freeze because rich type barrels include engine modules; this local result is not an integrated gate.
- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/harness-options/tests/tool-owner-contracts.test.ts --minWorkers=1 --maxWorkers=1` -> **1 file / 2 tests collected and passed**, 624 ms wall, 18 ms collection, 2 ms test time. These expectTypeOf bodies erase at runtime: this result proves isolated collection only, not compile-time compatibility.
- Per Root follow-up, **real compatibility test + whole registry compile waits for the common freeze**. No projection infrastructure was created or run. Canonical strict closure and exact saved-original field/docs parity are the current local prerequisite evidence.
- Registry, observed-state and apparent parser-only diagnostic/authored-draft runtime files were held: their broad legacy value barrels reach the active observation/engine graph. No original runtime/provider/browser test or whole-package reader/build was launched for those files.

## Exact P2 source move manifest

Paths below are relative to packages/fluxiq/src/. These are preparation rows only: **no source file in this table has been moved or edited**. 22 original source modules become 21 canonical source/barrel files; bind-tools.ts remains a direct compatibility export. Original source snapshots/hashes are retained outside the repository for dispatch parity; the next worker must confirm they still match before editing.

| Original | Canonical destination | Actual exported declaration |
| --- | --- | --- |
| `programs/automation-studio/runtime/build-execution/bind-tools.ts` | Compatibility export to runtime/flow-authoring/execution/tools/index.ts | barrel only |
| `programs/automation-studio/runtime/build-execution/forwarding/index.ts` | `runtime/flow-authoring/execution/tools/forwarding/index.ts` | barrel only |
| `programs/automation-studio/runtime/build-execution/tools/auxiliary-calls.ts` | `runtime/flow-authoring/execution/tools/auxiliary-calls.ts` | `AutomationStudioBuildToolAuxiliaryCalls` |
| `programs/automation-studio/runtime/build-execution/tools/auxiliary.ts` | `runtime/flow-authoring/execution/tools/auxiliary.ts` | `invokeAutomationStudioBuildToolAuxiliary` |
| `programs/automation-studio/runtime/build-execution/tools/bind.ts` | `runtime/flow-authoring/execution/tools/bind.ts` | `bindAutomationStudioObservedBuildTools` |
| `programs/automation-studio/runtime/build-execution/tools/callback-context.ts` | `runtime/flow-authoring/execution/tools/callback-context.ts` | `AutomationStudioBuildToolCallbackContexts` |
| `programs/automation-studio/runtime/build-execution/tools/callback-scope.ts` | `runtime/flow-authoring/execution/tools/callback-scope.ts` | `AutomationStudioBuildToolCallbackScope` |
| `programs/automation-studio/runtime/build-execution/tools/create.ts` | `runtime/flow-authoring/execution/tools/create.ts` | `createAutomationStudioBuildToolObserver` |
| `programs/automation-studio/runtime/build-execution/tools/delegate.ts` | `runtime/flow-authoring/execution/tools/delegate.ts` | `invokeAutomationStudioBuildToolDelegate` |
| `programs/automation-studio/runtime/build-execution/tools/descendant.ts` | `runtime/flow-authoring/execution/tools/descendant.ts` | `inheritAutomationStudioBuildToolDescendant` |
| `programs/automation-studio/runtime/build-execution/tools/factory.ts` | `runtime/flow-authoring/execution/tools/factory.ts` | `AutomationStudioBuildToolFactories` |
| `programs/automation-studio/runtime/build-execution/tools/index.ts` | `runtime/flow-authoring/execution/tools/index.ts` | barrel only |
| `programs/automation-studio/runtime/build-execution/tools/inherit.ts` | `runtime/flow-authoring/execution/tools/inherit.ts` | `inheritAutomationStudioBuildToolRequest` |
| `programs/automation-studio/runtime/build-execution/tools/invoke.ts` | `runtime/flow-authoring/execution/tools/invoke.ts` | `invokeAutomationStudioBuildToolCallback` |
| `programs/automation-studio/runtime/build-execution/tools/observer.ts` | `runtime/flow-authoring/execution/tools/observer.ts` | `AutomationStudioBuildToolObserver` |
| `programs/automation-studio/runtime/build-execution/tools/options.ts` | `runtime/flow-authoring/execution/tools/options.ts` | `AutomationStudioBuildToolObserverOptions` |
| `programs/automation-studio/runtime/build-execution/tools/parking-port.ts` | `runtime/flow-authoring/execution/tools/parking-port.ts` | `observeAutomationStudioBuildToolParkingPort` |
| `programs/automation-studio/runtime/build-execution/tools/permission.ts` | `runtime/flow-authoring/execution/tools/permission.ts` | `AutomationStudioBuildToolPermissions` |
| `programs/automation-studio/runtime/build-execution/tools/project.ts` | `runtime/flow-authoring/execution/tools/project.ts` | `AutomationStudioProjectBuildToolObservers` |
| `programs/automation-studio/runtime/build-execution/tools/request.ts` | `runtime/flow-authoring/execution/tools/request.ts` | `AutomationStudioBuildToolRequests` |
| `programs/automation-studio/runtime/build-execution/tools/state.ts` | `runtime/flow-authoring/execution/tools/state.ts` | `AutomationStudioBuildToolRequestState` |
| `programs/automation-studio/runtime/build-execution/tools/with-callback-scope.ts` | `runtime/flow-authoring/execution/tools/with-callback-scope.ts` | `withAutomationStudioBuildToolCallbackScope` |

## Exact legacy-to-canonical dependency replacements for P2

| Old import and owned consumer | Canonical import preserving the original local name |
| --- | --- |
| tools/bind.ts: AutomationStudioHarnessOptionLoopBinding from ../../llm/harness-options/index.ts | Same complete type from runtime/agents/tools/index.ts (prerequisite now complete). |
| tools/callback-scope.ts and tools/observer.ts: PartialTrialContext from ../../candidate-trials/partial/index.ts | `AuthoringExecutionContext as PartialTrialContext` from runtime/flow-authoring/execution/observation/index.ts; the old type is already that exact alias. |
| tools/callback-scope.ts and tools/observer.ts: AutomationStudioSiteResetObservation from ../../flow-bootstrap/reset-observation/index.ts | `AuthoringExecutionScope as AutomationStudioSiteResetObservation` from runtime/flow-authoring/execution/observation/index.ts; retain the original class/map/receiver. |
| tools/observer.ts: AutomationStudioSiteResetCallbackPolicies from the same reset-observation barrel | `ExecutionCallbackPolicies as AutomationStudioSiteResetCallbackPolicies` from runtime/execution-observation/policies/index.ts. The original mixed import splits into these two canonical value imports. |
| tools/parking-port.ts: AutomationStudioParkingPort from ../../parking/index.ts | Same complete type from runtime/parking/index.ts, already its canonical owner. |
| Other external imports in the twenty tools files | Existing canonical runtime/execution-admission, runtime/execution-observation, runtime/output-dispatch/admission and authoring execution observation owners; recalculate relative addresses only. No new dependency owner is required. |
| Original tools/index.ts -> ../forwarding/index.ts | New tools/index.ts -> ./forwarding/index.ts. New forwarding barrel imports its actual parent leaf modules; it must not import the broad tools barrel, which would load the observer/cohort and create a cycle. |

Do not replace the full observer by AuthoringExecutionToolPort or shrink options/state/permission/run-binding fields. The existing narrow AuthoringExecutionToolPort is consumed by the complete AuthoringExecutionContext; the original observer class still implements its real full behavior and private state. Type-only engine references already present in those rich contracts remain unchanged. No engine-dependent cohort create/gateway-targets or trial source mechanism is part of P2.

## P2 single state owners and exact alias strategy

Move the original AutomationStudioBuildToolRequests.values, CallbackContexts.originals, Factories.originals, ProjectBuildToolObservers.values and AuxiliaryCalls.originals WeakMaps once. Move the observer with original retry-series/backend-attempt owners, captured issueRun/reader receiver, lastCallbacks/descendantOwners maps, roots and callback source. Preserve callback-scope restoration arrays/close flag and the exact permission object lifetime. Bind/delegate/invoke/auxiliary/parking helpers retain original callback function, receiver, argument tuple, signal, result/error and authentic Promise receipt behavior. No cleanup correction, authority duplicate, extra registry or new observation admission is bundled.

Old helpers exported by the ten-name browser forwarding barrel must reexport from the new canonical forwarding barrel, retaining the same ten public names. Other old producer/cohort classes/types reexport their exact canonical owner. The canonical tools barrel may explicitly expose its original hidden Request/CallbackContext/State leaves where direct legacy aliases need them; the old tools root must keep its original name set rather than accidentally exporting newly public internal names. Check actual old export sets before editing. Do not route a browser forwarding alias through the broad tools root.

## Exact P2 test/support manifest (retain original oracles)

- `programs/automation-studio/runtime/build-execution/forwarding/tests/index.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/auxiliary.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/callback-scope.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/host.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/parent.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/producer.test.ts`

Keep these integration tests in legacy ownership where they exercise the real legacy harness/client composition; retarget only owned subject imports. New alias identities belong in immediate legacy tools/tests (capacity is available), not canonical tests importing Studio. The original forwarding test builds a repository-wide graph, so its exact assertions wait for the common freeze; a finite scoped forwarding/parking value-closure inspection can run earlier if its closure is stable.

Original acceptance after release and a stable closure: `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/build-execution/tools/tests src/programs/automation-studio/runtime/build-execution/forwarding/tests/index.test.ts --minWorkers=1 --maxWorkers=2`. Preserve producer direct-write/throw/reopen, authentic receipt, forged-unacted negatives; parent retry identity; callback scope receiver/root/restoration and foreign-copy negatives; auxiliary opaque throw/fulfilled retry fences; pinned parking port methods/arguments. Also run declaration/source/type/program-free closure and exact old aliases. No provider, browser or whole positive benchmark is required to prove this mechanical P2 owner move.

## Root-owned export and consumer follow-up

- Extend runtime/flow-authoring/execution/index.ts with the canonical tools barrel. Existing public `fluxiq/runtime/flow-authoring/execution` can expose the producer surface.
- Add a narrow browser-compatible package subpath such as `./runtime/flow-authoring/execution/tools/forwarding` pointing at its actual dist type/import entry if a direct importer is migrated to this public forwarding seam. There is currently no forwarding/build-execution package export. Root owns package.json and public export coordination; never make a browser importer use the broad execution/producer barrel.
- Keep old build-execution/bind-tools.ts as a direct canonical bind export. Old build-execution/index.ts mixes P2 exports with P4 create/gateway targets; do not move its remaining production assembly or edit it broadly. Its existing tools export can continue through the compatibility barrel.
- Outside source consumers must be inventoried and exclusively assigned by Root after P2 scope release. This preparation inspected only the named P2 sources and imports; it does not claim outside consumer retargeting.

## Ready-to-dispatch P2 ownership brief

Role heavy worker; existing supported model/effort. Goal: move only the exact 22-module tools/forwarding/bind compatibility unit above, preserving original bodies/maps/exports. Own old runtime/build-execution/tools/**, forwarding/**, bind-tools.ts, new runtime/flow-authoring/execution/tools/** and one owner report. Root owns execution/index.ts, package exports and outside consumers. Must not touch build-execution/create.ts, gateway-targets.ts, service/cohort/trial actors, models, engine, environment/observation, shared documents or git. Reuse completed canonical tool execution result/binding and existing full context/parking/policy contracts. Snapshot first, use exact local-name import aliases, preserve browser forwarding and original state once, then leave exact legacy reexports. Run source/type/declaration and original owner tests only on the agreed frozen closure; keep whole graph readers for Root. Return a finite report and freeze.

Local structural inspection after the final source change: canonical tools has **4 source files, including its barrel**, all **11 relative edges resolve**, maximum file length **239**, **0 packed statement pairs**, **0 value imports**; immediate legacy harness tests have **24 source files**, within the 25-file budget. This is a scoped invariant inspection, not the repository-wide audit.

Outcome: Done
Changed: Two complete prerequisite types moved with direct legacy exports; registry import/export extraction only; tools barrel; one legacy compatibility test; this report
Validation: Both declaration/docs/literal texts byte-identical; 12 other registry top-level statements and unrelated bytes exact; canonical tools closure 623 modules / 0 diagnostics / 0 programs; isolated compatibility test collection 2 passed (not a type-proof claim)
Not verified: Real legacy compatibility-test compilation and original registry/parser runtime acceptance at the common freeze; emitted public package; P2 actor move not yet authorized or executed
Report: docs/working/runtime-ownership-reset-plan/reports/tool-owner-prerequisites.md
Notes: Six source/test files and this report changed. Prerequisite source frozen; exact 22-source/7-test-support P2 manifest ready. No projection infrastructure, P2 production edits, git or agents.
