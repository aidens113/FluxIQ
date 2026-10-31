import { automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "./consequences.ts";
import type { AutomationStudioActionEffect, AutomationStudioReadActionDeclaration } from "./declaration.ts";

/** A client's floor cannot be lowered by the legacy effect or model classes. */
export function automationStudioActionPermissionProjection(
  declaration: Pick<AutomationStudioReadActionDeclaration, "effect" | "consequences" | "actionEffect">
): { effect: AutomationStudioActionEffect; consequences: AutomationStudioActionConsequence[]; disregarded: AutomationStudioActionConsequence[] } {
  const floor = declaration.actionEffect;
  const named = automationStudioConsequencesInOrder([...declaration.consequences, ...(floor?.permissionConsequences ?? [])]);
  const observes = declaration.effect === "observe" && (floor === undefined || floor.effectClass === "observe") && !floor?.permissionConsequences.length;
  return {
    effect: observes ? "observe" : "mutate",
    consequences: observes ? [] : named,
    disregarded: observes ? named : []
  };
}
