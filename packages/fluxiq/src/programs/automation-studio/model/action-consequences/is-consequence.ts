import type { AutomationStudioActionConsequence } from "./types.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "./values.ts";

export function isAutomationStudioActionConsequence(value: unknown): value is AutomationStudioActionConsequence {
  return typeof value === "string" && (AUTOMATION_STUDIO_ACTION_CONSEQUENCES as readonly string[]).includes(value);
}
