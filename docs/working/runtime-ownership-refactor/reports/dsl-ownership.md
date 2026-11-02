# Declarative DSL and region compiler ownership

Outcome: Done (source frozen for lead integration)
Changed: Canonical DSL/compiler/validation, region compilation, shared call metadata and lifecycle applicability; Studio persistence adapters and focused tests.
Validation: 20 closed tests passed; isolated strict typecheck passed; scoped structure audit reported zero findings; exact persisted-plan/source/digest parity passed. Lead subsequently passed the strict source-closure test after closing neutral shared-contract exports.
Not verified: Full touched-package typecheck/build, ordinary Studio integration suites, downstream source consumers, package-export runtime loading, full repository structure gate.
Report: docs/working/runtime-ownership-refactor/reports/dsl-ownership.md
Notes: No git actions, agents, paid runs, browser/panel operations or full suites. No further source changes after this handoff.

## Completed cut

- `flows/executable/dsl` owns declarative definitions, safe source parsing, canonical source generation, dependency pins, normalized executable compilation, registry checks and the shared hash primitive.
- Canonical `compileFlowDefinition` constructs an `ExecutableFlow` without project, source ownership, publication, visibility, origin or timestamps. `compileExecutableFlow` preserves a caller's structural envelope and accepts program validation/digest ports.
- The existing Studio compiler constructs exactly its old persistence envelope, uses the canonical normalization/compiler, composes the shared executable validator with Studio envelope validation, and retains its original digest participation rules. Old exported APIs and their project options remain intact.
- Existing Studio source generation still emits `fluxiq/automation-studio/dsl` and applies its original representation-metadata whitelist. Canonical generation emits `fluxiq/flows/executable/dsl`. The shared parser accepts both exact constrained imports and parses JSON only; it never evaluates source or loads the named module.
- Generic local graph, interface/value, variable/error, lifecycle, reachability, region and execution-default validation now has one authority under `flows/executable/validation`. Studio retains project identity, source compilation stamps, timestamps and publication/history validation. Its diagnostic order is preserved.
- `getCallFlowConfiguration` and its private binding/scope readers moved once into canonical composite ownership. Studio imports/reexports the same reader. DTO fields are unchanged.
- Lifecycle applicability moved once into `components/automation/control-flow`. The control-node array moved unchanged into `definitions.ts`; its order and instances remain unchanged. This avoids a barrel/applicability cycle. The old engine leaf is an exact reexport.
- Neutral region compilation now accepts `ExecutableFlow` under `regions/compilation`. Studio's old function is a compatibility export. `adaptPolicyGraphToPolicyRegion` remains in Studio.

## Exact changed paths

- `packages/fluxiq/src/flows/executable/dsl/`: contracts, definition, normalization, digest, dependencies, registry, compiler, generator, source and barrel; compiler and source-closure tests.
- `packages/fluxiq/src/flows/executable/validation/{flow,interface,value-type,semantic-version,index}.ts` and `tests/flow.test.ts`.
- `packages/fluxiq/src/flows/executable/regions/compilation/{compiler,plan,index}.ts` and `tests/compiler.test.ts`.
- `packages/fluxiq/src/flows/executable/composite/{configuration,index}.ts`.
- `packages/fluxiq/src/components/automation/control-flow/{definitions,event-applies,index}.ts`.
- `packages/fluxiq/src/engine/automation/lifecycle/event-applies.ts` (facade only; executor worker explicitly released it).
- `packages/fluxiq/src/programs/automation-studio/dsl/{compiler,contracts,generator,source}.ts` and new `tests/compatibility.test.ts`.
- `packages/fluxiq/src/programs/automation-studio/model/composites.ts` (call reader extraction only).
- `packages/fluxiq/src/programs/automation-studio/model/validation/flow.ts` and `tests/flow.test.ts`.
- `packages/fluxiq/src/programs/automation-studio/runtime/region-compiler.ts`.

The lead owns root barrels, package exports, authored architecture and neutral shared-contract export changes. No downstream file was changed by this DSL task.

## Observed checks

Commands run from Core `packages/fluxiq` unless noted:

