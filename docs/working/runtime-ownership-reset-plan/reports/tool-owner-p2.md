# P2 configured tool ownership

Status: Exact P2 source move complete and frozen. Original 22-source snapshots were confirmed before edits. Owned-file parity/static checks pass; runtime/type/full-graph acceptance is held for Root common freeze.

## Pre-edit source/symbol manifest

Paths are relative to packages/fluxiq/src/. 19 original top-level declarations are preserved as one canonical implementation each.

| Original | Canonical destination | Exported declaration |
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

## Original owned test/support snapshot

- `programs/automation-studio/runtime/build-execution/tools/tests/auxiliary.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/callback-scope.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/host.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/parent.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/producer.test.ts`
- `programs/automation-studio/runtime/build-execution/forwarding/tests/index.test.ts`

Source state, private maps, bodies/comments/literals and complete local type names move unchanged. The sole outside-owned export write granted is runtime/flow-authoring/execution/index.ts; package.json, assembly, engine/environment/observation and outside consumers remain untouched.

## Outside-consumer proposal (no writes)

Targeted rg import search followed by exact module-literal matching to the original 22 files found 18 outside files / 19 specifiers. Forwarding-only named imports target the narrow canonical forwarding barrel; producer/mixed imports retain the broad owner. All proposed destinations exist. Namespace/star proposals are flagged for Root surface review; this is not a whole graph/type/browser scan.

