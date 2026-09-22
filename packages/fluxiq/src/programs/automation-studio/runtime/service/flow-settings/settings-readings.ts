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

export function trainingModeValue(value: unknown): AutomationStudioTrainingModeSettings["mode"] {
  return value === "train_for_runs" || value === "train_until_stable" || value === "continuous_adaptive" ? value : "normal";
}

export function approvalModeValue(value: unknown): AutomationStudioTrainingModeSettings["proposalApprovalMode"] {
  return value === "manual" || value === "mixed" ? value : "auto";
}

export function adaptationPolicyPresetValue(value: unknown): AutomationStudioAdaptationPolicy["preset"] {
  return value === "locked" || value === "observe" || value === "repair" || value === "autonomous" ? value : "adaptive";
}
