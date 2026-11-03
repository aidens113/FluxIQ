import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioInterventionMode } from "./index.ts";
import { AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION } from "./version.ts";
import { isJsonObject } from "../internal/index.ts";

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
