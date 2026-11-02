# R5 state and recording foundations

Outcome: Done — authorized contract and foundation implementation groups complete. SOURCE FROZEN.
Worker: node_ownership, heavy gpt-6.1-sol max. Repository: paired Core t843. Date: 2026-11-02.

## Implemented authority

The actual store/diff/signal, recording append/domain/controller/normalization and structural validation implementations now live under `packages/fluxiq/src/runtime/state` and `runtime/recording`. Original Studio leaves delegate to canonical implementations or bind the explicit legacy policies. No parallel store, diff, append, domain processor or normalizer algorithm remains at the old owner.

Contracts were implemented and frozen first, with an isolated 121-contract-source TypeScript check before any foundation algorithms moved. The lead integrated public package exports and the existing runtime action contract barrel. This worker did not edit package exports, root barrels/config or shared working documents.

| Canonical authority | Contents |
| --- | --- |
| `packages/contracts/src/state.ts`, `state/index.ts` | Rich snapshot/value/namespace/delta/path/schema, geometry/presentation/frame/layer/anchor, provenance/signals, conditions and neutral node comparison/phase contracts. |
| `packages/contracts/src/recording.ts`, `recording/index.ts` | Timeline/session/create/append/descriptors, generic domain reducer/extractor/definition/processing contracts, normalization contracts and evidence/schema reexports. |
| `packages/contracts/src/evidence/**` | One schema version, evidence layer and reference authority; no learned/project artifact envelopes. |
| `packages/contracts/src/runtime/actions/**` | Generic action/parameter/preflight/safety/result/policy/visual target contracts. Lead reexports these from `@fluxiq/contracts/runtime`. |
| `packages/fluxiq/src/runtime/state/index.ts` | Actual diff/application/summary, in-memory store/builders/subscriptions, signal registry/discovery/lookup and structural state validation. |
| `packages/fluxiq/src/runtime/recording/index.ts` | Actual session append/checkpoint/delta/note/finalize, registry/schema/reducer processing, store-backed recording controller, conservative normalization and structural recording/visual target validation. |

Current canonical production file counts, including barrels: contracts state 34, recording 24, evidence 4, runtime/actions 10; runtime state 7 and recording 11. Seven canonical subject test files were added/relocated beside these owners.

## Compatibility and opaque domain targets

There is one rich declaration of each shared shape. Existing shared `automation-studio.ts` aliases specialize generic evidence and domain signal parameters with `JsonObject`, while Core model aliases specialize with `EvidenceReference` and `SignalDefinition`. Typed tests check both specializations. Rich optional snapshot ID/presentation, value presentation, recording description, output ID, confirmation metadata and nested visual/anchor data survive serialization. Unknown state/parameter values are not narrowed to JSON-only values.

Canonical action/entry/timeline/session/normalization/domain contracts carry generic opaque target types. Canonical `ActionTarget<TElementTarget>` declares neutral identity/geometry/metadata plus the opaque type parameter. Browser target/fingerprint fields remain in the existing Studio `model/action-element-target.ts` and the existing shared/model target compatibility leaves. The old model action type specializes the generic target and retains its existing `selector` property; shared compatibility does the corresponding specialization. No new canonical selector/XPath/tagName/URL/className/ARIA property declarations were introduced, and no matcher/browser-normalization implementation moved.

`model/action-element-target.ts` itself is unchanged. `model/evidence.ts` retains StateFact, node evidence binding/comparator and generated/project envelopes. `model/node-state.ts` retains learned/observed/view source types and initial editor phases; only runtime comparison/phase authority moved. Condition declarations were frozen before the lead's router work; later changes in state contracts only removed redundant filename prefixes and organized path contracts.

Pure legacy implementation exports retain object identity: state store/value builder, recording create/append functions and registry constructor are tested against canonical exports. Generic instantiation expressions preserve old specialized signatures without a wrapper algorithm. All old state-diff symbols, including `StateDiffOptions` and `summarizeStateDeltas`, remain exported.

## Explicit compatibility policies

`StateContentReferencePolicy` is required by canonical snapshot/frame validation. The caller supplies acceptance and the rejected-reference message. The Studio validation adapter binds its exact existing trimmed prefix allowlist (`automation-object://`, `fluxiq-object://`, `object://`, `/api/`) and original message. No program URL scheme is hardcoded in canonical validation.

`RecordingTargetValidationPolicy<TTarget>` supplies target and parameter validation. Canonical validation handles sequence, source/note links, confidence, visual target and delta structure without interpreting target fields. The Studio adapter invokes its existing element-target structural checks and preserves null-target handling. Existing legacy target and visual-target tests pass.

Canonical normalization requires `StateObservationPolicy`; it has no implicit payload-state heuristic or gateway/browser classifier. Studio's `normalization/state-observations.ts` explicitly binds the old client snapshot/update classification and payload `state` heuristic. Constructor/function compatibility wrappers supply that policy, while the one actual selection/normalization implementation is canonical. A neutral test proves an arbitrary payload `state` key remains ordinary unless the supplied policy classifies it.

## Changed legacy owners

