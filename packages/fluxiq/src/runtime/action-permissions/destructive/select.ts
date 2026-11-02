import { automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "../consequences.ts";
import { isAutomationStudioDestructiveActionConsequence } from "./predicate.ts";

/** Deduplicate the human-authority portion of a declaration in canonical order. */
export function automationStudioDestructiveConsequences(values: readonly AutomationStudioActionConsequence[]): AutomationStudioActionConsequence[] {
  return automationStudioConsequencesInOrder(values.filter(isAutomationStudioDestructiveActionConsequence));
}
