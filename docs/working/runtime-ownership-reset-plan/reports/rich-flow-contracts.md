# Rich Flow contracts preparation

## Current State

Source migration complete and frozen for Root verification. Complete declarations/defaults are canonical; old paths retain aliases. Scoped tests, strict canonical type closure, declaration parity and scoped file structure pass. No package-wide checks/builds, git mutations or agents ran. Paths below are relative to `packages/fluxiq/src/`.

## Exact declaration and file manifest

Each arrow means move the complete declaration and its leading documentation, preserving its name/body/literal metadata. New directories receive `index.ts` barrels.

From `programs/automation-studio/model/flows.ts` to `flows/authoring/flow/`:

| Declaration | File |
| --- | --- |
| AutomationStudioFlowVisibility | visibility.ts |
| AutomationStudioFlowOrigin | origin.ts |
| AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION | representation/version.ts |
| AutomationStudioFlowRepresentationKind | representation/kind.ts |
| automationStudioFlowRepresentationKind | representation/kind-of.ts |
| isAutomationStudioSubflowGraphMetadata | is-subflow-graph-metadata.ts |
| withAutomationStudioFlowRepresentation | with-representation.ts |
| AutomationStudioFlowSource | source.ts |
| AutomationStudioFlowLegacyProvenance | legacy-provenance.ts |
| AutomationStudioFlowArtifact | artifact.ts |
| AutomationStudioFlowMigrationOutcome | migration-outcome.ts |
| AutomationStudioFlowMigrationLedger | migration-ledger.ts |
| createBlankAutomationStudioFlowArtifact | create-blank.ts |

From `flows.ts` to `flows/authoring/publication/`:

| Declaration | File |
| --- | --- |
| AutomationStudioFlowPublication | publication.ts |

From `programs/automation-studio/model/composites.ts` to `flows/authoring/publication/`:

| Declaration | File |
| --- | --- |
| AutomationStudioPublishedFlowSnapshot | snapshot.ts |
| AutomationStudioFlowPublicationRecord | record.ts |
| createPublishedFlowSnapshot | create-snapshot.ts |

From `flows.ts` to `flows/authoring/settings/`:

| Declaration | File |
| --- | --- |
| AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION | intervention/version.ts |
| AutomationStudioInterventionMode | intervention/mode.ts |
| automationStudioInterventionMode | intervention/read.ts |
| withAutomationStudioInterventionMode | with-intervention-mode.ts |
| defaultAutomationStudioFlowSettingsMetadata | defaults.ts |

The existing private `isJsonObject` body lives once in `settings/internal/is-json-object.ts`, exported only by its internal barrel and omitted from the public settings barrel. Both original consumers import it. Representation/intervention groups use subdirectories to satisfy the shared-prefix rule.

From `programs/automation-studio/model/artifacts.ts` to `flows/authoring/legacy-artifact/`:

| Declaration | File |
| --- | --- |
| AutomationStudioProjectArtifactKind | project-artifact-kind.ts |
| AutomationStudioFlowOwnerKind | flow-owner-kind.ts |
| AutomationStudioFlowDocument | flow-document.ts |
| AutomationStudioTaskArtifact | task-artifact.ts |
| AutomationStudioRoutineArtifact | routine-artifact.ts |
| AutomationStudioConfigArtifact | config-artifact.ts |
| AutomationStudioProjectArtifacts | project-artifacts.ts |
| createBlankAutomationStudioFlow | create-blank-flow.ts |

From `programs/automation-studio/model/flow-adaptation.ts`: move ONLY complete `AutomationStudioFlowExpansionReferences` to `flows/authoring/flow/expansion-references.ts`. Replace declaration with exact old-name type alias using a canonical imported type; all other declarations remain unchanged. This type has only optional string/string-array fields and no dependencies.

From `programs/automation-studio/model/flow-size/flow-size-settings.ts` to `flows/authoring/settings/size/`:

| Declaration | File |
| --- | --- |
| AUTOMATION_STUDIO_FLOW_SIZE_SETTING | setting.ts |
| automationStudioFlowSizeSettingIssue | issue.ts |
| automationStudioFlowMaxNodesPerSubflow | max-nodes-per-subflow.ts |

Move `AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY` from `model/tokens-per-run/tokens-per-run-default-cleared-key.ts` to `flows/authoring/settings/tokens-per-run-default-cleared-key.ts` unchanged.

## Imports, aliases and closure

