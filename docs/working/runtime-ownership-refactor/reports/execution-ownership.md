# Executable kernel ownership implementation

## Current handoff

Kernel source is stable after the engine-integration-fixes brief and released
to the lead for shared typecheck, build, audit and Studio integration. The final
focused kernel run passed 43 files and 271 tests. No git actions occurred.
The residual audit is read-only until a new implementation brief is approved.

The mature executor now lives under `engine/automation`, with cohesive graph
navigation, transitions, trace, records, recovery, regions, state, host capture,
node execution, lifecycle, retry/reacquisition and frame areas. All executor
behavior moved; the simpler existing `engine/index.ts` API is unchanged.

## Changes and integration contracts

- `flows/executable` owns graph nodes/edges, minimal `ExecutableGraph`, richer
  `ExecutableFlow`, typed interfaces, variables/errors/defaults, regions, call
  configuration DTOs, execution records, revision identity, adaptation IDs and
  recovery defaults. Existing Studio artifacts retain their persisted envelope
  and fields and are structurally assignable to the executable contracts.
- `runtime/automation-host` owns the host boundary, resource/control ports,
  native log DTO, fact/reacquisition/target-refresh DTOs and passive route-state
  delegation. Host DTOs have no engine dependency. Native-log SDK integration
  was coordinated with the matcher worker.
- `runtime/repeat` contains generic evidence/observation/digest contracts.
  Guard, checkpoint, sample and private trace-provenance implementation belongs
  in `engine/automation/repeat`, because it reads engine inputs/frames/state.
- `runtime/reference-time` owns the fixed reference. `runtime/parking` owns
  parking/settlement/carry primitives and consumes canonical interaction asks.
  Conversation-port persistence stays Studio.
- `runtime/activity` owns hub/context, optional presentation dispatch, safe
  human-label/reason normalization and execution-neutral loop/step numbering.
  Studio keeps presentation wording/cards and binds them in its activity scope.
  Concurrent scopes use `AsyncLocalStorage`, never global mutable callbacks.
  Running the canonical engine requires no UI adapter.
- A legacy skipped-step interpretation is now a host and per-run option port. The canonical
  engine treats unavailable classification conservatively. Studio graph/resume
  adapters bind the legacy classifier for existing persisted documents; trusted
  action-effect floors remain authoritative. The host classifier takes precedence
  and runs with the original receiver. Studio supplies its fallback on options,
  never by copying, decorating or replacing the host. Host getters stay lazy.
- Old private leaves use exact named reexports through owning feature barrels.
  The public canonical engine barrel preserves the earlier public selection;
  private helpers were grouped into feature barrels rather than all exposed at
  the engine root. Type-only clauses are explicitly erased.
- Host capture explicitly accepts `{ kind: "unavailable", reason: "unsupported_node" }`
  for a node outside the host's state. Genuine capture faults throw a sanitized
  error; raw exception text is not copied to the trace. Unbound capture remains
  optional. Capture and diff methods run with the original host receiver.
  Focused regressions distinguish these outcomes. Moved unsafe `as never` and packed
  statements were corrected; no baseline entry was increased or remapped.

The lead owns package exports/root barrels/audit configuration and final import
retargeting. The DSL worker now owns only the released engine lifecycle
`event-applies.ts` facade, canonical event-applicability authority in components,
and the released call-configuration accessor extraction in model/composites and
`flows/executable/composite/{configuration.ts,index.ts}`. Do not overwrite those
concurrent changes from a snapshot of this worker's tree.

## Tests and checks observed

The first focused executor/support run reached 131 files and 1,145 tests:
90 files/923 tests passed, 41 files/222 tests failed. Causes were missing feature
exports, a CRLF-sensitive edit, SDK fixtures targeting the wrong barrel and UI
integration tests binding the UI-free scope. The second run reached 132 files:
108 files passed, with remaining failures predominantly invalid private imports
introduced by barrel normalization. Those imports and feature surfaces were
corrected. These failures are recorded rather than presented as passing runs.

Latest broad **closed kernel** selection:

`pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/records src/engine/automation/trace src/engine/automation/defensive src/engine/automation/lifecycle src/engine/automation/lifecycle-run src/engine/automation/node-execution src/engine/automation/outside-graph src/engine/automation/pacing src/engine/automation/parameter-refresh src/engine/automation/repeat-progress src/engine/automation/state-routing src/engine/automation/step-loop src/engine/automation/step-skip src/engine/automation/target-evidence src/runtime/repeat src/runtime/activity/presentation src/engine/automation/tests/node-execution.test.ts --reporter dot`

Observed: **70 files passed; 619 tests passed**, 26.02 seconds. This included
retry, lifecycle/frame handling, records privacy, reacquisition safety, optional
steps and native branch results. Final barrel normalization followed this run.

Latest verification after that normalization:

`pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/host-state src/engine/automation/records src/engine/automation/graph-navigation src/engine/automation/step-skip/tests/host-classifier.test.ts src/runtime/activity/presentation --reporter dot`

