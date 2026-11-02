# Execution foundations implementation

R2 accepted by the lead after independent tests and dependency-closure checks.
R4 implemented in paired Core `fxwork/t843/!FluxIQ`; production source is frozen
for lead acceptance. Both groups preserve old entry points through their
canonical owners. No git actions ran in this worker lane.

## R2 ownership delivered

Paths below are relative to `packages/fluxiq/src`.

| Canonical owner | Actual authority moved |
| --- | --- |
| `runtime/environment/` | Environment contract, live/scoped environments, the one channel AsyncLocalStorage, virtual clock and timer implementation, and the unreferenced abortable default wait. Clock signatures are explicit; this base feature imports no engine types. |
| `engine/automation/environment/` | The actual environment-to-executor-options adapter. Its options type comes from `../contracts/index.ts`, so adding a parent engine export does not create a barrel cycle. Live randomness and timers remain unchanged; offline values remain supplied. |
| `runtime/run-control/` | Controller, project/run registry, host registry reader and adapting marker. Existing `runtime/automation-host` DTOs remain the type authority. |
| `runtime/run-control/progress/` | Pure status decision, existing progress vocabulary and minimal execution facts. Persisted status is imported as `ExecutableFlowRunStatus` through `flows/executable/execution/index.ts`; no second persisted-status declaration. |
| `runtime/host-resources/` | Scheduler, lease scope, stale/contract errors and the exact port-keyed WeakMap registry from Studio's dispatch host-lease module. Existing host DTOs remain authoritative. |

The old environment/control/resource leaves and feature barrels now forward
exact named canonical exports. `engine/automation/pacing/run-wait.ts` is an
exact forward to the lower-level wait. Studio's environment barrel composes
the base runtime and engine adapter. Its progress UI retains labels and the
existing browser/page detail strings; only the generic decision moved here.
The remaining wording/presentation cut belongs to R8 as previously recorded.

There is one channel scope store, one lease scope store/strict-held map, one
port-keyed scope WeakMap and one class identity for each moved class. No host
or port clones/proxies, registry wrappers, new persisted fields, empty defaults
or digest/snapshot changes were introduced.

## Tests and compatibility

Pure environment/clock/deadline, controller/registry, scheduler and lease/gateway
tests moved beside their canonical subjects. Their original assertions remain.
The old timer test was split between canonical clock/scope and engine adapter
tests. The old lease test was split between six canonical lease/gateway cases
and its unchanged Studio canonical-Flow integration case. Shared test helpers
moved with the canonical lease tests rather than being copied.

New direct tests cover shared capacity and queueing for the exact port, independent
ports, generic progress decisions, old/new class/function equality, both directions
of channel scope reads, lease scope identity and the old private registry facade.
The registry facade test is in
`programs/automation-studio/runtime/project-agents/dispatch/tests/host-lease/tests/compatibility.test.ts`:
it reaches its subject inside the same feature without importing the full
dispatcher barrel or adding a source file to the already full direct test directory.

## Observed validation

Commands ran only in the paired t843 Core checkout. No whole-package check,
build, full suite, provider call, browser/panel action or git command ran.

```text
pnpm.cmd --filter fluxiq exec vitest run src/runtime/environment src/runtime/run-control src/runtime/host-resources src/engine/automation/environment src/programs/automation-studio/runtime/run-control/tests src/programs/automation-studio/runtime/environment/tests/compatibility.test.ts src/programs/automation-studio/runtime/project-agents/host-resources/tests/compatibility.test.ts src/engine/automation/pacing/tests/pace-keeper.test.ts --reporter dot
-> 16 test files passed; 91 tests passed; 11.21s.

pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/project-agents/host-resources/tests/compatibility.test.ts src/programs/automation-studio/runtime/project-agents/dispatch/tests/host-lease src/engine/automation/environment --reporter dot
-> Final changed-path rerun: 4 test files passed; 8 tests passed; 3.17s.

node .fluxiq/refactor/r2-typecheck.cjs
-> 72 owned files, 0 errors; TypeScript API probe using package compiler options.

node .fluxiq/refactor/r2-closure.cjs
-> All-import closure including erased types: environment 287, run-control 491,
   host-resources 488 source modules; 0 reach to Studio or engine.
```

The ignored replay probes inspect only this task checkout. The type probe requests
syntactic/semantic diagnostics only for owned files, rather than whole-package
diagnostics. The closure probe resolves import/export/dynamic-import/import-type
edges through the package tsconfig and examines all in-repository dependencies.

The selected structure command was:

```text
node scripts/structure-audit.mjs --rule imports --rule import-cycles --rule module-reach --rule naming --rule directory-files --rule file-lines --rule class-methods --rule exported-values --rule statement-packing --rule as-never --rule failure-as-empty --rule swallowed-failure --rule test-placement --rule web-vocabulary --json
```

