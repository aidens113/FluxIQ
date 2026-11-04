import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD } from "../../../../flows/authoring/model/index.ts";
import { AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY } from "../../../../runtime/answer-first/attempt-purse/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";
import { finiteNumber } from "../scalar-readings/index.ts";

/**
 * Records, in a Flow's `adaptationPolicySettings`, whether a person chose its cost limit, so an
 * attempt can tell a chosen $0.25 from the $0.25 a new Flow stores as a default.
 *
 * The settings form resends every field on each save, so a save that only changes another
 * setting carries the limit's stored value unchanged and must not mark it. The limit is marked
 * chosen when the patch changes its value, or when the patch names the marker itself
 * (`maxEstimatedCostUsdPerRunChosen: true`, which is how a person keeps exactly the $0.25 that is
 * already stored and shown; `false` clears it). Otherwise the stored marker is carried, because a
 * patch that rewrites `adaptationPolicySettings` whole would drop it.
 *
 * `merged` is the stored metadata with the patch over it, `current` the stored metadata alone.
 */
export function withAutomationStudioCostLimitChoice(merged: JsonObject, current: JsonObject | undefined, patch: Record<string, unknown>): JsonObject {
  const mergedSettings = jsonObjectFromUnknown(merged.adaptationPolicySettings);
  if (!mergedSettings) return merged;
  const patchSettings = jsonObjectFromUnknown(patch.adaptationPolicySettings);
  const currentSettings = jsonObjectFromUnknown(current?.adaptationPolicySettings);
  const named = patchSettings?.[AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY];
  const sent = finiteNumber(patchSettings?.maxEstimatedCostUsdPerRun);
  const stored = finiteNumber(currentSettings?.maxEstimatedCostUsdPerRun) ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD;
  const chosen = typeof named === "boolean" ? named : sent !== undefined && sent !== stored ? true : currentSettings?.[AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY] === true;
  const { [AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY]: _marker, ...rest } = mergedSettings;
  return { ...merged, adaptationPolicySettings: chosen ? { ...rest, [AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY]: true } : rest };
}
