import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../consequences.ts";
import { automationStudioDestructiveClassification } from "./classification.ts";

export const AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES: readonly AutomationStudioActionConsequence[] =
  Object.freeze(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => automationStudioDestructiveClassification[consequence]));