| Outside file | Exact proposed replacements |
| --- | --- |
| `programs/automation-studio/runtime/build-execution/create.ts` | line 7: `./tools/index.ts` -> `../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/build-execution/index.ts` | line 2: `./bind-tools.ts` -> `../../../../runtime/flow-authoring/execution/tools/index.ts`; line 4: `./tools/index.ts` -> `../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/candidate-trials/contracts/source-input.ts` | line 4: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts` | line 151: `../build-execution/tools/index.ts` -> `../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/flow-bootstrap/candidate/authoring-loop.ts` | line 15: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/flow-bootstrap/site-reset/start-check.ts` | line 70: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/flow-bootstrap/site-reset/tests/read-parent.test.ts` | line 2: `../../../build-execution/tools/index.ts` -> `../../../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| `programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/builder-loop.ts` | line 197: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/llm/harness-options/binding.ts` | line 14: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| `programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts` | line 173: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/llm/harness-options/registry.ts` | line 1: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| `programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | line 45: `../build-execution/forwarding/index.ts` -> `../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| `programs/automation-studio/runtime/project-agents/start-check/execution.ts` | line 1: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| `programs/automation-studio/runtime/route-state/build-routing.ts` | line 11: `../build-execution/tools/index.ts` -> `../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| `programs/automation-studio/runtime/service/flow-bootstrap-commands/cancellation.ts` | line 3: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| `programs/automation-studio/runtime/service/project-build/brief-ports.ts` | line 3: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/index.ts` |
| `programs/automation-studio/runtime/service/project-build/subflow-trials.ts` | line 23: `../../build-execution/tools/index.ts` -> `../../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| `programs/automation-studio/runtime/tests/project-tool-wrappers.test.ts` | line 17: `../build-execution/tools/index.ts` -> `../../../../runtime/flow-authoring/execution/tools/index.ts` |

## Result and one-owner state

Moved the original 19 declarations to 21 canonical source/barrel files. All 22 old modules are direct export-only aliases. Original Requests.values, CallbackContexts.originals, Factories.originals, ProjectBuildToolObservers.values and AuxiliaryCalls.originals WeakMaps move once with their original classes. Observer retry/backend owners, captured issueRun/reader, roots/callbacks, lastCallbacks/descendantOwners, callback-scope arrays/close lifetime and permission objects remain their original bodies and state. No second authority, registry, callback contract grant, cleanup correction or native method substitution was introduced.

Canonical imports reuse complete existing types/classes, preserving original local names with aliases: AuthoringExecutionContext as PartialTrialContext; AuthoringExecutionScope as AutomationStudioSiteResetObservation; ExecutionCallbackPolicies as AutomationStudioSiteResetCallbackPolicies; complete canonical ParkingPort and HarnessOptionLoopBinding. The mixed policy/scope import splits only into the two actual canonical owners.

The original narrow forwarding surface remains ten names. Eleven old module aliases (those ten helper modules plus the forwarding barrel) target the canonical forwarding barrel, avoiding the broad observer/producer barrel in browser forwarding. Canonical tools root additionally exposes the original CallbackContexts/Requests/RequestState leaves for their legacy direct aliases; old tools/index.ts retains its original exact name set. One granted export was added to runtime/flow-authoring/execution/index.ts; all other bytes there are unchanged.

## Owned test imports and identities

- `programs/automation-studio/runtime/build-execution/tools/tests/auxiliary.test.ts:2`: `../index.ts` -> `../../../../../../runtime/flow-authoring/execution/tools/index.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/callback-scope.test.ts:3`: `../index.ts` -> `../../../../../../runtime/flow-authoring/execution/tools/index.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts:6`: `../index.ts` -> `../../../../../../runtime/flow-authoring/execution/tools/index.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/parent.test.ts:5`: `../../bind-tools.ts` -> `../../../../../../runtime/flow-authoring/execution/tools/index.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/parent.test.ts:6`: `../index.ts` -> `../../../../../../runtime/flow-authoring/execution/tools/index.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/producer.test.ts:4`: `../../bind-tools.ts` -> `../../../../../../runtime/flow-authoring/execution/tools/index.ts`

The seven original test/support files are byte-identical outside those six module specifiers (five files changed, two stayed untouched). No assertion, fixture body or original forwarding/parking closure oracle changed. New immediate legacy tools/tests/owner-identity.test.ts covers all 22 original module export-name sets, every runtime binding, observer constructor/prototype and original request companion owner. It remains unexecuted until common freeze.

## Static verification observed

- Pre-edit snapshot check -> all **22 source files** exactly matched the saved approved source snapshots.
- Node/TypeScript owned-declaration comparison -> all **19 complete original declarations are byte-identical**, including full private state/method bodies, member documentation and literals; **22 legacy modules contain direct export-from statements only**.
- Original test reconstruction -> all **7 original test/support files** match exactly after only the **6 recorded specifier replacements**.
- Canonical owned-source scan -> **21 files / 74 relative module edges, all resolved, zero direct imports into programs**. This is not the transitive type/erased closure gate.
- Owned-only value graph -> **43 internal value edges, 0 cycles**; no external value graph was read.
- Scoped budgets -> source directories **20 / 1 files**, both have barrels; maximum file length **222**, maximum class method count **11**, **0 packed statement pairs**.
- Granted execution-barrel reconstruction -> exactly its one tools export and no unrelated byte change.
- Targeted outside import search -> **18 files / 19 exact proposed replacements**, all destinations exist; **8** use the narrow forwarding barrel. No namespace/star surface cases, outside writes, package compiler, runtime test or whole graph reader.

No runtime owner test, compiler/type closure, broad structure/audit, package build, composed benchmark, provider or browser ran for P2. Callback/observed-return accounting work remained active in its separate owner. Source parity is evidence of a mechanical move, not integrated runtime acceptance.

## Held acceptance for Root common freeze

- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/build-execution/tools/tests src/programs/automation-studio/runtime/build-execution/forwarding/tests/index.test.ts --minWorkers=1 --maxWorkers=2`: original producer/parent/callback-scope/auxiliary cases plus new identities and the original full forwarding/parking graph oracle. Preserve authentic receipt and receiver/tuple/result/error behavior, opaque write/throw/reopen zero-repeat, forged-unacted negatives and restoration/foreign-copy checks.
- Canonical source/type/erased closure rooted at runtime/flow-authoring/execution/tools/index.ts, plus actual legacy registry/compatibility compilation from the prior prerequisite unit. Require zero canonical program dependencies and exact symbols.
- Public package rebuild/import and narrow forwarding public export/consumer assignment remain Root-owned. Existing execution public barrel now exposes the producer owner; browser forwarding must use its narrow entry rather than the broad producer barrel. No package.json change was made.
- Original composed positive benchmark remains Root-owned and was not started.

## Exact changed source/test manifest

Paths are relative to packages/fluxiq/src/.

