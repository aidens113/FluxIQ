# Rich session and evidence ownership

## Current State

Nine complete data declarations moved and source frozen for Root acceptance. Full-session trace closure is held for Root because its existing public canonical engine barrel imports active engine/runtime-host modules. Evidence-only strict closure and declaration/export parity passed. No engine implementation/source was changed.

## Exact manifest

Paths relative to `packages/fluxiq/src/`. Every destination retains complete original declaration/docs. One declaration per file; each new directory has a barrel.

| Original | Declaration | Destination |
| --- | --- | --- |
| programs/automation-studio/model/runtime.ts | RuntimeActionAttempt | runtime/run-control/session/action-attempt.ts |
| programs/automation-studio/model/runtime.ts | AutomationStudioRuntimeSessionStatus | runtime/run-control/session/status.ts |
| programs/automation-studio/model/runtime.ts | AutomationStudioRuntimeSession | runtime/run-control/session/session.ts |
| programs/automation-studio/model/evidence.ts | StateFactReference | runtime/state/facts/reference.ts |
| programs/automation-studio/model/evidence.ts | StateFact | runtime/state/facts/fact.ts |
| programs/automation-studio/model/evidence.ts | NodeEvidenceRole | flows/executable/evidence/role.ts |
| programs/automation-studio/model/evidence.ts | EvidenceComparator | flows/executable/evidence/comparator.ts |
| programs/automation-studio/model/evidence.ts | NodeEvidenceBinding | flows/executable/evidence/binding.ts |
| programs/automation-studio/model/evidence.ts | GeneratedMetadata | flows/executable/evidence/generated-metadata.ts |

Existing parent barrels gain only exports of session/facts/evidence respectively. Old runtime.ts/evidence.ts import+re-export actual canonical declarations; existing schema/layer/evidence recording re-exports remain. No same-named alias redeclarations.

## Dependencies and finite limits

- Session: JsonObject from core; full FlowDocument from flows/authoring/legacy-artifact; full GraphExecutionTrace from engine/automation/index.ts, the public barrel exposing its actual contracts.ts declaration owner. Status uses session barrel. No value engine imports; Root explicitly selected this existing public barrel while holding full trace closure.
- ActionAttempt: JsonObject/core and EvidenceReference/@fluxiq/contracts/recording.
- Facts: JsonObject/core; EvidenceReference/@fluxiq/contracts/recording; EvidenceAnchor, StatePresentationMetadata, StateValue/@fluxiq/contracts/state; local complete FactReference.
- Node evidence: neutral primitive/JSON fields; StateFactReference from runtime/state/facts; EvidenceAnchor/@fluxiq/contracts/state; EvidenceReference/@fluxiq/contracts/recording; canonical local role/comparator.
- Full GraphExecutionTrace currently lives in engine/automation/contracts.ts, which imports transitions/node-execution/defensive/lifecycle and runtime automation-host/parking barrels. Its source/type closure reads active collaborators. Do not traverse it while those writers run. Existing contracts/index.ts exports GraphExecutionOptions only; no change to engine files is authorized here.
- Declaration/docs/literal parity and original export surface are exact finite checks. Evidence-only strict closure can run independently; Root coordinates frozen full-session closure/package check. Compatibility type assertions compare every original/canonical type without reduced DTOs.
- No new validators/runtime behavior/state/registries, no package-wide tests/builds/audits, no browser/provider/git/agents.

## Observed acceptance

- `node "$env:TEMP/rich-session-parity.cjs"` -> nine complete declaration/docs/literal comparisons and both original export surfaces, zero mismatches. This compares saved original source with the new owners; original field/nullability/status/timestamp/full-flow/full-trace declarations are unchanged.
- `node "$env:TEMP/rich-session-evidence-closure.cjs"` -> evidence/facts strict type closure, 11 source modules, zero diagnostics and zero program modules including erased types. No session/engine closure was traversed.
- `node "$env:TEMP/rich-session-structure.mjs"` -> 18 owned files, zero file-local failures. Whole-graph/browser/cycle/package/docs rules intentionally held for Root, as in A1. No baseline/config edits.
- `pnpm.cmd exec vitest run src/programs/automation-studio/model/tests/rich-session-evidence.test.ts --minWorkers 1 --maxWorkers 1` (packages/fluxiq) -> one compatibility test passed, 639ms. Its type assertions cover all nine old/new type pairs plus exact full FlowDocument and full GraphExecutionTrace; Vitest runtime collection erases those imports and does not establish compiler acceptance. Root must typecheck this file/session closure at common freeze.

## Return Contract

Outcome: Done
Changed: runtime/run-control/session/**, runtime/state/facts/**, flows/executable/evidence/**, three parent barrels, model/runtime.ts and evidence.ts compatibility imports/re-exports, model/tests/rich-session-evidence.test.ts, this report
Validation: nine declarations and two export surfaces -> zero parity mismatches; evidence strict closure -> 11 modules/zero diagnostics/program edges; scoped structure -> 18 files/zero failures; one focused compatibility test passed.
Not verified: full session/engine compiler closure and compile-time expectTypeOf assertions (held for Root common freeze); package-wide checks/builds, whole-graph audit and downstream consumers.
Report: docs/working/runtime-ownership-reset-plan/reports/rich-session-evidence.md
Notes: Source frozen. Exact session-trace closure deferred to Root common freeze; no ownership expansion, behavior changes, git or agents.
