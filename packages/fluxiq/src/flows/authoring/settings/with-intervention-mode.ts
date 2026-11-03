import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioInterventionMode } from "./intervention/index.ts";
import { isJsonObject } from "./internal/index.ts";
import { AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION } from "./intervention/index.ts";

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
