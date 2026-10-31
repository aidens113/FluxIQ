import { parseAutomationStudioPermittedConsequences } from "../../model/action-consequences/index.ts";
import type { AutomationStudioResolvedActionEffect } from "./resolved.ts";

/**
 * Checks a resolved contract's shape; it establishes no authority. Only a
 * trusted client definition or callback may supply the value used as a floor.
 * Unknown consequence classes refuse the whole contract, never erase a floor.
 */
export function readAutomationStudioResolvedActionEffect(value: unknown): AutomationStudioResolvedActionEffect {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Action effect must be a resolved contract.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "effectClass" && key !== "permissionConsequences")) throw new Error("Resolved action effect has an unknown field.");
  if (record.effectClass !== "observe" && record.effectClass !== "state" && record.effectClass !== "commit") throw new Error("Action effect class is not recognised.");
  if (!Array.isArray(record.permissionConsequences)) throw new Error("Resolved action effect must declare its permission consequences.");
  // Materialise every slot so a sparse list cannot hide an unknown value.
  const permissionConsequences = parseAutomationStudioPermittedConsequences([...record.permissionConsequences]);
  return {
    effectClass: permissionConsequences.length ? "commit" : record.effectClass,
    permissionConsequences
  };
}
