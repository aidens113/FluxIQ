import type { AutomationStudioInstructionText, AutomationStudioInstructedActText, AutomationStudioInstructionReading } from "../../../../flows/executable/permissions/index.ts";
import { readAutomationStudioInstructedRead } from "../read.ts";
import { readAutomationStudioInstructionRoute } from "../route/index.ts";

export function readAutomationStudioInstructionReading(input: {
  result: unknown;
  instructions: readonly AutomationStudioInstructionText[];
  acts: readonly AutomationStudioInstructedActText[];
}): AutomationStudioInstructionReading {
  return { instructed: readAutomationStudioInstructedRead(input), route: readAutomationStudioInstructionRoute(input) };
}
