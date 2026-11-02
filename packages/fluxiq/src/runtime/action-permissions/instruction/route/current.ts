import type { AutomationStudioInstructionRouteReading, AutomationStudioInstructionText } from "../../../../flows/executable/permissions/index.ts";
import { automationStudioInstructionSetDigest } from "./set-digest.ts";

export function currentAutomationStudioInstructionRoute(input: {
  reading: AutomationStudioInstructionRouteReading;
  activeInstructions: readonly AutomationStudioInstructionText[];
}): AutomationStudioInstructionRouteReading {
  const { reading } = input;
  if (reading.state !== "named" && reading.state !== "open") return reading;
  return automationStudioInstructionSetDigest(input.activeInstructions) === reading.instructionSetDigest
    ? reading
    : { state: "unavailable", reason: "stale", instructionSetDigest: reading.instructionSetDigest };
}
