import { automationStudioReadJudgeActionRef, type AutomationStudioJudgeActionRef } from "./action-ref.ts";

/** Temporal correspondence only. This never claims that a state's semantics prove the requested effect. */
export type AutomationStudioJudgeWitnessAssociation = { version: 1; before: AutomationStudioJudgeActionRef[]; after: AutomationStudioJudgeActionRef[] };

export function automationStudioReadJudgeWitnessAssociation(value: unknown): AutomationStudioJudgeWitnessAssociation | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const held = value as Record<string, unknown>;
  if (held.version !== 1 || Object.keys(held).some((key) => key !== "version" && key !== "before" && key !== "after")) return undefined;
  const result: AutomationStudioJudgeWitnessAssociation = { version: 1, before: [], after: [] };
  for (const side of ["before", "after"] as const) {
    if (!Array.isArray(held[side])) return undefined;
    for (const item of held[side]) {
      const ref = automationStudioReadJudgeActionRef(item);
      if (ref === undefined || result[side].some((entry) => entry.callId === ref.callId)) return undefined;
      result[side].push(ref);
    }
  }
  return result;
}
