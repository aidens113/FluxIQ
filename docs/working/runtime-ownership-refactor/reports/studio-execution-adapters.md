# Studio execution adapters

Outcome: Done (SOURCE FROZEN for the coordinated package typecheck)
Changed: Truthful Studio graph-envelope adaptation, narrow detached/region graph readers and focused tests.
Validation: 7 new focused tests and 94 existing repair/learning/framing/detached tests passed. Scoped structure checks found no new violations. Repeat-guard suite has 25 failures assigned to the engine worker's compatibility host adapter.
Not verified: Package typecheck (reserved for the lead's globally stable gate); external repeat-host fix; full suites/build/browser behavior.
Report: docs/working/runtime-ownership-refactor/reports/studio-execution-adapters.md
Notes: No generic DTO was widened to require Studio fields; no ownership/timestamp values or double casts were added to satisfy types. No git, paid runs, agents or browser operations.

## Adaptation

- New Studio `runtime/legacy-envelope` helpers recognize a complete legacy Flow-document envelope on the graph the frame actually carried. They retain that exact graph object, including extra interface/metadata fields, while narrowing the callback type. They create no project, ownership, name or timestamp defaults.
- In-run repair and deterministic interruption learning adapt their canonical requests at the Studio boundary. Without a carried Studio envelope they answer `none` with an explicit missing-context reason before entering recovery/model work. Valid Studio requests follow their original path unchanged.
- Part-graph recovery keeps the existing saved interface on the actual canonical document using an inferred local value, removing an unnecessary assertion.
- Subflow framing retains its existing artifact-to-document mapping in a typed Studio local before handing the structural graph to canonical execution. Runtime values are unchanged.
- Detached candidate recovery-budget readers now accept only `nodes`/`edges`, which are their actual inputs; child execution no longer needs a fabricated persisted artifact.
- Region compilation now accepts graph nodes/edges plus optional regions/handoffs/scope. The engine worker made the existing, unused region-validator scope optional. No scope default is manufactured.
- The engine worker made call-boundary execution defaults optional without synthesizing an empty object. The owned repeat test needed no change for this correction.
- One owned repair test now replaces the handler on its actual generic request graph directly, preserving all carried fields, rather than passing that graph to a fixture helper typed to a full legacy document.
- The engine worker regrouped composite DTOs under `composite/call`; the prior DSL-owned configuration reader's type imports were retargeted to that barrel, with fields unchanged.

## Changed files

- `packages/fluxiq/src/programs/automation-studio/runtime/legacy-envelope/{flow-document,request,index}.ts`
- `packages/fluxiq/src/programs/automation-studio/runtime/legacy-envelope/tests/request.test.ts`
- `packages/fluxiq/src/programs/automation-studio/runtime/service/runtime-session/{in-run-repair,interruption-learning,subflow-frame}.ts`
- `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/detached-execution.ts`
- `packages/fluxiq/src/programs/automation-studio/runtime/executor/lifecycle-run/tests/in-run-repair.test.ts`
- `packages/fluxiq/src/flows/executable/regions/compilation/{compiler,plan}.ts`
- `packages/fluxiq/src/flows/executable/regions/compilation/tests/compiler.test.ts`
- `packages/fluxiq/src/flows/executable/composite/configuration.ts` (type-import retarget only)

The initially briefed `executor/legacy-envelope` location was moved to `runtime/legacy-envelope` with the lead's authorization, keeping source within the eight-segment depth limit. The initially created deeper helper directory was removed. No external API depended on it.

## Observed validation

From Core `packages/fluxiq`:

- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/legacy-envelope/tests src/flows/executable/regions/compilation/tests` -> 2 files, 7 tests passed after the final helper move. Tests cover exact graph/request identity, full real-engine repair context, malformed/missing envelopes, project-free generic execution and region compilation without scope/persistence.
- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/executor/lifecycle-run/tests/in-run-repair.test.ts src/programs/automation-studio/runtime/executor/step-loop/tests/run-repeat-guard.test.ts src/programs/automation-studio/runtime/service/runtime-session/tests/in-run-repair.test.ts src/programs/automation-studio/runtime/service/runtime-session/tests/interruption-learning.test.ts src/programs/automation-studio/runtime/service/runtime-session/tests/subflow-frame.test.ts src/programs/automation-studio/runtime/flow-bootstrap/verification/tests/detached-execution.test.ts src/programs/automation-studio/runtime/flow-bootstrap/verification/tests/detached-subflow.test.ts` -> 6 files/94 tests passed; repeat-guard file had 25 failures out of 25.
- Direct scoped rule API calls for imports, exported-values, as-never, naming/depth, directory-files, file-lines, statement-packing, import-cycles and test-placement -> no new violation. The existing 431-line repair file has a non-ratcheted advisory warning; detached-execution retains its pre-existing single import cycle, already recorded at 1 in the baseline. No baseline changed.

## External failure and next checks

The repeat-guard run reaches its assertions but makes zero native dispatches across most cases. Its accessor-safety case also throws directly from the newly added `executor/compatibility/host.ts` object spread: spreading the host invokes `observeRuntimeRepeat`'s getter. The engine worker owns that compatibility adapter and has been given the exact failure. No repeat assertion was relaxed and no fix was made outside this worker's ownership.

The lead should run the combined package typecheck once all source owners are frozen, then rerun the repeat suite after the engine worker's host correction. There are no known source edits pending from this worker; all remaining observed failures above are assigned to that external adapter.
