import { AUTOMATION_STUDIO_EXPLORATION_OUTCOMES } from "./values.ts";
import type { AutomationStudioExplorationOutcome } from "./contract.ts";

export function isAutomationStudioExplorationOutcome(value: unknown): value is AutomationStudioExplorationOutcome {
  return typeof value === "string" && (AUTOMATION_STUDIO_EXPLORATION_OUTCOMES as readonly string[]).includes(value);
}
