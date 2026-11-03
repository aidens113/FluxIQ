import { readAutomationStudioResolvedActionEffect } from "./read-resolved.ts";
import type { AutomationStudioResolvedActionEffect } from "./resolved.ts";

/** A trusted resolved floor is repeatable only with no committing consequence. */
export function automationStudioResolvedActionEffectRepeatSafe(effect: AutomationStudioResolvedActionEffect): boolean {
  const read = readAutomationStudioResolvedActionEffect(effect);
  return read.permissionConsequences.length === 0
    && (read.effectClass === "observe" || (read.effectClass === "state" && read.repeatSafe === true));
}