Observed: **7 files passed; 68 tests passed**, 6.12 seconds. This included the
new capture-failure, scoped concurrent presentation and host-classifier tests.

`pnpm.cmd structure:check --rule imports` -> **no findings in this worker's
owned source**; seven remaining findings were the model worker's provider
transport/failure/catalog imports. They were sent to that worker.

`pnpm.cmd structure:check --rule import-cycles` -> **no kernel/support cycle
findings** after correcting the graph-navigation self-reexport; the remaining
two findings were one model-provider cycle, sent to its owner.

`pnpm.cmd structure:check --rule failure-as-empty` -> no owned-source findings;
one model failure-normalization finding was sent to its owner and that worker
reported correcting it. The lead must observe the final global result.

`pnpm.cmd structure:check --rule statement-packing` initially identified carried
legacy violations; 23 statement boundaries in eight owned files were separated.
The contract/model findings outside this brief were sent to their owners.

Windows PowerShell blocks `pnpm.ps1`; `pnpm.cmd` was used. No full suite,
provider call, browser, panel or real-user data was used.

## Pending shared acceptance and residual ownership

Package typecheck/build, final structure audit and Studio integration are pending
the lead's all-workers-stable window. The worker did not run typecheck while
other source workers were editing. Forty-two test/support files requiring
Studio sessions, authoring, legacy interpretation or UI presentation remain
under Studio adapters; pure executor tests moved beside their new subjects.
There are no duplicate old copies of the moved pure tests.

Additional confirmed generic runtime remains and must be closed by the next
brief: neutral importer SDK, trusted native implementation binder, IO/runtime
output dispatch, deterministic compiled-plan execution, and executable composite
composition. Studio retains project/publication/revision receipt envelopes and
repository lookup. The residual audit supplies the full remaining-area inventory.

Browser-specific compatibility interpretation still appears in the Studio
legacy host adapter, and person-needed defaults still contain page/robot wording.
Those are called out for the remaining browser-boundary pass; this report does
not claim that all Core browser semantics or all generic Studio runtime has
already been removed.

## Engine integration fixes checkpoint

The combined check exposed 38 type errors and 36 structural failures. This
worker fixed its assigned contracts and source roots; it did not modify the
DSL/service adapters or provider source assigned to other workers.

- Call-boundary snapshots use the canonical executable artifact's actual
  interface/errors/optional executionDefaults. No missing defaults are fabricated.
  All six target-reacquisition host DTOs are reexported through the engine's
  compatibility feature barrel.
- The executable graph preserves an optional legacy ownerId for existing host
  scope; bare graphs require no persisted project envelope. Missing scope cannot
  produce absence evidence. The Studio composite owner carries its truthful
  persisted document and optional region scope rather than casting a base graph.
- Dispatch, incidents, obstructions, step-loop lifecycle, graph flow contracts
  and composite call contracts now occupy cohesive child directories. Old
  executor and runtime-test roots are each at the 25-file cap. Root/private
  compatibility surfaces remain named forwards to the proper feature barrels.
- The 24-module engine value cycle was broken at its roots: lifecycle defaults
  come from the pure executable recovery contract, and transition comparison
  reads fact observation from its defining module. Other consumers use the
  now-safe feature barrels. No rule exceptions or baseline increases were added.
- The initial host compatibility wrapper spread the host. The repeat integration
  exposed getter invocation and lost object identity; this was corrected by the
  per-run classifier port described above. The first rerun then exposed the
  unsupported-capture behavior. The repeat harness now explicitly returns the
  unsupported-node outcome with all existing behavior assertions unchanged.

API compatibility: `captureStateSnapshot` has an additive unavailable result in
`AutomationStudioHostStateCapture`. Existing snapshot-returning hosts remain
assignable; a caller reading snapshot fields must narrow the unavailable branch.
Hosts previously throwing to decline unsupported nodes must return the explicit
outcome. The real downstream implementation at
`domain/src/runtime/host-runtime.ts:231` was read: its `!actsOnPage` branch throws
for absence, so the lead was given that exact migration. Actual gateway and
malformed-capture failures remain failures. No downstream source was changed by
this worker. The Core LLM harness passes the result through as opaque evidence.
The downstream `beforeAction` helper also derives its state parameter from the
capture return type at lines 193-194; it must instead require its existing
snapshot-ref type because that helper runs only for actual captured refs. The
exact union consumer was sent to the lead.

`pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/step-loop/tests/run-repeat-guard.test.ts src/engine/automation/host-state src/engine/automation/state-routing/tests/decision.test.ts src/engine/automation/step-skip/tests/host-classifier.test.ts --reporter dot`

Observed: **4 files passed; 49 tests passed**, including all 25 repeat cases.
New receiver/getter tests cover private host state, inherited capture methods,
trusted action-effect precedence and lazy access to classifier getters. A further
sanitized trace-error regression was added for the final focused run below.

`node scripts/structure-audit.mjs --rule imports --rule naming --rule directory-files --rule swallowed-failure --rule failure-as-empty --rule statement-packing --rule as-never --rule import-cycles --json`

