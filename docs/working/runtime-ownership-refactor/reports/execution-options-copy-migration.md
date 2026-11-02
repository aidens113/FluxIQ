# Execution-options copy migration

SOURCE FROZEN. Dispatch: [implementation brief](../briefs/execution-options-copy-migration.md); binding/getter decisions: [migration plan](execution-options-copy-migration-plan.md).

## Changed

Migrated all 20 released production files, all 29 initially flagged spreads and their inferred follow-ons to `copyAutomationExecutionOptions`. The stripped-base graph-run copy also uses the helper while retaining its explicit inheritance from the original options. No source outside the released list was edited.

All seven prepared targets use explicit null: driver.prepare and both targets in candidate-trial/run and subflow-trial/{run,from-step}. Their original conditional/actual-entered-child binders remain intact. Read-only input cannot acquire an observation through an early copy. Default copies preserve the original observation and retry series; graph-run retains its separate successful-pass versus scheduled-retry token logic without changing arrival/progress counters.

Staged copies retain source-getter-before-override evaluation, all extra enumerable own string/symbol fields and original collaborator references. Composite boundary keeps the original rest stripping and inherits authority from parentOptions, never childOverrides. Existing original-object branches, referenceNow deletion/re-add, input cloning, classifier precedence, parked-node settlement and budget/attempt numbering remain unchanged.

Immediate regressions:

- `engine/automation/environment/tests/executor-options.test.ts`: original source getters precede environment getters; unknown symbol/reference and explicit undefined survive.
- New `engine/automation/composite/tests/boundary-options.test.ts`: original stripped-field getter sequence and absent fields, actual child execution writes only under the original parent authority despite a separately observed override object, and parent retry identity survives.
- New `programs/automation-studio/runtime/executor/tests/execution-options-copy.test.ts`: stateful classifier getter ordering and extra fields; real observed private host counter acts once then throws, and another legacy-wrapper execution remains refused with pending coverage.

Root separately added the stable Context|null helper before dispatch and, after this worker's cycle finding, changed copy.ts and inherit.ts imports to the defining `kernel/series.ts`. Those Root-owned files/tests were not edited here. The same owner identity is retained.

## Observed checks

- Typed fixed-point guard: `node scripts/structure-audit.mjs --rule execution-options-copy --json` -> exit 0; 0 failures, 0 warnings, 0 suppression, including the inferred copies.
- Guard fixtures: `node --test scripts/structure-audit/rules/tests/execution-options-copy.test.mjs` -> 23/23 passed.
- Focused production cohort below -> 25 files, 257 tests passed, 54.93 seconds. All four actual partial native lost-ACK counter entrances, required-engine/read-only/parent paths, canonical resume/composite/frame, legacy trial/live-patch/detached/annotation/adaptive-rerun oracles passed unchanged.
- Final affected rerun after Root's import correction and the strengthened actual child oracle -> 4 files, 17 tests passed, 25.03 seconds: boundary-options, admission copy/producers and legacy execution-options-copy.
- Environment subject -> 5/5 passed; legacy new subject -> 2/2 passed. Together with the 25-file selection, 27 distinct production test subjects / 264 distinct tests passed. Repeated cases are not added to that total.
- Source-closed strict check used the package tsconfig compiler options, 20 production roots plus the three immediate test roots, noEmit and incremental=false: initial 23 roots / 4,855 source files -> 0 diagnostics. A later check encountered two disjoint TS2305 errors at Studio service.ts:3 and service/execution-admission/ports.ts:4, both missing the shared `ExecutionScopeAttestor` export. Root fixed its selective contract export list; final narrow strict rerun -> **23 roots / 4,857 source files / 0 diagnostics**. No local diagnostic or shared edit by this worker; no tests repeated for the export-only correction.
- Scoped structural pass: run the existing 15 rules against complete context/import graph, then retain findings for the 23 owned files and their directories and apply the existing baseline -> 0 failures. Seven existing advisory warnings remain (four directory widths and graph-run/live-patch/annotation lengths); two pre-existing ratcheted findings remain. No baseline/config changes or waivers. Trailing whitespace/final newline check -> 0.

Structural rule set: as-never, class-methods, directory-files, exported-values, failure-as-empty, file-lines, import-cycles, imports, naming, regexp-template-escapes, restricted-references, shared-temp-root, statement-packing, swallowed-failure, test-placement. Existing baseline was only read.

