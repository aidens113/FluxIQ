# Execution foundations ownership plan

## First dispatchable group: R2

Read-only planning. Implementation has not begun; the lead is validating the
first migration checkpoint. Paths below are relative to `packages/fluxiq/src`.

The group is closed after removing two actual upward dependencies: the base
environment imports engine option types, and its live implementation calls an
engine wait. The shared lease cache must move as the same authority rather
than being copied: `project-agents/dispatch/host-lease.ts` owns a WeakMap keyed
by the exact host resource port. The control registry is a Map keyed by opaque
project/run strings; `host-registry.ts` uses `instanceof`, not a WeakMap.

| Current owned source | Canonical destination/action |
| --- | --- |
| `programs/automation-studio/runtime/environment/{environment,channel-scope,live,scoped,virtual-clock}.ts` | Move implementations to `runtime/environment/` with barrel. Define clock signatures directly; no engine import even for types. Existing kind values, ID format, timer shape and async-context behavior stay exact. |
| `engine/automation/pacing/run-wait.ts` | Move abortable default wait implementation to `runtime/environment/wait.ts`, accepting only optional `delay`/`signal`; leave engine leaf an exact forward. Live environment consumes this lower-level wait. |
| `programs/automation-studio/runtime/environment/executor-options.ts` | Move to `engine/automation/environment/executor-options.ts` plus feature barrel. It consumes base environment and engine options; never export it from the canonical runtime/environment barrel. Old Studio environment barrel composes both compatibility exports. |
| `programs/automation-studio/runtime/run-control/{run-controller,registry,host-registry,mark-adapting}.ts` | Move unchanged mechanics to `runtime/run-control/`; consume existing host control DTOs from `runtime/automation-host`. Old leaves/barrel forward exact class/function identities. |
| `programs/automation-studio/runtime/run-control/progress-status.ts` | Keep label/detail UI projection Studio. Extract the private pure `progressStatus` decision, status vocabulary and minimal status/parked input contract into `runtime/run-control/progress/`; the Studio presentation calls it. Do not import Studio RuntimeSession into canonical control. |
| `programs/automation-studio/runtime/project-agents/host-resources/{scheduler,lease-scope,port-contract-error,stale-lease-error}.ts` | Move authority to `runtime/host-resources/`, consuming existing host resource DTOs. Keep queue fairness, increasing epochs, release accounting and strict per-session lease checks exact. |
| `programs/automation-studio/runtime/project-agents/dispatch/host-lease.ts` | Move its exact WeakMap and `automationStudioProjectHostLeaseScope` implementation to `runtime/host-resources/registry.ts`; old private leaf forwards unchanged. One scheduler per exact port across old/new consumers, never per build. |
| Existing old environment/run-control/resource barrels and `types.ts` | Preserve exact named compatibility exports. Existing canonical `runtime/automation-host/{control,resources}.ts` remain DTO authorities; do not duplicate their declarations. |

Reserved to lead: package exports, root runtime/engine/Studio barrels,
`programs/_shared/runtime.ts`, audit configuration and broad source import
retargeting. In `_shared/runtime.ts`, source both channel and host-lease scopes
from their new owners; today it imports the channel directly from Studio and
the lease via Studio's root. Program composition itself remains there.

Implementation owner may also edit only the old/new tests belonging to the
listed features. Canonical environment tests: `environment.test.ts`,
`scoped-deadlines.test.ts`, `virtual-timers.test.ts`; move the executor-options
test beside its engine adapter (split environment-only timer assertions when
necessary). Move run-controller/registry and scheduler/stub-host tests beside
new owners. Keep existing fixture/trace-fed runs and lease-to-canonical-Flow
integration under Studio while they still consume its graph-options and
artifact constructors. Add canonical direct tests for registry identity and
cross-scope isolation; do not duplicate old test implementations.

No R1 native/SDK or R3 output-dispatch/graph-options edits are needed. R3 consumes
`runtime/environment` and `engine/automation/environment`. The existing
`automationStudioEnvironmentExecutorOptions` must continue leaving live
`random` and `startTimer` unchanged, while offline environments supply theirs.

Acceptance: canonical owners have no import path to Studio; base environment,
run-control and resource owners have no import path to engine. Classes/scopes
are exact compatibility identities. The unreferenced abortable wait, nested
and concurrent channel scopes, virtual deadline ordering, pause-between-steps,
abort/expiry/takeover, shared capacity, stale lease refusal, late-grant release
and strict per-session isolation retain their existing assertions.

## R4 closed move

The compiled-plan file contains deterministic in-memory compilation, validation,
serialization, graph projection and execution. Its only persistent-program
projection is `compiledPlanToFlowDocument`, which fabricates the legacy owner
envelope. Its project/revision fields are compilation inputs and are not storage
access. `AutomationStudioCanonicalExecution.run` consumes supplied snapshots;
it does not look them up in a repository. It must move as an actual engine
implementation, retaining its one private callback-registration WeakSet.

