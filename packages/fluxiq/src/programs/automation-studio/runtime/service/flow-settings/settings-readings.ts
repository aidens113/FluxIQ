import type { AutomationStudioAdaptationPolicy } from "../../../model/index.ts";
import type { AutomationStudioTrainingModeSettings } from "../../training-modes.ts";

// Reading one stored Flow setting: the value when it is one the contract
// allows, and the documented default when it is not.

export function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function stringSetting(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * The fallback is `continuous_adaptive`, not `normal`: `normal` refuses
 * `invokeLlm` and `createAdaptations` outright whatever the allow flags say
 * (`training-modes.ts`), so a Flow that simply never wrote a mode could not
 * repair itself. Silence is not a person asking for a Flow that cannot adapt;
 * writing `"normal"` is, and that is still read and still honoured.
 */
export function trainingModeValue(value: unknown): AutomationStudioTrainingModeSettings["mode"] {
  return value === "train_for_runs" || value === "train_until_stable" || value === "normal" ? value : "continuous_adaptive";
}

export function approvalModeValue(value: unknown): AutomationStudioTrainingModeSettings["proposalApprovalMode"] {
  return value === "manual" || value === "mixed" ? value : "auto";
}

export function adaptationPolicyPresetValue(value: unknown): AutomationStudioAdaptationPolicy["preset"] {
  return value === "locked" || value === "observe" || value === "repair" || value === "autonomous" ? value : "adaptive";
}
