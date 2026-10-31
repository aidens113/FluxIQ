import { readAutomationStudioResolvedActionEffect, type AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";
import type { AutomationStudioReadActionDeclaration } from "../declaration.ts";
import type { automationStudioActionPermissionProjection } from "../projection.ts";

/** Preserve the actual full client floor as well as the gate's effective classes. */
export function automationStudioActionAssessmentEffect(
  read: AutomationStudioReadActionDeclaration,
  projection: ReturnType<typeof automationStudioActionPermissionProjection>
): AutomationStudioResolvedActionEffect {
  const floor = read.actionEffect;
  const effectClass = projection.consequences.length || floor?.effectClass === "commit" ? "commit"
    : floor?.effectClass === "state" || projection.effect === "mutate" ? "state" : "observe";
  const effect: AutomationStudioResolvedActionEffect = {
    effectClass,
    permissionConsequences: projection.consequences
  };
  if (effectClass === "state" && floor?.effectClass === "state" && floor.repeatSafe === true) effect.repeatSafe = true;
  return readAutomationStudioResolvedActionEffect(effect);
}
