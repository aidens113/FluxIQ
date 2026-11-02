# Recording indexing implementation

Outcome: Done. Actual indexing mechanisms and rich DTO authority moved to canonical owners, legacy policy-bound entry points remain compatible, and the reproduced opaque-ID dictionary defect is fixed. Final acceptance passed 50/50 tests, isolated strict types passed for 75 owned files, and scoped structure/AST review has zero failures/warnings. Source is frozen for lead integration; no built output was regenerated.

## Changed

- New `packages/contracts/src/recording/indexing/**` and `packages/fluxiq/src/runtime/recording/indexing/**`.
- Studio `storage/state-index.ts`, new `storage/recording-index-policy/**`, and `storage/tests/state-index.test.ts`.
- Studio `runtime/state-linker.ts` and `runtime/tests/state-linker.test.ts`.
- Studio `runtime/service/recording-state-index/{build,lookup,entry-readings,state-entry-readings,contracts,index,policy}.ts` plus its new immediate `tests/{build.test,projection}.ts`.
- This report. Parent barrels, exports, architecture/shared documents, audit configuration/baseline, storage/repository implementations, other lanes and git were not edited by this worker.

## Frozen interface

Canonical DTOs live in `packages/contracts/src/recording/indexing/` and are consumed through existing `@fluxiq/contracts/recording`. They retain schema `0.2`, all old index/item/lookup/state-link fields, and shared rich state contracts.

Runtime policy contracts live in `runtime/recording/indexing/policy/{scope,reference-reader,observation,build-ports}.ts`, exported through the policy and indexing barrels: `RecordingReferenceReader` has explicit `accepts` and diagnostic-preserving `validate`; `RecordingIndexObservationPolicy` has `isSnapshot` and `embeddedState`; `RecordingIndexBuildPorts` supplies those plus `now()`. Their exact frozen shapes are unchanged. No default reference or observation interpretation is inferred by canonical build/validation.

The lead owns parent barrels/package exports and was notified once the actual mechanism barrel became coherent. Only existing public seams are needed: contracts `recording/index.ts` and runtime `recording/index.ts` export their indexing feature barrels. Studio binds the real content-ref parser/same-project policy and exact legacy observation/embedded-state heuristics. Lookup candidate sources accept only `{ sourceObservationIds?: string[] }`.

## Implementation and compatibility

- Actual empty/shape/sort/ref-union/visual-summary/validation/assert, nearest-time link finalization, timeline projection/build, explicit/prior lookup, candidate-source selection and proposal-link algorithms now live in canonical indexing. They import no Studio or mapper authority, including erased types.
- Shared contracts retain all old fields and schema `0.2`; state links, visual paths and lookup state payloads use existing rich state authorities. Index DTO leaves contain one type authority; the schema constant and its derived type remain one schema authority.
- Old storage, linker, build, lookup and reading entry points preserve their names and signatures through reexports or explicit Studio-policy binding. Repair service envelopes stay Studio. Repository loading, storage, hydration, repair persistence and locks were not moved or changed.
- Original five linker cases moved to canonical ownership with a legacy function/result compatibility case retained. Structural/sort/visual/ref-union tests use a neutral injected reference policy; real Studio invalid/cross-project/API reference interpretation remains tested at the adapter. Actual atomic-store and real-SQL service integrations stay in their existing files.
- Full projection/serialized JSON oracle retains timestamp/metadata precedence, finite selection, raw and trimmed accepted refs, exact optional fields, state/frame coordinates, visual summaries, sort order and input immutability. Linking still chooses nearest absolute time with prior ties; lookup still selects prior states with its distinct timestamp and sequence precedence.

## Opaque-ID defect and correction

The old implementation read plain dictionaries by bracket without checking ownership, so inherited `constructor`, `__proto__` and `toString` were mistaken for actual state/action/entry records. Direct writes to `__proto__` invoked the prototype setter and lost actual indexed entries/states. The small canonical dictionary capability now checks `Object.hasOwn` for reads and uses an enumerable/configurable/writable data property for writes. All build, link, validation and lookup paths use that ownership rule. Dictionaries keep `Object.prototype`; IDs are neither banned nor rewritten. JSON-hydrated own records remain ordinary data.