All paths in this list are under `packages/fluxiq/src/programs/automation-studio`:

- Model contract facades: `model/{state,signals,conditions,actions,recordings,timeline,descriptors,evidence,node-state}.ts`.
- Implementation facades: `model/{state-store,state-diff,signal-registry,recording-framework,recording-domain}.ts`, `runtime/recording-controller.ts`.
- Validation adapters: `model/validation/{state,recording,visual-target}.ts`.
- Normalization adapters/contracts: `normalization/{contracts,default-normalizer,state-observations}.ts`; existing normalization barrel remains compatible.
- Tests: pure state/recording rows relocated from `model/tests/state-recording.test.ts`, which now checks facade identity; new `model/tests/framework-state-recording-compatibility.test.ts` checks broad/rich contract specialization, rich round trip and exact old policy behavior.

`packages/contracts/src/automation-studio.ts` contains compatibility aliases for the duplicated DTO slice. Existing project recording request envelopes remain there. The canonical contract directories/root state and recording entries are new.

## Verification observed

Validation: isolated TypeScript API program using contracts package compiler options, rooted at `state.ts`, `recording.ts`, runtime/actions and existing automation-studio contract -> **121 contract source files; zero diagnostics**. This was the contract freeze before algorithm moves.

Validation: focused TypeScript API program using library compiler options, rooted at the old/new foundation files and their canonical/compatibility tests -> **50 roots; zero diagnostics**. No package-wide typecheck/build was run. The first implementation probe found a missing `StateValue` type import in the copied diff module; added it and reran successfully.

Validation: `pnpm.cmd exec vitest run src/runtime/state src/runtime/recording src/programs/automation-studio/model/tests/state-recording.test.ts src/programs/automation-studio/model/tests/framework-state-recording-compatibility.test.ts src/programs/automation-studio/model/tests/action-visual-target.test.ts src/programs/automation-studio/model/tests/action-element-target.test.ts src/programs/automation-studio/model/tests/model.test.ts` (from Core `packages/fluxiq`) -> **12 files passed; 39 tests passed; 18.16s**.

The initial selected run passed 28/29 tests. Its only failure was in the newly written domain fixture: it assumed `register()` returned the registry, while the existing implementation returns the registered definition. Corrected the fixture to keep the registry separately. Its focused rerun passed, then the complete selection above passed. No production behavior was changed to satisfy that fixture.

Validation: `pnpm.cmd exec vitest run src/runtime/recording/tests/ownership.test.ts` -> **1 file passed; 2 tests passed; 18.95s** after adding the canonical domain-key declaration guard. One test traverses sources/tests, reexports, import-type nodes, dynamic imports and shared contract aliases transitively and rejects Studio source dependencies. The other rejects browser-specific property declarations in the new canonical contract directories. The complete selection predates this one extra guard, so 40 distinct focused tests have passed across these runs.

Validation: `pnpm.cmd exec vitest run src/programs/automation-studio/model/tests/framework-state-recording-compatibility.test.ts` -> **1 file passed; 2 tests passed; 10.82s** after adding the null-target compatibility assertion and retaining optional access in the legacy validator adapter.

Validation: `node .fluxiq/refactor/r5-parity.cjs` -> **PARITY PASS**. The provider-free probe loads pre-move source snapshots and canonical operation bodies, fixes the clock and compares complete JSON outputs for store change/schema/discovery/diff traces; create/append/duplicate IDs/checkpoint/delta/note/finalize; and normalization with defaults, compactStateCheckpoints=false, and a 300 ms context window/checkpoint threshold. Every complete output is identical. Snapshot/probe artifacts are ignored task-local evidence, not source to commit.

Validation: scoped 12-rule structure probe (`imports`, `exported-values`, `as-never`, `naming`, `directory-files`, `file-lines`, `statement-packing`, `import-cycles`, `test-placement`, `failure-as-empty`, `swallowed-failure`, `regexp-template-escapes`) over new canonical paths and exact changed old paths -> **122 files; zero ratchet failures**. Redundant new state-/action- filename prefixes were removed; path contracts received a focused directory. One raw naming finding remains only for the three existing old `model/state*` compatibility leaves; it equals the existing baseline entry, unchanged. All new canonical paths have zero failures. No baseline file was changed, raised or remapped; no import exceptions were added.

## Limits and integration handoff

SOURCE FROZEN. Public canonical entry points are `runtime/state/index.ts` and `runtime/recording/index.ts`; contract entries are stable as listed above. The lead owns public runtime package exports and final combined package/export/build/structure verification once peers freeze.

Not verified here: package-wide typecheck/build, full repository graph audit, downstream package/browser compatibility or actual model/browser behavior. No paid provider calls, broad test suite, panel/browser operations, git mutations or agents. No SDK/importer/native/engine/flows/composites/flow-adaptation, package export/config, gateway, IO, recording index or mapper source was edited.

The later R5 gateway/IO/index/mapper units remain outside this bounded brief. Their next contracts can consume the canonical generic session/domain/state authorities without importing Studio. Coordinate recording mapper DTOs with the separate SDK owner rather than moving them from this lane.
