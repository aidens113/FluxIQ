import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";
import { finiteNumber } from "../scalar-readings/index.ts";
import { adaptationPolicyPresetValue, approvalModeValue, booleanSetting, stringSetting } from "./settings-readings.ts";

// The adaptation policy a Flow's own metadata describes, for a Flow with no
// separately stored policy.

export function adaptationPolicyFromFlowMetadata(flow: AutomationStudioFlowArtifact, metadata: JsonObject): AutomationStudioAdaptationPolicy {
  const settings = jsonObjectFromUnknown(metadata.adaptationPolicySettings) ?? {};
  const now = flow.updatedAt ?? Date.now();
  const maxInterventionsPerRun = finiteNumber(settings.maxInterventionsPerRun);
  const maxEstimatedCostUsdPerRun = finiteNumber(settings.maxEstimatedCostUsdPerRun);
  return {
    schemaVersion: "0.1",
    policyId: stringSetting(metadata.adaptationPolicyId, "policy.default"),
    scope: { kind: "flow", flowId: flow.flowId },
    preset: adaptationPolicyPresetValue(settings.preset),
    proposalMode: approvalModeValue(settings.proposalMode ?? metadata.proposalApprovalMode ?? metadata.proposalMode),
    allowRuntimeRecovery: booleanSetting(settings.allowRuntimeRecovery, true),
    allowCreateRecoveryPaths: booleanSetting(settings.allowCreateRecoveryPaths, true),
    allowModifySubflows: booleanSetting(settings.allowModifySubflows, true),
    allowCreateSubflows: booleanSetting(settings.allowCreateSubflows, true),
    allowModifyRouter: booleanSetting(settings.allowModifyRouter, true),
    allowModifyExpectations: booleanSetting(settings.allowModifyExpectations, true),
    allowModifyActionTargets: booleanSetting(settings.allowModifyActionTargets, true),
    allowDeleteOrDisableBehavior: booleanSetting(settings.allowDeleteOrDisableBehavior, false),
    allowExternalSideEffects: booleanSetting(settings.allowExternalSideEffects, false),
    requireApprovalForDestructiveChanges: booleanSetting(settings.requireApprovalForDestructiveChanges, true),
    requireApprovalForExternalSideEffects: booleanSetting(settings.requireApprovalForExternalSideEffects, true),
    ...(maxInterventionsPerRun !== undefined ? { maxInterventionsPerRun } : {}),
    ...(maxEstimatedCostUsdPerRun !== undefined ? { maxEstimatedCostUsdPerRun } : {}),
    createdAt: flow.createdAt,
    updatedAt: now,
    metadata: {
      source: "flow.metadata",
      ...(stringSetting(metadata.llmProvider, "") ? { llmProvider: stringSetting(metadata.llmProvider, "") } : {})
    }
  };
}
