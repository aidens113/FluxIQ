# Actual build-tool producer implementation

SOURCE FROZEN. [Implementation brief](../briefs/build-tool-producer-implementation.md); [discovery](build-tool-producer-path.md). All worker processes finished; Root/C/R7 read holds explicitly released.

## Implemented behavior

One configured `AutomationStudioBuildToolObserver` uses the original roots/callbacks and ORIGINAL continuation's run-binding methods. Those methods and receivers are pinned at construction. Ordinary invocation awaits authenticated original-root proof preparation before invoking its original callback. An admitted-parent request uses only a child entry under that original reservation; it never reserves, finishes or releases another root.

Private request companions advance through the actual Core loop, registry input copy, selected-implementation copy, final installed-binding request and cancellation signal copy. They retain the actual parent, authentic run proof/reader and logical retry series. No handles/series/roles enter request properties, model values, native contexts, host arguments or JSON. Serialized/structurally matching data does not inherit companions; conflicting or preparing requests refuse.

`prepareParent(originalRequest, actualParent, ORIGINALroot)` creates a scope handoff and awaits the original continuation's issuance. `bindParent(freshCall, actualParent, originalScopeOptions)` preserves that proof and mints one fresh logical series for the authored call. Copies of an actual invocation retain its series. There is no method/parameter/reservation-wide retry fence and no counter reset.

The actual installed raw callback gets its own durable entry BEFORE invocation, with the original receiver/function and typed argument tuple. Checked snapshot construction privately records its original data-function pairs, including startState, without evaluating getters again. `automationStudioLlmBindingFieldOrigin` authenticates the original snapshot AND pinned forwarded function; copied/replaced/getter-produced callbacks retain their supplied unsupported pair. Nested snapshots still resolve to the original private host receiver.

Original raw results/promises are observed before descriptive wrapping or public normalization. Completion uses the existing configured Source policy and its actual `returned` object/promise; public effect/result flags grant nothing. Exact Core-created wrappers are privately identified and close only through observed descendants; Core's recall compute branch and actual describe-nodes implementation retain their real compute behavior. Arbitrary installed callbacks remain unsupported.

The initial adversarial test exposed a real gap: an unreceipted callback could write, fulfill with forged unacted flags, leave only unverified history and run again through a fresh ordinary root. Root authorized the fix at this producer boundary: after an actual raw callback returns, if its Source completion is not settled, mark its original invocation unknown and await Source.flush BEFORE returning its original result. This persists the existing terminal-unknown fact. Generic Source/root/kernel algorithms, contracts, storage and result parsing are unchanged. Genuine no-direct or private-receipt completion still permits distinct authored calls.

No Core.run_node native adapter was fabricated. The raw callback remains the actual raw callback; genuine native/output adapters and command authority remain their existing owners. Root separately wired create/service/cohort/project/trial-environment composition. C retains actual beforeTrial/startState/reset/offline/metadata integration.

## Owned paths

Existing sources changed:

- `runtime/build-execution/bind-tools.ts`.
- `runtime/llm/harness-options/{registry,binding}.ts`.
- `runtime/llm/domain-instructions/binding-snapshot.ts`.
- `runtime/service/flow-bootstrap-commands/cancellation.ts`: exact request-copy forwarding only.
- `runtime/service/project-build/brief-ports.ts`: fresh harness companion lookup/binding only.

New cohesive features under `programs/automation-studio/runtime/`:

- `build-execution/tools/{options,state,request,factory,project,inherit,invoke,create,observer,index}.ts`.
- `llm/binding-origin/{origins,read,index}.ts`.
- Immediate tests/support: `build-execution/tools/tests/{fixture,host,producer.test,parent.test}.ts`; `llm/binding-origin/tests/read.test.ts`.

The initially introduced `llm/domain-instructions/field-origin/**` files were moved, with Root authorization, to `llm/binding-origin/**` to satisfy the existing depth limit. Their function API stayed identical; there was no legacy/public API at the removed new path. Tests use the existing checked-binding export and actual snapshot path, with no new internal-snapshot public export. Parent barrels/service/create/Source/configuration remain Root-owned.

