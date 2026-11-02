import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../consequences.ts";
import { automationStudioDestructiveClassification } from "./classification.ts";

export function isAutomationStudioDestructiveActionConsequence(value: unknown): value is AutomationStudioActionConsequence {
  return AUTOMATION_STUDIO_ACTION_CONSEQUENCES.some((consequence) => consequence === value && automationStudioDestructiveClassification[consequence]);
}
