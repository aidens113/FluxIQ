import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING } from "./setting.ts";

/** Why a value cannot be the setting, or undefined when it can. */
export function automationStudioFlowSizeSettingIssue(value: unknown): string | undefined {
  const { path, minimum, maximum } = AUTOMATION_STUDIO_FLOW_SIZE_SETTING;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return `${path} must be a whole number.`;
  if (value < minimum || value > maximum) return `${path} must be between ${minimum} and ${maximum}.`;
  return undefined;
}
