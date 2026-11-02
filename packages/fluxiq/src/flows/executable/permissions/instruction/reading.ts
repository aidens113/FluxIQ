import type { AutomationStudioInstructedRead } from "./read.ts";
import type { AutomationStudioInstructionRouteReading } from "./route/index.ts";

/** What one instruction read answered: the consequences as the permission gate holds them, and the route. */
export type AutomationStudioInstructionReading = { instructed: AutomationStudioInstructedRead; route: AutomationStudioInstructionRouteReading };
