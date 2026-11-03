# Rich Flow contracts preparation

## Current State

Manifest ready; source remains read-only pending Root release. No tests, builds, source edits, git mutations or agents were run. Paths below are relative to `packages/fluxiq/src/`.

## Exact declaration and file manifest

Each arrow means move the complete declaration and its leading documentation, preserving its name/body/literal metadata. New directories receive `index.ts` barrels.

From `programs/automation-studio/model/flows.ts` to `flows/authoring/flow/`:

| Declaration | File |
| --- | --- |
| AutomationStudioFlowVisibility | visibility.ts |
| AutomationStudioFlowOrigin | origin.ts |
| AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION | representation-version.ts |
| AutomationStudioFlowRepresentationKind | representation-kind.ts |
| automationStudioFlowRepresentationKind | representation-kind-of.ts |
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
| AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION | intervention-mode-version.ts |
| AutomationStudioInterventionMode | intervention-mode.ts |
| automationStudioInterventionMode | intervention-mode-of.ts |
| withAutomationStudioInterventionMode | with-intervention-mode.ts |
| defaultAutomationStudioFlowSettingsMetadata | defaults.ts |

The existing private `isJsonObject` body is retained privately in each of the two intervention functions' files; it gains no public export.

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

## Return Contract

Outcome: Done (manifest preparation only)
Changed: docs/working/runtime-ownership-reset-plan/reports/rich-flow-contracts.md
Validation: read-only `rg` and source inspection -> exact declarations, dependencies and existing focused tests inventoried; tests not run because this stage is manifest-only.
Not verified: runtime behavior, compile closure, alias identity, structure or declaration parity after movement; source movement not released.
Report: docs/working/runtime-ownership-reset-plan/reports/rich-flow-contracts.md
Notes: Ready for Root source release. Source unchanged. No agents/git/broad tests run.
