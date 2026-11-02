# R1 importer, native binding and adapters

Outcome: Done. SOURCE FROZEN.

## Ownership and compatibility

- `components/automation/importer/**` owns the existing SDK version, manifest registry/validation, implementation bundle, native-node context/implementation, recording mapper DTOs, resolver/comparator DTOs, and declarative state visualizers. Existing exported names and complete DTO shapes are preserved. The recording mapper candidate imports the existing `AutomationStudioRecordOutput` from the neutral `@fluxiq/contracts/records` seam; that seam does not export a separate `RecordOutput` name.
- `runtime/native-execution/**` owns the original native runtime class and its grants/execution DTOs. It uses canonical graph/node/host/matching/reference-time/result contracts, with no Studio or engine import. Private implementation maps, domain matcher registration, grant checks, conservative action-effect floors, isolated ports, output boundaries, timeout/cancellation, and log redaction remain unchanged.
- `components/automation/target-refresh/**` owns the original declaration resolver. The engine resolver leaf forwards that exact function; the existing engine barrel continues forwarding its leaf. Actual refresh/retry/reacquisition behavior stays in the engine.
- `runtime/adapters/**` owns the generic registry and opaque state/schema/action-definition/action-result type parameters. The old Studio adapter module specializes those types and aliases the constructor and instance type directly. There is no wrapper/subclass or copied registry. The original constructor name, insertion/replacement order, `instanceof`, and stored adapter object identities are preserved.
- Old `nodes/importer-sdk.ts`, `runtime/native-node-runtime.ts`, and `runtime/adapters.ts` are compatibility entries. The importer registry and validator import defining ancestor node modules so that the parent automation barrel may export importer without introducing a registry cycle.

No IO/output-dispatch, graph-options, environment/control/resources, state/contracts package, composites, package exports, parent barrels, downstream source, audit configuration, original checkout, or t842 source was edited or validated by this unit. The lead owns public exports and downstream migration. R3 has not started.

## Tests and mechanical proof

All 31 original native tests remain: 16 binder-only cases moved to `runtime/native-execution/tests/native-node-runtime.test.ts`; 15 Studio composition cases remain at the original owner. Both original SDK validation cases moved to canonical importer validation. No original assertion was relaxed. An invalid parameter-contract fixture uses `Reflect.set` instead of carrying the old `as never` cast into its new owner.

Added checks cover independent manifest copies; exact old/new SDK/native/refresh/adapter identities and specialization; opaque adapter DTOs and identity/order/list behavior; descriptor-only refresh reads, version/registration refusals, duplicate/unsafe/conditional-commit fields, output ambiguity/shape, and unreadable declarations. The source-closure test checks every canonical R1 relative import, including erased type imports, and bundles all four entries while refusing any transitive Studio or engine dependency.

Read-only pre-extraction snapshots are retained only in ignored `.fluxiq/refactor/` probes. Comparing parsed declaration/body structure before and after relocation confirms **36 exact SDK/native/refresh declaration AST matches**, ignoring formatting/comments and numeric separators. This covers all moved original declarations, including complete native implementation methods and private helpers.

## Observed validation

Commands run only in `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ`:

- `pnpm.cmd --filter fluxiq exec vitest run src/components/automation/importer/tests/validation.test.ts src/components/automation/importer/tests/source-closure.test.ts src/components/automation/target-refresh/tests/resolve.test.ts src/runtime/native-execution/tests/native-node-runtime.test.ts src/runtime/adapters/tests/registry.test.ts` -> **5 files, 29 tests passed** (final run 17.09 seconds).
- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/nodes/tests/importer-sdk.test.ts src/programs/automation-studio/runtime/tests/native-node-runtime.test.ts src/programs/automation-studio/runtime/tests/adapters.test.ts` -> **3 files, 18 tests passed**. Native test execution itself took 274 ms; this run spent 230.49 seconds including 170.55 seconds transforming the retained Studio dependency graph.
- `pnpm.cmd --filter fluxiq exec tsc -p ../../.fluxiq/refactor/tsconfig-native-binding.json --pretty false` -> **exit 0**, strict R1-only configuration with 41 canonical source/test roots. The initial attempt identified type-only relative relocation paths, the actual neutral record-output export name, and the FlowScope barrel; those owned errors were fixed before the passing run.
- `node .fluxiq/refactor/native-binding-equivalence.cjs` -> **36 exact declaration/body AST comparisons passed**.
- `node .fluxiq/refactor/native-binding-structure.mjs` -> **0 scoped findings** across imports, cycles, exported values, `as never`, naming, directory/file/class budgets, statement packing, test placement, and web vocabulary. No baseline edits/remaps were made.

Not verified: package-wide checks/builds, downstream public-subpath migration/build/browser behavior, or full suites. The lead is coordinating parent barrels/package exports and the shared Studio test-directory budget after handoff. No providers, paid calls, browser sessions, panel servers, git mutations, or agents were started; no validation process from this unit remains in flight.
