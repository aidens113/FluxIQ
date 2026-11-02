import { automationStudioConsequencesInOrder } from "./in-order.ts";
import { isAutomationStudioActionConsequence } from "./is-consequence.ts";
import type { AutomationStudioActionConsequence } from "./types.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "./values.ts";

/**
 * Absent permits nothing; any unknown value refuses the whole set. Kept
 * consequences are deduplicated in Core's display order.
 */
export function parseAutomationStudioPermittedConsequences(value: unknown): AutomationStudioActionConsequence[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length * 2) {
    throw new Error("Permitted consequences must be a list of consequence classes.");
  }
  const unrecognised = value.filter((item) => !isAutomationStudioActionConsequence(item));
  if (unrecognised.length) throw new Error("Permitted consequences name a class Core does not recognise.");
  return automationStudioConsequencesInOrder(value as AutomationStudioActionConsequence[]);
}