An initial added compatibility test bypassed the dispatch barrel. Its identity
assertion now lives beside the dispatch subject, fixing the cause without an
exception. The subsequent import audit had zero R2 failures/warnings. The earlier
selected-rule audit had no other R2 findings. No baseline/config change was made.
Full-tree failures were from concurrently edited lanes, so the overall audit
exit was 1. Evidence: `.fluxiq/refactor/r2-selected-audit.json` and
`.fluxiq/refactor/r2-import-audit.json`.

Non-owned paths observed during those probes: Studio `runtime/tests` directory
count; Studio `normalization/{contracts,default-normalizer}.ts`,
`runtime/recording-controller.ts`, and
`model/tests/framework-state-recording-compatibility.test.ts` import boundaries;
contracts `runtime/actions` and `state/contracts` filename prefixes; component
`automation/target-refresh/tests/resolve.test.ts` packed statement. Lead was
notified; no changes attempted there. These are point-in-time findings while
those lanes were active, not a final integrated-tree verdict.

A temporary test import through the full dispatch barrel also passed 3 files /
7 tests, but took 137.21s to transform its broad dependency graph. The final
focused subject placement avoids that unnecessary dependency expansion. No test
assertion was weakened and no process was stopped.

## Lead integration and limits

Lead owns public package exports, parent runtime/engine/Studio barrels,
`programs/_shared/runtime.ts` retargeting, new mechanical boundary configuration,
shared architecture/ledger updates and all git work. Ready feature barrels:
`runtime/environment`, `runtime/run-control`, `runtime/host-resources`, and
`engine/automation/environment`. Base environment deliberately excludes the
executor adapter.

Not run here while other source lanes were active: retained Studio fixture/trace
environment runs, its lease-to-canonical-Flow integration, whole-package
typecheck/build, final integrated structural gate or downstream acceptance.
Lead should rerun the focused command plus
`src/programs/automation-studio/runtime/environment/tests` and
`src/programs/automation-studio/runtime/project-agents/host-resources/tests`
after source stabilization. R4 began only after the lead accepted R2.

## R4 ownership delivered

| Canonical owner | Actual authority moved |
| --- | --- |
| `flows/executable/compiled-plan/` | Schema/compiler markers, plan/node/edge/instruction/input DTOs, deterministic compiler, assertion, serialization/digest and minimal executable graph projection. |
| `flows/executable/graph/start-node.ts` | The existing pure start-node rule and choice type. The engine leaf forwards through the graph feature barrel added by the lead. |
| `flows/executable/composite/snapshot/` | `ExecutableFlowSnapshot`, actual immutable-content capture/cloning, dependency pins, capability union and historical snapshot digest. No publication/name/timestamp requirement. |
| `flows/executable/composite/validation/` | Actual composition, cycle, binding and scope validation. Root facts require only flow id, nodes and scope; snapshots use the executable snapshot contract. |
| `flows/executable/composite/{definition-id.ts,call/create.ts}` | Composite definition address and Call Flow node construction. Existing DSL configuration reader and target/binding/configuration leaves remain unchanged. |
| `components/automation/composite/` | Actual palette/node-definition projection and value-type mapping from executable contracts plus supplied display text. |
| `engine/automation/compiled-plan/` | Assertion/start/run execution of supplied compiled plans through their executable graph projection. |
| `engine/automation/composite/` | The actual `AutomationStudioCanonicalExecution` class, its single private callback WeakSet and the supplied-snapshot runner. Minimal `AutomationStudioCompositeFlow` requires no Studio project/publication/editor envelope. |

Studio `model/composites.ts` now owns publication/display metadata, mutable
publication records and the publication wrapper over canonical snapshot capture.
Its reusable helpers forward exactly. Studio `runtime/compiled-plan.ts` retains
the explicit legacy document-envelope projection and legacy classifier adapter;
its compiler/assertion/DTO exports forward. Studio's old composite owner is an
exact class forward, and its run wrapper supplies the existing legacy classifier
through options. Hosts and snapshots are not cloned for compatibility.

Compiled graph projection preserves its project id as the existing opaque host
scope. Composite execution preserves its document flow id as the opaque scope
used before the move. It constructs only the executable graph facts; it no longer
manufactures schema, owner-kind, display name or creation/update timestamps.
Original supplied snapshots remain the objects used by frame construction and
the catalogue. Temporary region-compilation arguments project defined optional
values without mutating stored objects or provenance/digest inputs.

The only additional authorized source change is the value import in
`engine/automation/frames/call-subflow.ts`: it now imports the boundary from
`../composite/boundary.ts`. Expanding the composite barrel otherwise introduced
an 18-module cycle through the graph runner and frames. The import rule recognizes
the actual cycle-breaking leaf dependency; no configuration exception was added.

## R4 invariants and tests