Correction history: the first test launch used maxWorkers=3 without minWorkers and ran no tests because Vitest's default minimum conflicted; all actual runs below set both. The first new boundary assertion assumed one excluded-getter read. A direct Node probe of the unchanged original object-rest statement showed this fixture's existing sequence is start/stop/start/stop; the new test preserves that exact sequence and still rejects an extra full-parent materialization. The first scoped audit found the genuine driver/helper/kernel-barrel cycle and a private-bindings import in the new test. Root fixed the two defining-owner imports; the test now proves ownership through actual child execution/persistence instead of exposing private bindings.

## Exact acceptance command

Workdir: `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ/packages/fluxiq`.

```powershell
$subjects = @(
  "src/engine/automation/execution-admission/tests/copy.test.ts"
  "src/engine/automation/execution-admission/tests/producers.test.ts"
  "src/engine/automation/composite/tests/boundary-options.test.ts"
  "src/engine/automation/compiled-plan/tests/run.test.ts"
  "src/engine/automation/composite/tests/run.test.ts"
  "src/engine/automation/frames/tests/invocation-frame.test.ts"
  "src/engine/automation/tests/resume.test.ts"
  "src/programs/automation-studio/runtime/candidate-trials/authority/tests/executor-observation.test.ts"
  "src/programs/automation-studio/runtime/candidate-trials/partial/tests/native.test.ts"
  "src/programs/automation-studio/runtime/candidate-trials/partial/tests/parent.test.ts"
  "src/programs/automation-studio/runtime/candidate-trials/partial/tests/required-engine.test.ts"
  "src/programs/automation-studio/runtime/candidate-trials/partial/tests/read-only.test.ts"
  "src/programs/automation-studio/runtime/service/candidate-trial/tests/environment/tests/trial-environment.test.ts"
  "src/programs/automation-studio/runtime/service/subflow-trial/tests/environment.test.ts"
  "src/programs/automation-studio/runtime/service/subflow-trial/tests/reference-now.test.ts"
  "src/programs/automation-studio/runtime/service/subflow-trial/tests/from-step.test.ts"
  "src/programs/automation-studio/runtime/flow-bootstrap/verification/tests/detached-execution.test.ts"
  "src/programs/automation-studio/runtime/flow-bootstrap/verification/tests/candidate-owned-subflows.test.ts"
  "src/programs/automation-studio/runtime/flow-bootstrap/verification/tests/reference-now.test.ts"
  "src/programs/automation-studio/runtime/flow-change/tests/trial.test.ts"
  "src/programs/automation-studio/runtime/flow-change/tests/resume.test.ts"
  "src/programs/automation-studio/runtime/tests/live-patch.test.ts"
  "src/programs/automation-studio/runtime/tests/composite-executor.test.ts"
  "src/programs/automation-studio/runtime/service/runtime-adaptation/tests/repair-rerun.test.ts"
  "src/programs/automation-studio/runtime/recovery/annotation/tests/annotate.test.ts"
)
pnpm.cmd exec vitest run $subjects --minWorkers 1 --maxWorkers 4
```

Final affected command in the same workdir:

```powershell
pnpm.cmd exec vitest run src/engine/automation/composite/tests/boundary-options.test.ts src/engine/automation/execution-admission/tests/copy.test.ts src/engine/automation/execution-admission/tests/producers.test.ts src/programs/automation-studio/runtime/executor/tests/execution-options-copy.test.ts --minWorkers 1 --maxWorkers 3
```

Separate environment/getter command in the same workdir (the earlier three-subject run's environment and legacy subjects passed; the boundary subject was then corrected and independently passed above):

```powershell
pnpm.cmd exec vitest run src/engine/automation/environment/tests/executor-options.test.ts src/engine/automation/composite/tests/boundary-options.test.ts src/programs/automation-studio/runtime/executor/tests/execution-options-copy.test.ts --minWorkers 1 --maxWorkers 3
```

Not verified: coordinated package typecheck/build/full suites, downstream/browser behavior, paid providers, or the separately identified existing flow-change hostProxy identity hazard. No test/provider/browser/panel/build processes remain. Root owns package integration and C may resume selective tests against these frozen sources.

Outcome: Done
Changed: released 20 production files, three immediate test files and this report
Validation: guard 0; Node fixtures 23/23; production subjects 27 files / 264 distinct tests pass; final affected 4/17 pass; scoped structure 0 failures; whitespace 0; final source-closed strict 0 diagnostics
Not verified: package/full/downstream acceptance
Report: docs/working/runtime-ownership-refactor/reports/execution-options-copy-migration.md
Notes: Source frozen and all worker processes finished. Root-owned helper/inherit cycle correction preserves the same private series owner. No git/config/baseline/shared-source changes by this worker.
