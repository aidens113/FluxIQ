// The Flow limit an attempt's purse honours, or nothing. Other modes read the stored
// `maxEstimatedCostUsdPerRun` as it is; only the attempt asks whether it was meant.

import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD } from "../../../flows/authoring/model/index.ts";
import { AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY } from "./cost-limit-chosen-key.ts";

/**
 * A Flow's limit is explicit when a person marked it chosen, or when it is not the old default
 * value (a Flow stored with another value was set on purpose, and so is the Lab's test-scoped
 * Flow ceiling). Anything else, including a stored $0.25 with no marker, answers `undefined`.
 * Reads the Flow's settings metadata; an older record with no marker reads like any other.
 */
export function automationStudioAnswerFirstExplicitLimitUsd(flowSettings: Readonly<Record<string, unknown>> | undefined): number | undefined {
  const policy = flowSettings?.adaptationPolicySettings;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return undefined;
  const settings = policy as Record<string, unknown>;
  const value = settings.maxEstimatedCostUsdPerRun;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return settings[AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY] === true || value !== AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD ? value : undefined;
}