## Observed checks

- Final exact command below -> **3 files / 7 tests passed**, 42.85 seconds.
- Direct private write then original throw: actual raw entry exists before the write, original error object retained, fresh call/reopened scope sends zero additional writes, durable history pending.
- Authentic original Promise receipt: original private receiver works through checked snapshots and all registry copies, two distinct authored calls execute once each, references/referenceNow preserved, scope clear.
- Forged unacted fulfilled result: first result preserved, fresh changed-input call and reopened scope refuse before the second send, durable history pending.
- Admitted-parent cases: zero ordinary tool roots, original root identity/proof retained, genuine receipted authored calls each run once and only the actual parent owner finishes its root. Scheduled forwarding of the SAME original backend request preserves the exact `execution_observation.unverified_backend_retry` refusal and counter remains one.
- Binding-origin cases: actual original execution/startState method pairs survive nested checked snapshots; copied snapshots gain no origin; snapshot creation and provenance lookup do not re-read host getters.
- Final source-closed strict check: package tsconfig options, 24 owned source/test roots, noEmit, incremental=false -> **4,993 source files / 0 diagnostics**.
- Final scoped existing 15 structural rules over complete context/import graph, retain owned-file/directory findings, then apply unchanged baseline -> **0 failures**. Five existing advisory warnings (three wide legacy directories and two large legacy files), three pre-existing ratcheted findings. Trailing whitespace/final-newline check -> **0**. No config/baseline/waiver changes.

Rule set: as-never, class-methods, directory-files, exported-values, failure-as-empty, file-lines, import-cycles, imports, naming, regexp-template-escapes, restricted-references, shared-temp-root, statement-packing, swallowed-failure, test-placement.

Correction history: first actual five-case run passed four and exposed the genuine forged-return reentry above. After the authorized producer fix, all producer cases passed; a new parent assertion expected an open root after terminal unknown, while the authority correctly reported blocked. It now requires blocked for that negative case and open only for the genuine positive case, retaining exact backend error/counter/root assertions. Structure also caught the over-deep new helper directory and an internal Snapshot import in a new test; both were corrected without exceptions. All final checks above passed on frozen sources.

## Exact acceptance command

Workdir: `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ/packages/fluxiq`.

```powershell
pnpm.cmd exec vitest run src/programs/automation-studio/runtime/build-execution/tools/tests/producer.test.ts src/programs/automation-studio/runtime/build-execution/tools/tests/parent.test.ts src/programs/automation-studio/runtime/llm/binding-origin/tests/read.test.ts --minWorkers 1 --maxWorkers 3
```

Stable composition API:

```ts
createAutomationStudioBuildToolObserver({ scope, roots, callbacks, runBindings: originalContinuation });
AutomationStudioProjectBuildToolObservers.bind(originalProjectOrTrialEnvironment, observer);
AutomationStudioProjectBuildToolObservers.of(originalObject);
observer.prepareParent(freshScopeOptions, actualParent, ORIGINALroot); // await
observer.bindParent(freshCall, actualParent, originalScopeOptions);
inheritAutomationStudioBuildToolRequest(originalRequest, freshCopy);
automationStudioLlmBindingFieldOrigin(snapshot, field, pinnedCallback);
```

Not verified in this worker: coordinated whole-service/project-builder/real SQL command integration, C's later reset/startState/offline wiring, actual gateway/native/browser behavior, existing broad package suites/builds, providers or paid runs. Actual registry/callback execution and genuine A1 authority were exercised with a persistence fake; no SQL row/DTO was accepted as original authority. Root owns independent acceptance and shared integration.

Outcome: Done
Changed: 24 owned production/test/support files and this report; new helper old path removed during the same unit
Validation: final 3 files / 7 tests pass; source-closed strict 0; scoped 15 rules 0 failures; whitespace 0
Not verified: coordinated service/SQL/C integration, package/full/downstream acceptance
Report: docs/working/runtime-ownership-refactor/reports/build-tool-producer-implementation.md
Notes: Source frozen; read holds released; no worker processes. Root-approved raw unknown completion uses existing durable evidence. No git/config/baseline/shared-source edits by this worker.
