// A completed instruction read, read two ways that never decide each other:
// the consequences the person's words ask for (`../instructed.ts`) and the
// route they name (`../instruction-route/read.ts`). A route Core cannot ground
// leaves every grounded consequence standing, and grounded consequences never
// make a missing route open.

import { readAutomationStudioInstructedRead, type AutomationStudioInstructedActText, type AutomationStudioInstructedRead, type AutomationStudioInstructionText } from "../instructed.ts";
import { readAutomationStudioInstructionRoute, type AutomationStudioInstructionRouteReading } from "../instruction-route/index.ts";

/** What one instruction read answered: the consequences as the permission gate holds them, and the route. */
export type AutomationStudioInstructionReading = { instructed: AutomationStudioInstructedRead; route: AutomationStudioInstructionRouteReading };

export function readAutomationStudioInstructionReading(input: {
  result: unknown;
  instructions: readonly AutomationStudioInstructionText[];
  acts: readonly AutomationStudioInstructedActText[];
}): AutomationStudioInstructionReading {
  return { instructed: readAutomationStudioInstructedRead(input), route: readAutomationStudioInstructionRoute(input) };
}