Observed: **exit 0; no failures**, 122 existing advisory warnings. This checks the
whole source graph for the selected rules, not a filtered kernel-only graph.
No baseline was edited. The lead still owns the remaining global checks and
the complete audit including working-document/index rules.

Final source-stable focused run:

`pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/host-state src/engine/automation/lifecycle src/engine/automation/lifecycle-run src/engine/automation/step-loop src/engine/automation/state-routing src/engine/automation/step-skip src/engine/automation/frames src/flows/executable/graph src/flows/executable/composite src/runtime/activity/presentation src/programs/automation-studio/runtime/executor/step-loop/tests/run-repeat-guard.test.ts --reporter dot`

Observed: **43 files passed; 271 tests passed**, 49.70 seconds. This includes the
additional real capture-error trace regression, which confirms private exception
text is absent from the resulting saved trace. Source is frozen for the lead's
shared integration checks. Package typecheck/build, downstream typecheck and
the complete Studio integration sweep were not run by this worker.

## Final four-error typecheck correction

The lead's next package check reached four errors in this worker's source and
one in the DSL lane. The four owned errors were corrected without casts:

- Capture returns the snapshot branch only after checking its required
  `stateSnapshotId` property. This is a positive narrowing of the actual union;
  the unsupported-node branch still supplies no snapshot evidence.
- The intentionally throwing classifier getter in the laziness regression has
  an explicit callable return type, so TypeScript does not infer `void`.
- The legacy composite owner projects defined optional region fields into the
  compiler input, and defined optional defaults into the call-boundary contract.
  Absent and explicitly undefined legacy values retain the consumer's existing
  behavior. Empty defaults are never fabricated. The original snapshot object
  remains unchanged for frame execution, private provenance and digest inputs.

`node --max-old-space-size=4096 --input-type=module` with a TypeScript Compiler
API probe loading `packages/fluxiq/tsconfig.json`, creating a program rooted at
the three affected files, and collecting config/options plus each file's syntax
and semantic diagnostics -> **exit 0; three owned files, zero diagnostics**.
Imported types were resolved under the repository's strict, exact-optional
configuration. This is a focused typecheck, not a whole-package check. The lead
was notified that source is frozen again for its package check and build.

`pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/host-state src/engine/automation/state-routing/tests/decision.test.ts src/programs/automation-studio/runtime/composite-execution/tests --reporter dot`

Observed: **3 files passed; 25 tests passed**, 40.12 seconds. This rechecked
snapshot failure/privacy, classifier getter/receiver behavior and composite
child-outcome handling after the four narrow type fixes. No source changed
after that run.

## Capture integration regressions

The lead's broader focused run exposed seven remaining failures in this lane.
The exact four-file reproduction reached **7 failed, 12 passed**. Every original
assertion was retained while correcting the causes:

- Two pacing fixtures returned undefined behind broad host casts while simulating
  snapshot latency. They now truthfully declare a host and return the explicit
  unsupported capture outcome, preserving their clock effects and wait/pace
  assertions. Both unsafe casts were removed.
- The snapshot-reuse and no-progress fixtures threw when a control/data node was
  not a host step. Those intended absence branches now explicitly decline the
  capture; genuine exceptions still fail and are never swallowed as absence.
- Two created-step integration failures were a real scope regression. A Flow
  produced by normalization carries its actual projectId and no legacy ownerId.
  The migrated engine had looked only at metadata.projectId and ownerId, so it
  refused host observation despite the supplied project identity. A shared
  `engine/automation/host-state/scope.ts` reader now selects only supplied
  identity, in order: metadata project override, projectId, legacy ownerId.
  `ExecutableGraph` permits that optional existing field; no project is required
  or fabricated for standalone graphs. Routing and recorded-effect verification
  share this reader, and absent scope stays conservative. The integration helper
  now returns its truthful Studio FlowArtifact instead of casting it to a legacy
  full document.

`pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/pacing/tests/graph-pacing.test.ts src/engine/automation/tests/host-state/tests/one-capture-between-steps.test.ts src/engine/automation/tests/repeat-progress/tests/no-progress-run.test.ts src/programs/automation-studio/runtime/executor/state-routing/tests/created-step-effect.test.ts --reporter dot`

Observed before edits: **4 files failed; 7 tests failed, 12 passed**. Observed
after edits: **4 files passed; 19 tests passed**, 19.32 seconds. This preserves
slow-snapshot wait credit, pace learning, one-capture reuse, no-progress stopping,
created-step effect skipping and refusal to repeat a lasting act.

`node --max-old-space-size=4096 --input-type=module` focused Compiler API probe
using the real package config -> **8 changed source/test files, 0 diagnostics,
exit 0**. No whole-package typecheck was run during other workers' edits.

`node scripts/structure-audit.mjs --rule imports --rule import-cycles --rule as-never --rule statement-packing --rule failure-as-empty --json`

Observed: **exit 0; no failures or warnings** for the selected rules. No baseline,
config, provider/DSL source, git or assertion changes. Source is frozen again.
The R2/R4 read-only map was saved separately in execution-foundations-plan.md;
neither continuation implementation began during this fix.
