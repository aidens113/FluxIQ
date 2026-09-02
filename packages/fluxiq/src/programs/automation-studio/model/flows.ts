import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { EvidenceReference, AutomationStudioSchemaVersion } from "./evidence.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "./artifacts.ts";
import type { AutomationStudioPublishedFlowSnapshot } from "./composites.ts";
import type { AutomationStudioFlowExpansionReferences } from "./flow-adaptation.ts";
import type { AutomationStudioFlowRegion, AutomationStudioFlowRegionHandoff } from "./regions.ts";

/** The workspace in which a canonical Flow is authored and may execute. */
export type AutomationStudioFlowScope =
  | { kind: "global" }
  | { kind: "domain"; domainId: string };

/** Public Flows are reusable composite-node candidates within their scope. */
export type AutomationStudioFlowVisibility = "private" | "public";

export type AutomationStudioFlowOrigin = "manual" | "recorded" | "imported" | "migrated";

/** Controls which authoring surface owns the canonical Flow definition. */
export type AutomationStudioFlowSource =
  | { mode: "visual" }
  | { mode: "code"; moduleId: string; sourceDigest?: string; compiledDigest?: string; compilerVersion?: string; declaredDependencies?: string[] };

export const AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION = 1;
export type AutomationStudioInterventionMode = "fully_adaptive" | "manual_approval" | "no_llm_intervention";

export function automationStudioInterventionMode(metadata: JsonObject | undefined): AutomationStudioInterventionMode {
  const source = metadata ?? {};
  if (source.adaptationModeVersion === AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION) {
    const current = source.adaptationMode;
    if (current === "fully_adaptive" || current === "manual_approval" || current === "no_llm_intervention") return current;
  }
  const training = isJsonObject(source.trainingModeSettings) ? source.trainingModeSettings : {};
  const adaptation = isJsonObject(source.adaptationPolicySettings) ? source.adaptationPolicySettings : {};
  const trainingMode = training.mode ?? source.trainingMode;
  const preset = adaptation.preset;
  const approval = adaptation.proposalMode ?? training.proposalApprovalMode ?? source.proposalApprovalMode ?? source.proposalMode;
  if (trainingMode === "normal" || preset === "locked" || approval === "disabled" || approval === "deterministic") return "no_llm_intervention";
  if (approval === "manual" || approval === "mixed" || approval === "manual_approval" || preset === "observe" || preset === "repair") return "manual_approval";
  return "fully_adaptive";
}

export function withAutomationStudioInterventionMode(metadata: JsonObject | undefined, mode: AutomationStudioInterventionMode): JsonObject {
  const source = metadata ?? {};
  const training = isJsonObject(source.trainingModeSettings) ? source.trainingModeSettings : {};
  const adaptation = isJsonObject(source.adaptationPolicySettings) ? source.adaptationPolicySettings : {};
  const enabled = mode !== "no_llm_intervention";
  const manual = mode === "manual_approval";
  return {
    ...source,
    adaptationModeVersion: AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION,
    adaptationMode: mode,
    trainingMode: enabled ? "continuous_adaptive" : "normal",
    proposalMode: manual ? "manual" : enabled ? "auto" : "manual",
    proposalApprovalMode: manual ? "manual" : enabled ? "auto" : "manual",
    trainingModeSettings: {
      ...training,
      mode: enabled ? "continuous_adaptive" : "normal",
      allowLlmIntervention: enabled,
      allowAdaptationCreation: enabled,
      proposalApprovalMode: manual ? "manual" : enabled ? "auto" : "manual",
      allowPromotion: mode === "fully_adaptive"
    },
    adaptationPolicySettings: {
      ...adaptation,
      preset: enabled ? "adaptive" : "locked",
      proposalMode: manual ? "manual" : enabled ? "auto" : "manual",
      allowRuntimeRecovery: enabled,
      allowCreateRecoveryPaths: enabled,
      allowModifySubflows: enabled,
      allowCreateSubflows: enabled,
      allowModifyRouter: enabled,
      allowModifyExpectations: enabled,
      allowModifyActionTargets: enabled
    }
  };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type AutomationStudioFlowValueType =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "json" }
  | { kind: "unknown" }
  | { kind: "array"; item: AutomationStudioFlowValueType }
  | { kind: "record"; properties?: Record<string, AutomationStudioFlowValueType>; additionalProperties?: boolean }
  | { kind: "schema"; schemaId: string; schemaVersion?: string };

export type AutomationStudioFlowPort = {
  id: string;
  name: string;
  valueType: AutomationStudioFlowValueType;
  description?: string;
  required?: boolean;
  defaultValue?: JsonValue;
  metadata?: JsonObject;
};

export type AutomationStudioFlowInterface = {
  inputs: AutomationStudioFlowPort[];
  outputs: AutomationStudioFlowPort[];
};

export type AutomationStudioFlowErrorDefinition = {
  id: string;
  description?: string;
  metadata?: JsonObject;
};

export type AutomationStudioFlowVariable = {
  id: string;
  name: string;
  valueType: AutomationStudioFlowValueType;
  initialValue?: JsonValue;
  description?: string;
  metadata?: JsonObject;
};