| Owned old/current paths | Canonical owner and exact cut |
| --- | --- |
| `programs/automation-studio/runtime/compiled-plan.ts` | Move its schema/compiler markers, instruction/node/edge/plan/input DTOs, stable sorting/indexing, revision checks, compile and assertion mechanisms to `flows/executable/compiled-plan/`. Use one exported DTO/function per file with a feature barrel. Concrete leaves: `schema-version`, `compiler-version`, `instruction`, `node`, `edge`, `plan`, `input`, `compile`, `assert`, `serialization`, `digest`, `graph`. |
| `engine/automation/graph-navigation/start-node.ts` | Move the pure graph-start rule and choice type to `flows/executable/graph/start-node.ts`; engine leaf forwards. Both compiler and engine use this exact rule. It reads ids/definition ids/endpoints and the canonical Handler constant only; no engine options or persistence is needed. |
| `programs/automation-studio/runtime/compiled-plan.ts` execution function | Move actual assert/start/run work to `engine/automation/compiled-plan/run.ts` plus barrel. Canonical graph projection carries graph fields, existing compilation metadata and the opaque legacy host-scope ownerId; it requires no invented creation timestamp/name/owner-kind. |
| `programs/automation-studio/runtime/compiled-plan.ts` compatibility remainder | Keep `compiledPlanToFlowDocument` as the legacy envelope adapter, delegating node/edge/metadata projection to the canonical graph function. Old run adapter supplies the existing legacy classifier via options and calls canonical plan execution; constants, DTOs, compile/assert functions forward exactly. |
| `programs/automation-studio/model/composites.ts` snapshot DTO | Extract executable snapshot contract to `flows/executable/composite/snapshot/contracts.ts`: flowId/version/digest/scope, interfaces/errors/nodes/edges, optional execution defaults/regions/handoffs, dependency pins and required capabilities. Leave schema/name/description/publishedAt/publisher/changelog and mutable publication record lifecycle in the Studio type. Preserve optional-and-undefined input semantics explicitly where current callers support both. |
| Same file snapshot construction and private digest | Move immutable graph/interface/scope cloning, dependency-pin collection, capability union/sort and exact snapshot digest mechanism to `flows/executable/composite/snapshot/{capture,digest}.ts` plus barrel. Studio `createPublishedFlowSnapshot` calls it and adds publication/name/time metadata only. Keep its historical digest envelope exactly; it excludes publication display/timestamps. |
| Same file composition validator and its helpers | Move to `flows/executable/composite/validation/{validate,cycle,bindings,scope}.ts` with barrel. Root input needs only flowId/nodes/scope, snapshots need executable snapshot fields; do not require a Studio artifact or cast a snapshot to one. Preserve all existing issue codes/paths, missing/deprecated/scope/grant/capability/binding/cycle decisions. |
| Same file `compositeNodeDefinitionId`, `createCallFlowNode` | Move definition address and graph-call construction to `flows/executable/composite/{definition-id,call/create}.ts`; existing config reader remains the single authority. `call/index.ts` and composite feature barrel are worker-owned for this serial unit only. |
| Same file `projectPublishedFlowSnapshotToNodeDefinition` and value-type mapping | Move node-definition projection to `components/automation/composite/{definition,value-type,index}.ts`, consuming canonical snapshot/interface DTOs plus supplied name/description. Studio model forward preserves old function names; the actual generic projection must not remain Studio. |
| `programs/automation-studio/runtime/composite-execution/owner.ts`, `runtime/composite-executor.ts` | Move class and in-memory run wrapper into `engine/automation/composite/{execution,run}.ts`. Reuse existing canonical boundary/child-bounds, region compilation and frame APIs. Old owner is an exact class forward, keeping `isRegistered` and all callbacks in the same private WeakSet; old public run wrapper supplies the compatibility classifier as an options port. |

The canonical composite executor should construct the minimal graph its engine
needs, preserving its current opaque owner identity for host scope. It must not
invent Studio schema/name/timestamp fields. Original snapshot objects passed to
child frames and execution remain unchanged. The command-execution controller
uses `AutomationStudioCanonicalExecution.isRegistered(callback)`; an independent
new class, copied registration set, wrapped child callback or cloned snapshot
would break that safety contract. Its existing old import can keep working via
the exact facade, with root retargeting owned by the lead.

Model/composites is a serial ownership unit: the DSL reader is already extracted
and its barrel/accessor must be released before implementation. No changes to
DSL compilation, R1 importer/native execution, R3 IO/graph-options or R2 runtime
features are required. Existing snapshot/compile stores, publication/revision
repositories, service catalogue lookup and command-run persistence stay Studio.
The compiled-plan-store remains a real consumer of the canonical compile/run
seam through compatibility exports until the lead retargets it.