- `pnpm.cmd exec vitest run src/flows/executable/dsl/tests/compiler.test.ts src/flows/executable/validation/tests/flow.test.ts src/flows/executable/regions/compilation/tests` -> 3 files, 20 tests passed. All 13 original lifecycle assertions moved with their subject; assertions were preserved and only the fixture became a neutral executable Flow.
- `pnpm.cmd exec tsc --noEmit --allowImportingTsExtensions --target ES2022 --module ESNext --moduleResolution Bundler --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --skipLibCheck src/flows/executable/dsl/index.ts src/flows/executable/validation/flow.ts src/flows/executable/regions/compilation/index.ts` -> exit 0.
- `pnpm.cmd exec tsc -p node_modules/.cache/dsl-ownership/check.json` -> exit 0, including all new canonical DSL, validation and compilation tests with repository compiler options/source aliases. This is an isolated check, not the full package check.
- Scoped rule API calls via `node --input-type=module` for imports, exported-values, as-never, naming, directory-files, file-lines, statement-packing, import-cycles and test-placement -> zero findings for new DSL/validator/region/compiler/call-reader/control-flow leaves.
- A closed esbuild compatibility probe invoked the actual Studio wrappers plus the actual envelope validator directly, avoiding the unrelated Studio barrel. Full deep equality against the pre-migration compiled output passed for visual plan/digest, code plan/digest and invalid diagnostics; exact generated source bytes and code-owned verification also passed.
- Golden Studio compatibility test pins visual digest `sha256:75839c8116bafbcdc067fe1b94598201ee243f87c9b934a2b4c2ce260af7fa73` and code digest `sha256:77cc0aa74b92fbc1d2f53a55cb62ac2cf97935351934b52c6c5842faee640500`, plus the entire original generated source string. The lead should run the ordinary Studio compatibility suite after the shared build checkpoint.
- Initial closed run reached all 21 tests: 7 passed; 13 failed because a mechanical fixture rename left an undefined `createBlankExecutableFlow`; that fixture was corrected and all 13 then passed. The remaining source-closure test identified eight pre-existing canonical-node imports of `@fluxiq/contracts/automation-studio`. The lead replaced these with neutral `records`/`recording-capture` exports and independently observed the strict source-closure test pass alongside node recording checks (3 files, 6 tests). The test was not relaxed.

## Integration requirements

1. Run ordinary Studio DSL compiler/compatibility tests, model validation envelope tests and existing region-runtime tests after all source owners are frozen.
2. Run the complete touched-package typecheck/build and full structure gate; package-export runtime loading remains a lead check.
3. Keep consumers that require Studio persistence stamping or its source metadata whitelist on the existing Studio API. Moving those imports wholesale to the neutral API would change their intended envelope behavior.

## Verified remaining ownership observations

These were inspected but deliberately left unchanged for the lead's next units:

- `runtime/native-node-runtime.ts`: native implementation binding, grants enforcement, per-domain matcher injection, target resolution, logging and result-boundary checks are now generic mechanics. Recording-mapper registration/listing and the retained importer SDK are the remaining Studio composition edges. Extract a neutral binder/host context and leave authoring registries as adapters.
- `nodes/importer-sdk.ts`: native host/grant/log/matcher contracts and SDK registry validation have framework consumers; recording observations/candidates and editor metadata are Studio authoring contracts. Split by responsibility rather than moving the whole file unchanged.
- `runtime/io-policy.ts`: IO/runtime dispatch, confirmation, result projection and measured confidence enforcement are generic. Its remaining dependencies are Studio policy/action/target DTO names and target normalization. Preserve opaque legacy target wire data while extracting these neutral contracts and the dispatcher.
- `runtime/compiled-plan.ts`: graph normalization/indexing, node/edge projection and executing the projected graph are generic. Its current plan envelope deliberately stamps project identity, settings/instruction revisions, provenance and compiled time. Its stable serializer also treats `undefined` differently from the DSL serializer, so sharing them would change a persisted digest. Split the execution projection from the Studio revision/digest envelope without merging the hash contracts.
- `model/composites.ts`: publication snapshots/history remain Studio. `createCallFlowNode`/definition identity are still pure generic construction helpers beside them; only the shared configuration reader moved in this authorized cut.
