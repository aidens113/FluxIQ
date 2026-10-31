import type { AutomationStudioActionConsequence } from "./types.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "./values.ts";

/** Deduplicated, in the order `AUTOMATION_STUDIO_ACTION_CONSEQUENCES` lists them. */
export function automationStudioConsequencesInOrder(values: readonly AutomationStudioActionConsequence[]): AutomationStudioActionConsequence[] {
  const present = new Set(values);
  return AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => present.has(consequence));
}