## Digest and behavior invariants

Do not unify compiled-plan serialization with the DSL/snapshot serializer.
Compiled-plan serializes undefined as `null`, including object keys; the
DSL/snapshot algorithm interpolates an undefined object value as `undefined`
and joins an undefined array slot as an empty slot. The plan hash has no prefix;
snapshot/DSL hashes have `sha256:`. Plan assertion accepts both its current
explicit `planDigest: undefined` digest input and the legacy input with that key
removed. Sorting order, localeCompare, compile time, positive revision coercion,
empty edge-port handling and both accepted digest forms are compatibility
requirements. Snapshot digest dependency order currently follows graph-node
insertion order; do not sort it during migration.

Keep compiled-plan and snapshot digest helpers scoped to their capabilities,
preserving the respective algorithms. Sharing a helper merely because both use
SHA-256 would be incorrect. Snapshot construction's literal digest-input keys
must remain present even when their values are undefined, while the final stored
snapshot retains its existing conditional optional fields.

Composite behavior includes authorized-domain intersection with root defaults,
exact pinned targets, deprecation, nested-cycle refusal, region validation,
child/root deadline propagation, cancellation, real child versus saved trace
privacy, variable/frame isolation, root-only stopAfterNodeId, uncertainty and
repeat-stop private provenance. The existing boundary and graph runner own
those decisions; the move must not reimplement them.

## Acceptance and source ownership

R2 and R4 are disjoint except lead-owned public export/config work. R2 owns only
the features listed above plus engine wait/environment leaves; R4 owns the
compiled-plan feature, composite model serial extraction, pure start-node leaf,
new component projection and existing engine composite feature. Broad import
retargeting, public barrels/package exports, architecture docs and enforcement
configuration remain lead-owned. Every compatibility leaf uses explicit named
reexports through its canonical feature barrel; no new audit exceptions or
baseline increases.

R4 tests: extract the compiled-plan section of old runtime/tests/executor.test.ts
into tests beside canonical compiler/run owners without copying it. Add exact
pre/post digest goldens for optional/undefined input and both accepted plan
digest forms; preserve original ambiguous-root/start-node behavior. Move pure
composition-validation cases from model/tests/composites.test.ts to canonical
validation tests with minimal executable fixtures, retaining publication-envelope
assertions Studio. Canonical component projection gets direct tests. Existing
runtime/tests/composite-executor.test.ts and composite-execution/tests/child-
uncertainty.test.ts prove pinned children, private traces/defaults/deadlines,
variables and uncertain acts; keep integration versions as actual second
consumers while canonical engine tests use no Studio builders. Re-run the
compiled-plan-store test after the move, not the whole storage suite.

Suggested focused checks after each implementation group:

- R2: tests beside `runtime/environment`, `runtime/run-control`,
  `runtime/host-resources`, `engine/automation/environment`, plus the retained
  Studio environment/run-control/resource integration tests.
- R4: tests beside `flows/executable/compiled-plan`, executable composite,
  component composite and engine compiled/composite, plus the old executor
  compiled-plan section, composite executor/uncertainty and compiled-plan-store.
- Both: package typecheck when all source lanes are stable; targeted fullgraph
  structural rules for imports/cycles/naming/directory size/unsafe casts/packed
  statements/failure handling. Lead owns acceptance and observed gate results.

## Active browser boundary in these groups

R2 run-controller comments mention page/browser, but its actual decisions use
only control state, timers, holder and opaque node ids. It can move without a
browser port. `run-control/progress-status.ts` is different: its active detail
strings tell a person to finish in the browser and check/take control of the
page. Keep its UI projection in the adapter and bind a host presentation port
for resource/takeover/interrupted instructions; the web adapter supplies those
sentences. Canonical status selection remains independent of wording. This
wording cut is required R8 work and must be explicitly assigned, not called
domain-neutral because it only emits text.

R2 clock/channel/lease/scheduler and R4 compiler/composition/snapshot mechanisms
contain no selector, XPath, queryPath, URL, DOM or browser interpretation. Opaque
resource/session/domain/project ids, regions, graph layout coordinates and
revision/digest pins are framework concepts. A resource grant's optional session
id only scopes gateway lease enforcement; it does not select a browser tab.

## Validation for this planning brief

Read-only Get-Content/rg/import-consumer inspection covered the named sources,
their canonical dependencies, relevant tests, `_shared/runtime` wiring and
actual composition/compile-store consumers. No test, build, typecheck, provider,
browser, panel, git or source mutation was performed for this brief. Only this
report was written. R2 is dispatchable; R4 has an exact serial closure pending
the lead's source-stable approval. R10 reusable chat UI remains ordered after
the full audit/refactor and is not part of either group.

Planning was interrupted after this saved map by the lead's higher-priority
capture integration regressions. That fix is tracked in its own brief/report;
implementation of R2/R4 has not begun.