After the product correction, the new hydration test uncovered a Vitest comparison limitation when an own `constructor` value is a state object: native strict deep equality was true, serialized bytes identical and dictionary prototypes identical while Vitest reported no visible difference. The oracle now uses native `assert.deepStrictEqual` plus exact serialized byte equality for these complete opaque-ID objects. No prototype/data changes or expectation relaxation were made. Diagnostic log `.fluxiq/refactor/recording-indexing-hydration-diagnostic.log` records the facts.

## Verification ledger

- Before moving any existing algorithm, added a complete explicit projection oracle covering metadata precedence, finite timestamp selection, raw and trimmed object refs, visual-target summary, coordinate space, timeline order, schema and input immutability. `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/recording-state-index/tests/build.test.ts` -> exit 0, 1/1 passed, 26.47 seconds against unchanged legacy algorithms. Log `.fluxiq/refactor/recording-indexing-projection-baseline.log`.
- First migrated-source selection: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/recording/indexing src/runtime/recording/tests/ownership.test.ts src/programs/automation-studio/storage/tests/state-index.test.ts src/programs/automation-studio/storage/tests/recording-index-store.test.ts src/programs/automation-studio/runtime/tests/state-linker.test.ts src/programs/automation-studio/runtime/service/recording-state-index/tests/build.test.ts src/programs/automation-studio/runtime/tests/service-recordings/tests/state-index.test.ts` -> exit 0, 11 files / 44 tests passed, 48.36 seconds. This includes the real-SQL service integration, atomic store, full original projection and erased-import closure check. Log `.fluxiq/refactor/recording-indexing-tests.log`.
- Initial strict owned-file typeprobe found two test-only issues (runtime rather than shared contract type import; unsupported note append fixture input). Both constructions were corrected without changing the complete expected projection.
- Lead review identified inherited dictionary keys as a concrete generic-index defect. Before any fix, `pnpm.cmd --filter fluxiq exec vitest run src/runtime/recording/indexing/tests/opaque-ids.test.ts` -> exit 1, 5 failed / 1 passed / 6 total, 2.19 seconds. Empty lookup returned inherited `constructor`, `__proto__` and `toString` as states; actual `__proto__` timeline IDs disappeared on assignment; validation missed four absent inherited-ID links. Own constructor/`__proto__` action IDs hydrated from JSON already passed and remain a positive oracle. Log `.fluxiq/refactor/recording-indexing-opaque-ids-before.log`.
- First post-correction probe (`opaque-ids.test.ts` plus the direct legacy build file) passed 8/9; the only remaining failure was the comparator limitation above. The native-equality/byte/prototype diagnostic independently reproduced it in 1.49 seconds before the complete strict oracle was changed to the native assertion.
- `node --max-old-space-size=4096 .fluxiq/refactor/recording-indexing-typecheck.cjs` -> exit 0; 75 owned source/test files, zero isolated strict diagnostics. This uses the package's actual strict options and checks each owned file, without whole-package typecheck or emitted output. Final log `.fluxiq/refactor/recording-indexing-final-typecheck.log`.
- `node --max-old-space-size=4096 .fluxiq/refactor/recording-indexing-structure.mjs` -> exit 0; 75 owned files; 15 official structure rules plus AST type-authority/barrel review; zero failures and zero warnings. The ignored probe builds a filesystem-only source context for correct cross-file graph analysis, filters findings to owned paths, and never calls git or updates configuration/baseline. Log `.fluxiq/refactor/recording-indexing-structure.log`.
- Final rerun of the exact migrated-source selection command above after all corrections -> exit 0; 12 files / 50 tests passed; 52.05 seconds. This includes all six opaque-ID regressions, original five moved linker cases, full projection/JSON byte equality, canonical policies/lookup/ties, legacy wrappers, real atomic index store, seven real-SQL service cases, and the two erased-import/domain-vocabulary ownership guards. Log `.fluxiq/refactor/recording-indexing-final-tests.log`.

## Not verified and handoff

All requested owned source checks completed and all runners stopped. No further source edits or checks are planned. Combined public package check/build, emitted declarations, parent-export integration and downstream acceptance remain lead integration work. No whole Core build, whole suites, providers, browser, panel, real user data or git operations were used. Runtime and contract public API shapes are frozen as described above; this worker has no open implementation question.