- All canonical relative imports target directory barrels. Flow artifact uses graph edge/node from `flows/executable/graph`, interface/scope from executable owners, regions from `flows/executable/regions`, schema/evidence from `@fluxiq/contracts/recording`, publication snapshot from its canonical owner and expansion from its canonical owner.
- Defaults use recovery constants from `flows/executable/recovery`, cost ceiling from `runtime/agents/budget/run-cost-ceiling`, and canonical size/token settings. JSON types stay in `core`.
- Publication snapshot keeps `ExecutableFlowSnapshot` and `captureExecutableFlowSnapshot` from executable composite; it imports the canonical full Flow artifact. Complete Flow/publication type cycle stays wholly outside Studio.
- Legacy project artifact kind continues to alias `ProjectArtifactKind` from framework persistence; schema moves directly to `@fluxiq/contracts/recording`; nodes/edges stay executable graph.
- `flows.ts`, `composites.ts`, `artifacts.ts` become identity-preserving exports of their moved declarations, retaining every existing executable/interface/recovery/component re-export on its old path. Settings old files retain exports to canonical owners; old directory barrels stay usable.
- Add only the four new directory exports to existing `flows/authoring/index.ts`. Existing instruction/project/plan exports remain.
- Consumers beyond owned source/tests are Root follow-up. No persistence, runtime, package manifest or public package export changes are included.

## Finite validation after release

- Preserve original declaration source text (line-ending normalization only), comments/default literals, and exported symbol set; compare AST declaration text before and after, including complete rich artifact/publication/legacy shapes and size settings.
- Strict narrow TypeScript closure rooted at four new canonical directory barrels: zero diagnostics and no program modules, including erased types. Root coordinates broader compiler/structure on frozen tree.
- Retarget immediate `model/tests/{flows,composites,intervention-mode}.test.ts` imports to canonical Flow/publication/settings owners; retain validation imports from current owner for existing validation assertions. Retarget size test to canonical settings size barrel.
- Existing focused behavior cases: private visual blank Flow and complete versioned public Flow, invalid Flow diagnostics, immutable publication snapshot and display-independent digest, current/legacy intervention round trips, exact size defaults/range/stored values.
- Add focused canonical blank-legacy artifact and old/new function/constant alias identity checks under new canonical owners. Existing test oracles remain intact.
- Do not run broad checks/builds/audits while concurrent writers run; narrow checks only after release, coordinated with Root.

## Observed acceptance

- `node "$env:TEMP/rich-flow-parity.cjs"` -> 36 declaration/doc/literal comparisons (35 public plus one internal predicate), zero mismatches after normalizing line endings and internal export modifier. Original complete size-setting header retained.
- `node "$env:TEMP/rich-flow-closure.cjs"` -> strict four-barrel TypeScript closure: 405 source modules, zero diagnostics, zero program dependencies including erased types.
- `node "$env:TEMP/rich-flow-structure.mjs"` -> 58 owned files, zero file-local structure failures. Browser/reach/cycle/package/docs graph rules intentionally excluded because the context is scoped, not the whole repository; Root runs those on the frozen tree. Initial use of graph rules against scoped context produced missing-entry harness errors; initial canonical test placement correctly failed the authoring-to-program boundary and was corrected by placing alias tests under the legacy model owner. No audit rule/baseline changes.
- `pnpm.cmd exec vitest run src/programs/automation-studio/model/tests/flows.test.ts src/programs/automation-studio/model/tests/composites.test.ts src/programs/automation-studio/model/tests/intervention-mode.test.ts src/programs/automation-studio/model/flow-size/tests/flow-size-settings.test.ts src/programs/automation-studio/model/tests/rich-flow-compatibility.test.ts --minWorkers 1 --maxWorkers 1` (packages/fluxiq) -> 5 files and 26 tests passed, final run 4.96s.
- Compatibility test is under `model/tests/rich-flow-compatibility.test.ts`; it covers canonical complete blank legacy output plus function/constant identity through original aliases.

## Return Contract

Outcome: Done
Changed: Canonical flow/publication/legacy-artifact/settings source trees and barrels; original model aliases; four existing immediate test files; new model/tests/rich-flow-compatibility.test.ts; this report.
Validation: focused vitest -> 5 files/26 tests pass; declaration parity -> 36/36; strict closure -> zero diagnostics/program edges; scoped file structure -> 58 files/zero failures.
Not verified: package-wide compiler/build, whole-repository structure/browser/reach gates, downstream public package rebuild or external consumers (Root-owned).
Report: docs/working/runtime-ownership-reset-plan/reports/rich-flow-contracts.md
Notes: Source frozen for Root acceptance. Single private predicate module; no behavior/default/digest edits. No agents/git/broad checks run.