- `programs/automation-studio/runtime/build-execution/bind-tools.ts`
- `programs/automation-studio/runtime/build-execution/forwarding/index.ts`
- `programs/automation-studio/runtime/build-execution/tools/auxiliary-calls.ts`
- `programs/automation-studio/runtime/build-execution/tools/auxiliary.ts`
- `programs/automation-studio/runtime/build-execution/tools/bind.ts`
- `programs/automation-studio/runtime/build-execution/tools/callback-context.ts`
- `programs/automation-studio/runtime/build-execution/tools/callback-scope.ts`
- `programs/automation-studio/runtime/build-execution/tools/create.ts`
- `programs/automation-studio/runtime/build-execution/tools/delegate.ts`
- `programs/automation-studio/runtime/build-execution/tools/descendant.ts`
- `programs/automation-studio/runtime/build-execution/tools/factory.ts`
- `programs/automation-studio/runtime/build-execution/tools/index.ts`
- `programs/automation-studio/runtime/build-execution/tools/inherit.ts`
- `programs/automation-studio/runtime/build-execution/tools/invoke.ts`
- `programs/automation-studio/runtime/build-execution/tools/observer.ts`
- `programs/automation-studio/runtime/build-execution/tools/options.ts`
- `programs/automation-studio/runtime/build-execution/tools/parking-port.ts`
- `programs/automation-studio/runtime/build-execution/tools/permission.ts`
- `programs/automation-studio/runtime/build-execution/tools/project.ts`
- `programs/automation-studio/runtime/build-execution/tools/request.ts`
- `programs/automation-studio/runtime/build-execution/tools/state.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/auxiliary.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/callback-scope.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/owner-identity.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/parent.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/producer.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/with-callback-scope.ts`
- `runtime/flow-authoring/execution/index.ts`
- `runtime/flow-authoring/execution/tools/auxiliary-calls.ts`
- `runtime/flow-authoring/execution/tools/auxiliary.ts`
- `runtime/flow-authoring/execution/tools/bind.ts`
- `runtime/flow-authoring/execution/tools/callback-context.ts`
- `runtime/flow-authoring/execution/tools/callback-scope.ts`
- `runtime/flow-authoring/execution/tools/create.ts`
- `runtime/flow-authoring/execution/tools/delegate.ts`
- `runtime/flow-authoring/execution/tools/descendant.ts`
- `runtime/flow-authoring/execution/tools/factory.ts`
- `runtime/flow-authoring/execution/tools/forwarding/index.ts`
- `runtime/flow-authoring/execution/tools/index.ts`
- `runtime/flow-authoring/execution/tools/inherit.ts`
- `runtime/flow-authoring/execution/tools/invoke.ts`
- `runtime/flow-authoring/execution/tools/observer.ts`
- `runtime/flow-authoring/execution/tools/options.ts`
- `runtime/flow-authoring/execution/tools/parking-port.ts`
- `runtime/flow-authoring/execution/tools/permission.ts`
- `runtime/flow-authoring/execution/tools/project.ts`
- `runtime/flow-authoring/execution/tools/request.ts`
- `runtime/flow-authoring/execution/tools/state.ts`
- `runtime/flow-authoring/execution/tools/with-callback-scope.ts`

Total **50 source/test files plus this report**. Outside proposal rows above are not changed files. Assembly create.ts, gateway-targets.ts and build-execution/index.ts, service/cohort/trials, models, engine/environment/observation, package.json and shared documents were not edited.

Outcome: Done
Changed: Exact 22 original aliases, 21 canonical owner/barrel files, 5 existing owned test/support import files, one immediate identity test, one granted execution-barrel export and this report
Validation: 19 complete declarations exact; 22 direct-only aliases; original 7-test/support bytes preserved except 6 specifiers; owned source 21 files / 74 resolved edges / zero direct program imports; owned value graph acyclic
Not verified: Runtime owner/identity/forwarding tests, transitive canonical type/erased closure, public rebuilt package and integrated graph; outside 18-file/19-specifier proposal remains unassigned
Report: docs/working/runtime-ownership-reset-plan/reports/tool-owner-p2.md
Notes: All owned source frozen. No behavior correction or state duplication. No runtime/compiler/broad reader, package.json, outside source, git or agents.