Pre-move compiler/snapshot results were captured in the ignored
`.fluxiq/refactor/r4-before.json` before source changes. Permanent canonical
tests assert those literal digests, both accepted compiled-plan digest forms,
undefined-to-null plan serialization, absent versus empty snapshot optionals,
dependency insertion order and sorted capability union. The two serializers
remain capability-owned and distinct.

Original four compiled-plan run cases moved out of Studio's executor test into
the canonical engine feature. Original four pure composition cases moved out of
the Studio model test into canonical validation with minimal executable fixtures.
The start-node tests split into seven pure graph cases and nine engine execution
cases, retaining original assertions and shared neutral fixtures. Publication
projection remains a real Studio consumer. New tests cover direct minimal engine
execution, nested pinned snapshots, grants intersecting actual host authority,
explicit undefined root optionals, snapshot isolation, node-definition projection,
callback registration and exact old/new function/class identity.

Observed commands, all in paired t843 Core:

```text
pnpm.cmd --filter fluxiq exec vitest run src/flows/executable/composite/validation src/engine/automation/compiled-plan src/programs/automation-studio/model/tests/composites.test.ts src/programs/automation-studio/runtime/tests/composite-executor.test.ts --reporter dot
-> Initial migration checkpoint: 4 files, 15 tests passed; 76.14s.

pnpm.cmd --filter fluxiq exec vitest run src/flows/executable/compiled-plan src/flows/executable/composite src/components/automation/composite src/engine/automation/compiled-plan src/engine/automation/composite src/programs/automation-studio/model/tests/composites.test.ts src/programs/automation-studio/runtime/composite-execution/tests/ownership.test.ts --reporter dot
-> Canonical/compatibility checkpoint: 8 files, 26 tests passed; 19.29s.

pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/composite-execution/tests/child-uncertainty.test.ts src/programs/automation-studio/runtime/tests/composite-executor.test.ts src/programs/automation-studio/runtime/tests/executor.test.ts src/programs/automation-studio/model/tests/flows.test.ts src/programs/automation-studio/storage/project/tests/compiled-plan-store.test.ts --reporter dot
-> Retained integration: 5 files, 27 tests passed; 56.54s, including all 4 real SQL compiled-plan-store cases.

pnpm.cmd --filter fluxiq exec vitest run src/flows/executable/graph/tests/start-node.test.ts src/engine/automation/graph-navigation/tests/start-node.test.ts src/engine/automation/composite/tests/run.test.ts --reporter dot
-> Final start-node split/nested/cycle-correction checkpoint: 3 files, 21 tests passed; 14.13s.

node .fluxiq/refactor/r4-typecheck.cjs
-> 62 owned files, 0 errors, package compiler options with owned-file diagnostics only.

node .fluxiq/refactor/r4-closure.cjs
-> All-import closure including erased types: compiled-plan 323, executable composite 310,
   component composite 329 modules; 0 Studio/engine reach. Engine compiled 951/composite 940
   modules; 0 Studio reach. 0 violations overall.

node scripts/structure-audit.mjs --rule imports --rule import-cycles --json
-> Final cycle correction: 0 import-cycle findings, 0 R4 failures/warnings.
   Overall exit 1 from four non-owned R5 import findings.
```

The earlier full selected-rule probe used the R2 rule list above. Its only R4
failures were the three cycle members introduced by the expanded barrel, all
resolved by the authorized boundary import correction. No R4 naming, file/directory
size, exports, packing, unsafe-cast, failure-handling, placement or web-vocabulary
finding was introduced. Initial evidence is `.fluxiq/refactor/r4-selected-audit.json`;
final import/cycle evidence is `.fluxiq/refactor/r4-cycle-audit.json`. Initial
non-owned findings also included the shared Studio runtime test count and an
in-flight output-dispatch target filename group; lead owns their integration.

## R4 lead integration and limits

Ready feature barrels: `flows/executable/compiled-plan`, executable composite
snapshot/validation/call and its feature barrel, `components/automation/composite`,
`engine/automation/compiled-plan` and existing `engine/automation/composite`.
Parent exports, package exports, mechanical boundaries and shared documentation
remain lead-owned. No model/flow-adaptation, SDK/native, IO-dispatch, R5 conditions,
shared DSL accessor or unrelated frame edit was made.

When adding canonical engine run exports, Studio's runtime parent barrel must
explicitly select `runAutomationStudioCompiledPlan` from `./compiled-plan.ts` and
`runCanonicalAutomationStudioFlow` from `./composite-executor.ts`. Otherwise its
star export of the engine-compatible executor would conflict with those two
legacy classifier adapters. Lead was notified before parent integration.

Not run: whole-package typecheck/build, final integrated full structural gate,
downstream checks or full suites. No providers, browser/panel management, user
data, git or spawning. Source is frozen for independent lead acceptance.