export type AutomationStudioFlowExecutionDefaults = {
  timeoutMs?: number;
  maxConcurrency?: number;
  /** Explicit domain grants required for a global Flow to call a domain Flow. */
  authorizedDomainIds?: string[];
  metadata?: JsonObject;
};

export type AutomationStudioFlowPublication =
  | { status: "draft" }
  | { status: "publishable" }
  | {
    status: "published" | "deprecated";
    version: string;
    publishedAt: number;
    interface: AutomationStudioFlowInterface;
    flowDigest: string;
    /** Immutable graph/interface snapshot used by pinned composite callers. */
    snapshot?: AutomationStudioPublishedFlowSnapshot;
  };

/** Retains source identity when a legacy task or routine is later adapted/migrated. */
export type AutomationStudioFlowLegacyProvenance = {
  kind: "task" | "routine";
  artifactId: string;
  flowId?: string;
};

/**
 * Canonical, owner-independent Flow artifact for new authoring surfaces.
 *
 * It deliberately coexists with AutomationStudioFlowDocument while legacy
 * task/routine compatibility is implemented in the next migration slice.
 */
export type AutomationStudioFlowArtifact = {
  schemaVersion: AutomationStudioSchemaVersion;
  flowId: string;
  projectId: string;
  name: string;
  description?: string;
  scope: AutomationStudioFlowScope;
  visibility: AutomationStudioFlowVisibility;
  origin: AutomationStudioFlowOrigin;
  source: AutomationStudioFlowSource;
  interface: AutomationStudioFlowInterface;
  errors: AutomationStudioFlowErrorDefinition[];
  variables: AutomationStudioFlowVariable[];
  regions?: AutomationStudioFlowRegion[];
  regionHandoffs?: AutomationStudioFlowRegionHandoff[];
  nodes: AutomationStudioFlowNode[];
  edges: AutomationStudioFlowEdge[];
  executionDefaults?: AutomationStudioFlowExecutionDefaults;
  publication: AutomationStudioFlowPublication;
  /** Append-only snapshots. `publication` remains the current compatibility view. */
  publicationHistory?: AutomationStudioPublishedFlowSnapshot[];
  evidenceReferences?: EvidenceReference[];
  expansion?: AutomationStudioFlowExpansionReferences;
  legacyProvenance?: AutomationStudioFlowLegacyProvenance;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export function defaultAutomationStudioFlowSettingsMetadata(): JsonObject {
  const trainingModeSettings = {
    mode: "continuous_adaptive",
    trainForRunCount: 3,
    minimumStabilityScore: 0.9,
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    requireFirstManualReviewBeforeAutoPromotion: false,
    recoveryBudget: {
      maxRetriesPerAction: 1,
      maxRecoveryAttemptsPerSubflow: 2,
      maxReroutesPerRun: 2
    },
    budgets: {
      maxInterventionsPerRun: 2,
      maxTokensPerRun: 12000,
      maxCostUsdPerTrainingWindow: 5,
      exhaustedBehavior: "ask"
    }
  };
  const adaptationPolicySettings = {
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    maxInterventionsPerRun: 3,
    maxEstimatedCostUsdPerRun: 1
  };
  return {
    adaptationModeVersion: AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION,
    adaptationMode: "fully_adaptive",
    trainingMode: trainingModeSettings.mode,
    proposalMode: trainingModeSettings.proposalApprovalMode,
    proposalApprovalMode: trainingModeSettings.proposalApprovalMode,
    trainingModeSettings,
    adaptationPolicySettings,
    llmProvider: "host",
    adaptationPolicyId: "policy.default",
    budgetExhaustedBehavior: "ask",
    frozenScopeCount: 0
  };
}

export type AutomationStudioFlowMigrationOutcome = {
  legacyKind: "task" | "routine";
  legacyArtifactId: string;
  flowId: string;
  status: "created" | "already_migrated" | "blocked";
  message?: string;
  canonicalUpdatedAt?: number;
  canonicalDigest?: string;
};

/** Durable audit record for an explicit, non-destructive legacy Flow migration. */
export type AutomationStudioFlowMigrationLedger = {
  schemaVersion: "0.1";
  migrationId: string;
  backupId: string;
  projectId: string;
  status: "completed" | "partial";
  outcomes: AutomationStudioFlowMigrationOutcome[];
  createdAt: number;
  updatedAt: number;
  rolledBackAt?: number;
};

export function createBlankAutomationStudioFlowArtifact(input: {
  flowId: string;
  projectId: string;
  name: string;
  scope?: AutomationStudioFlowScope;
  description?: string;
  origin?: AutomationStudioFlowOrigin;
  source?: AutomationStudioFlowSource;
  now?: number;
  metadata?: JsonObject;
}): AutomationStudioFlowArtifact {
  const now = input.now ?? Date.now();
  return {
    schemaVersion: "0.1",
    flowId: input.flowId,
    projectId: input.projectId,
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    scope: input.scope ?? { kind: "global" },
    visibility: "private",
    origin: input.origin ?? "manual",
    source: input.source ?? { mode: "visual" },
    interface: { inputs: [], outputs: [] },
    errors: [],
    variables: [],
    nodes: [],
    edges: [],
    publication: { status: "draft" },
    createdAt: now,
    updatedAt: now,
    metadata: { ...defaultAutomationStudioFlowSettingsMetadata(), ...(input.metadata ?? {}) }
  };
}
