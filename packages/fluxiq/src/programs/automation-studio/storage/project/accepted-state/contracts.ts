import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowInstruction, AutomationStudioFlowRouter, AutomationStudioFlowSubflow } from "../../../model/index.ts";
import type { AutomationStudioSqlAdaptationPolicy, AutomationStudioSqlFlowDetail, AutomationStudioSqlFlowSettings, AutomationStudioSqlInstruction, AutomationStudioSqlInstructionBinding, AutomationStudioSqlRouter, AutomationStudioSqlSubflow, AutomationStudioSqlSubflowCategory } from "../flow-resource-repository.ts";

/** Explicit captured data. It is never an adopted authority over existing project data. */
export type AutomationStudioAcceptedProjectSnapshot = {
  schemaVersion: "staged_project_snapshot.v1";
  storageAuthority: "project_sql";
  project: { projectId: string; domainId: string; lifecycle: "present"; metadata: JsonObject };
  capture: { captureId: string; origin: "synthetic_fixture" | "explicit_snapshot"; compilerVersion: string; normalizerVersion: string; registryDigest: string };
  dependencyScope: { publications: "none"; global: "none"; crossProject: "none" };
  flows: Array<{ artifact: AutomationStudioFlowArtifact; resource: AutomationStudioSqlFlowDetail; settings: AutomationStudioSqlFlowSettings }>;
  routers: Array<{ artifact: AutomationStudioFlowRouter; resource: AutomationStudioSqlRouter }>;
  subflows: Array<{ artifact: AutomationStudioFlowSubflow; resource: AutomationStudioSqlSubflow }>;
  instructions: Array<{ artifact: AutomationStudioFlowInstruction; resource: AutomationStudioSqlInstruction }>;
  bindings: AutomationStudioSqlInstructionBinding[];
  categories: AutomationStudioSqlSubflowCategory[];
  policies: AutomationStudioSqlAdaptationPolicy[];
};
export type AutomationStudioAcceptedStateBinding = { projectId: string; epoch: string; generation: number; digest: string; state: "staged" | "tombstoned" };
export type AutomationStudioAcceptedStateVectorEntry = { kind: string; id: string; epoch: string; generation: number; digest: string };
export type AutomationStudioAcceptedStateTombstone = { schemaVersion: "staged_project_tombstone.v1"; previousBinding: AutomationStudioAcceptedStateBinding; reasonCode: string };
export type AutomationStudioAcceptedStateCurrent = {
  binding: AutomationStudioAcceptedStateBinding;
  productionAuthority: "unsupported";
  snapshot: AutomationStudioAcceptedProjectSnapshot | null;
  tombstone: AutomationStudioAcceptedStateTombstone | null;
  vector: AutomationStudioAcceptedStateVectorEntry[];
};
export type AutomationStudioAcceptedStateRequest =
  | { kind: "initial"; snapshot: AutomationStudioAcceptedProjectSnapshot }
  | { kind: "replace"; expectedBinding: AutomationStudioAcceptedStateBinding; snapshot: AutomationStudioAcceptedProjectSnapshot }
  | { kind: "tombstone"; expectedBinding: AutomationStudioAcceptedStateBinding; reasonCode: string };
export type AutomationStudioAcceptedStateMutationResult = { recordedBinding: AutomationStudioAcceptedStateBinding; requestDigest: string; replayed: boolean; productionAuthority: "unsupported" };
export type AutomationStudioAcceptedStateReconciliation =
  | { status: "committed"; result: AutomationStudioAcceptedStateMutationResult }
  | { status: "failed" }
  | { status: "outcome_unknown" };
