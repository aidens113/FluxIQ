# R1 importer, native binding and adapter registry

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Extract actual importer SDK, trusted implementation binder and identity-preserving generic adapter registry.
Repository: paired Core checkout named by lead dispatch, not old t842 path.
Read: Current State of ../../runtime-ownership-refactor.md; reports/native-io-plan.md R1; Core boundary/code-structure rules.
Owned: Studio nodes/importer-sdk.ts; runtime/{native-node-runtime,adapters}.ts; canonical components/automation/{importer,target-refresh}/**, runtime/{native-execution,adapters}/**; engine/automation/parameter-refresh/resolve.ts and exact resolver facade/barrel; focused owned tests.
Must not touch: environment/control/resources/composites, state/recording/contracts package, IO/output-dispatch (next serial unit), model/flow-adaptation.ts, public package exports, parent canonical/Studio barrels, audit configs, shared docs/indexes, other worker reports.
Lead owns exports, parent barrels and downstream import migration. Do not make importer registry import a parent barrel reexporting itself.
Preserve exact existing public names/class identities, manifests, grants, maps, matcher per-domain registration, metadata/action-effect floors, failure/uncertain-act boundaries, default values and cancellation.
Move pure target-refresh declaration resolution out of engine to neutral component owner; actual retry/reacquisition remains engine.
Adapter contracts generic over supplied state/action DTOs; old Studio specialization aliases constructor and instance types, no copied implementation/subclass.
Importer mapper DTOs stay canonical importer in this unit; R5 worker does NOT edit SDK, and later mapper contracts can consume this stable owner. No duplicate contracts.
No runtime -> engine or canonical -> Studio import paths, including types. Use neutral records seam.
One exported thing per source file; directories/barrels/budgets; no extract-and-drop or baseline increases/remaps.
Move pure tests to owners; retain actual Studio composition tests. Add exact old/new class/function identity checks.
Acceptance: canonical importer/native/refresh/adapter tests and retained Studio native integration tests; report test commands/results.
No package-wide check/build during concurrent editing, no full suites/provider calls/git mutations/spawning.
Report source freeze when R1 ready; R3 needs separate stable target-preparer contract from lead.
Report: docs/working/runtime-ownership-refactor/reports/native-binding.md.
Return: Outcome; Changed; Validation exact commands/results; Not verified; Report; Notes <=3 lines.
