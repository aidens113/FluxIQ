import type { JsonValue } from "../../../../../core/index.ts";

export type AutomationStudioLlmEvidenceBatchStopReason = "refusal" | "effect_not_applied" | "targets_may_have_changed";

/** Why no later action authored from the earlier evidence may run. */
export function automationStudioLlmEvidenceBatchStopReason(input: {
  evidence: JsonValue;
  effect: "observe" | "mutate" | undefined;
  effectApplied: boolean;
  /** A caller translated its domain result into Core's refusal vocabulary. */
  refused?: boolean;
  targetsUnchanged?: boolean;
}): AutomationStudioLlmEvidenceBatchStopReason | undefined {
  if (input.refused === true || isRefusal(input.evidence)) return "refusal";
  if (input.effect !== "mutate") return undefined;
  if (!input.effectApplied) return "effect_not_applied";
  return input.targetsUnchanged === true ? undefined : "targets_may_have_changed";
}

function isRefusal(value: JsonValue): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && value.ok === false;
}
