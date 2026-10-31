import { automationStudioConsequencesInOrder } from "../../model/action-consequences/index.ts";
import { readAutomationStudioResolvedActionEffect } from "./read-resolved.ts";
import type { AutomationStudioResolvedActionEffect } from "./resolved.ts";

/** The union of trusted floors; no matching declaration remains absent. */
export function combineAutomationStudioResolvedActionEffects(
  effects: readonly (AutomationStudioResolvedActionEffect | undefined)[]
): AutomationStudioResolvedActionEffect | undefined {
  const known = effects.filter((effect) => effect !== undefined).map(readAutomationStudioResolvedActionEffect);
  if (!known.length) return undefined;
  const combined: AutomationStudioResolvedActionEffect = {
    effectClass: known.some((effect) => effect.effectClass === "commit") ? "commit" : known.some((effect) => effect.effectClass === "state") ? "state" : "observe",
    permissionConsequences: automationStudioConsequencesInOrder(known.flatMap((effect) => effect.permissionConsequences))
  };
  const stateFloors = known.filter((effect) => effect.effectClass === "state");
  if (combined.effectClass !== "commit" && known.some((effect) => effect.repeatSafe === true) && stateFloors.every((effect) => effect.repeatSafe === true)) combined.repeatSafe = true;
  return combined;
}
